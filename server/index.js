'use strict';
/**
 * 《新月再梦听羽生》哥伦比娅生日会 —— 报名投稿后端（前后端分离，纯 Node + MySQL）。
 *
 * 只提供 JSON API，静态页面由 nginx 直接托管；线上 nginx 用 `location ^~ /api/`
 * 反代到本进程（默认 127.0.0.1:8788）。
 *
 * 主要接口：
 *   GET    /api/health
 *   POST   /api/uploads                      新建分片上传会话
 *   GET    /api/uploads/:id                  查询已收到的分片（断点续传用）
 *   PUT    /api/uploads/:id/chunk/:index     上传单个分片（application/octet-stream）
 *   POST   /api/uploads/:id/complete         合并分片
 *   POST   /api/submissions                  提交投稿
 *   GET    /api/submissions/:id              查询投稿回执
 *   GET    /api/admin/submissions            管理端列表（需 ?tk=<adminSecret>）
 *   GET    /api/admin/submissions/:id        管理端详情
 *   GET    /api/admin/files/:id              下载附件
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./lib/db');
const up = require('./lib/upload');
const { validateSubmission } = require('./lib/validate');

const cfg = db.loadConfig();
const ROOT = __dirname;
const DATA_DIR = path.isAbsolute(cfg.dataDir || 'data')
  ? cfg.dataDir
  : path.join(ROOT, cfg.dataDir || 'data');

const PORT = Number(process.env.PORT || cfg.port || 8788);
const HOST = cfg.host || '127.0.0.1';
const MB = 1024 * 1024;
const MAX_FILE_BYTES = Number(cfg.maxFileMB || 2048) * MB;
const DEFAULT_CHUNK = Number(cfg.defaultChunkMB || 4) * MB;
const MAX_CHUNK = Number(cfg.maxChunkMB || 16) * MB;
const MIN_CHUNK = Number(cfg.minChunkKB || 256) * 1024;
const PUBLIC_BASE = (cfg.publicBaseUrl || '').replace(/\/+$/, '');

/* ------------------------------------------------------------ 小工具 */

function json(res, code, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  const allow = Array.isArray(cfg.corsOrigins) ? cfg.corsOrigins : [];
  if (origin && allow.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || '';
}

function readJsonBody(req, limit = 2 * MB) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (d) => {
      size += d.length;
      if (size > limit) {
        const e = new Error('body too large');
        e.code = 413;
        reject(e);
        req.destroy();
        return;
      }
      parts.push(d);
    });
    req.on('end', () => {
      const raw = Buffer.concat(parts).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { const err = new Error('invalid json'); err.code = 400; reject(err); }
    });
    req.on('error', reject);
  });
}

function readAdminSecret() {
  try { return db.readAdminSecret(cfg); } catch (e) { return ''; }
}

function isAdmin(req, url) {
  const want = readAdminSecret();
  if (!want) return false;
  const got = url.searchParams.get('tk') || req.headers['x-admin-key'] || '';
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/* MySQL 的 JSON 列经 mysql2 回来已经是对象，兼容字符串与 null 两种情况 */
function asArray(v) {
  if (v === null || v === undefined) return []
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) { return [] }
  }
  return Array.isArray(v) ? v : []
}

function maskContact(type, value) {
  const v = String(value || '');
  if (type === 'email' && v.includes('@')) {
    const [a, b] = v.split('@');
    return `${a.slice(0, 2)}***@${b}`;
  }
  if (v.length <= 4) return v[0] + '***';
  return `${v.slice(0, 2)}***${v.slice(-2)}`;
}

/* ------------------------------------------------------------ 业务 */

async function handleUploadsCreate(req, res) {
  const body = await readJsonBody(req);
  const originalName = String(body.fileName || '').trim().slice(0, 200);
  const size = Number(body.size || 0);
  const mime = String(body.mime || '').slice(0, 150) || null;
  if (!originalName) return json(res, 400, { ok: false, error: '缺少文件名' });
  if (!Number.isFinite(size) || size <= 0) return json(res, 400, { ok: false, error: '文件大小不合法' });
  if (size > MAX_FILE_BYTES) {
    return json(res, 413, { ok: false, error: `单个文件不能超过 ${Math.round(MAX_FILE_BYTES / MB)} MB` });
  }
  let chunkSize = Number(body.chunkSize || 0) || DEFAULT_CHUNK;
  chunkSize = Math.min(Math.max(chunkSize, MIN_CHUNK), MAX_CHUNK);

  const id = up.newId();
  const chunksTotal = Math.max(1, Math.ceil(size / chunkSize));
  if (chunksTotal > 20000) return json(res, 413, { ok: false, error: '分片数量过多' });

  await db.createUpload({ id, originalName, size, mime, chunkSize, chunksTotal });
  up.initDirs(DATA_DIR);
  return json(res, 201, {
    ok: true, uploadId: id, chunkSize, chunksTotal, received: [], fileName: originalName, size,
  });
}

async function handleUploadStatus(req, res, id) {
  const row = await db.getUpload(id);
  if (!row) return json(res, 404, { ok: false, error: '上传会话不存在或已过期', expired: true });
  const received = up.receivedChunks(DATA_DIR, id);
  const uploaded = received.reduce((sum, i) => {
    if (i < row.chunks_total - 1) return sum + row.chunk_size;
    return sum + (row.size - row.chunk_size * (row.chunks_total - 1));
  }, 0);
  return json(res, 200, {
    ok: true,
    uploadId: id,
    fileName: row.original_name,
    size: Number(row.size),
    chunkSize: row.chunk_size,
    chunksTotal: row.chunks_total,
    received,
    uploadedBytes: Math.max(0, Math.min(uploaded, Number(row.size))),
    state: row.state,
  });
}

async function handleUploadChunk(req, res, id, index) {
  const row = await db.getUpload(id);
  if (!row) return json(res, 404, { ok: false, error: '上传会话不存在或已过期', expired: true });
  if (row.state !== 'open') return json(res, 409, { ok: false, error: '该上传已完成' });
  if (!Number.isInteger(index) || index < 0 || index >= row.chunks_total) {
    return json(res, 400, { ok: false, error: '分片序号越界' });
  }
  try {
    await up.writeChunk(DATA_DIR, id, index, req, row.chunk_size + 1024);
  } catch (e) {
    if (e && e.code === 413) return json(res, 413, { ok: false, error: '分片过大' });
    return json(res, 500, { ok: false, error: '分片写入失败' });
  }
  await db.touchUpload(id);
  const received = up.receivedChunks(DATA_DIR, id);
  return json(res, 200, { ok: true, index, receivedCount: received.length, chunksTotal: row.chunks_total });
}

async function handleUploadComplete(req, res, id) {
  const row = await db.getUpload(id);
  if (!row) return json(res, 404, { ok: false, error: '上传会话不存在或已过期', expired: true });
  /* 已经合并过的会话直接回执（重复点完成 / 网络重试） */
  if (row.state === 'done') {
    const f = await db.getFile(id);
    if (f) return json(res, 200, { ok: true, fileId: id, fileName: f.original_name, size: Number(f.size) });
  }
  const received = up.receivedChunks(DATA_DIR, id);
  const missing = [];
  for (let i = 0; i < row.chunks_total; i++) if (!received.includes(i)) missing.push(i);
  if (missing.length) {
    return json(res, 409, { ok: false, error: '分片不完整', missing, received });
  }
  let merged;
  try {
    merged = await up.mergeChunks(DATA_DIR, id, row.chunks_total, row.original_name);
  } catch (e) {
    return json(res, 500, { ok: false, error: '分片合并失败' });
  }
  await db.insertFile({
    id,
    originalName: row.original_name,
    storedPath: merged.stored,
    size: merged.size,
    mime: row.mime,
  });
  await db.touchUpload(id, 'done');
  return json(res, 200, { ok: true, fileId: id, fileName: row.original_name, size: merged.size });
}

async function handleSubmit(req, res) {
  const body = await readJsonBody(req, 4 * MB);
  const { ok, errors, value } = validateSubmission(body);
  if (!ok) return json(res, 400, { ok: false, error: '表单校验未通过', errors });

  const ip = clientIp(req);
  const perHour = Number(cfg.submitPerHour || 0);
  if (perHour > 0) {
    const since = new Date(Date.now() - 3600 * 1000);
    const recent = await db.countRecentSubmissions(ip, since);
    if (recent >= perHour) {
      return json(res, 429, { ok: false, error: '提交过于频繁，请稍后再试' });
    }
  }

  /* 附件必须都是已完成的上传，且未被其它投稿占用 */
  const files = [];
  for (const fid of value.fileIds) {
    const f = await db.getFile(fid);
    if (!f || f.submission_id) {
      return json(res, 400, { ok: false, errors: { fileIds: '附件不存在或已被使用，请重新上传' } });
    }
    files.push(f);
  }

  const id = up.newId();
  await db.insertSubmission({
    id,
    contact_type: value.contactType,
    contact_value: value.contactValue,
    nicknames: value.nicknames,
    creation_type: value.creationType,
    team_members: value.teamMembers.length ? JSON.stringify(value.teamMembers) : null,
    title: value.title,
    category: value.category,
    intro: value.intro,
    duration: value.duration,
    has_other_chars: value.hasOtherCharacters ? 1 : 0,
    other_chars: value.otherCharacters.length ? JSON.stringify(value.otherCharacters) : null,
    progress: value.progress,
    preview_type: value.previewType,
    preview_link: value.previewLink,
    agreed: 1,
    ip,
    ua: String(req.headers['user-agent'] || '').slice(0, 480),
    created_at: db.now(),
  });
  await db.attachFiles(id, value.fileIds);

  return json(res, 201, {
    ok: true,
    id,
    title: value.title,
    createdAt: new Date().toISOString(),
    maskedContact: maskContact(value.contactType, value.contactValue),
    files: files.map((f) => ({ id: f.id, name: f.original_name, size: Number(f.size) })),
  });
}

async function handleSubmissionReceipt(req, res, id) {
  const row = await db.getSubmission(id);
  if (!row) return json(res, 404, { ok: false, error: '投稿不存在' });
  const files = await db.filesOf(id);
  return json(res, 200, {
    ok: true,
    id: row.id,
    title: row.title,
    category: row.category,
    createdAt: row.created_at,
    files: files.map((f) => ({ name: f.original_name, size: Number(f.size) })),
  });
}

function rowToJson(row, withContact) {
  const out = {
    id: row.id,
    title: row.title,
    category: row.category,
    duration: row.duration,
    intro: row.intro,
    progress: row.progress,
    creationType: row.creation_type,
    teamMembers: asArray(row.team_members),
    nicknames: row.nicknames,
    hasOtherCharacters: !!row.has_other_chars,
    otherCharacters: asArray(row.other_chars),
    previewType: row.preview_type,
    previewLink: row.preview_link,
    agreed: !!row.agreed,
    createdAt: row.created_at,
  };
  if (withContact) {
    out.contactType = row.contact_type;
    out.contactValue = row.contact_value;
    out.ip = row.ip;
    out.ua = row.ua;
  } else {
    out.contact = `${row.contact_type} / ${maskContact(row.contact_type, row.contact_value)}`;
  }
  return out;
}

async function handleAdminList(req, res, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  const rows = await db.listSubmissions(limit, offset);
  const total = await db.countSubmissions();
  const items = [];
  for (const r of rows) {
    const files = await db.filesOf(r.id);
    items.push({
      ...rowToJson(r, true),
      files: files.map((f) => ({ id: f.id, name: f.original_name, size: Number(f.size) })),
    });
  }
  return json(res, 200, { ok: true, total, limit, offset, items });
}

async function handleAdminDetail(req, res, id) {
  const row = await db.getSubmission(id);
  if (!row) return json(res, 404, { ok: false, error: '投稿不存在' });
  const files = await db.filesOf(id);
  return json(res, 200, {
    ok: true,
    item: {
      ...rowToJson(row, true),
      files: files.map((f) => ({ id: f.id, name: f.original_name, size: Number(f.size) })),
    },
  });
}

async function handleAdminFile(req, res, id) {
  const f = await db.getFile(id);
  if (!f || !f.stored_path) return json(res, 404, { ok: false, error: '附件不存在' });
  let st;
  try { st = await up.statFile(f.stored_path); } catch (e) { return json(res, 404, { ok: false, error: '附件文件已丢失' }); }
  res.writeHead(200, {
    'Content-Type': f.mime || 'application/octet-stream',
    'Content-Length': st.size,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.original_name)}`,
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(f.stored_path).pipe(res);
}

/* ------------------------------------------------------------ 路由 */

const ROUTES = [
  ['GET', /^\/api\/health\/?$/, async (req, res) => json(res, 200, { ok: true, service: 'columbina-birthday', time: new Date().toISOString() })],
  ['POST', /^\/api\/uploads\/?$/, handleUploadsCreate],
  ['GET', /^\/api\/uploads\/([a-f0-9]{32})\/?$/, async (req, res, m) => handleUploadStatus(req, res, m[1])],
  ['PUT', /^\/api\/uploads\/([a-f0-9]{32})\/chunk\/(\d+)\/?$/, async (req, res, m) => handleUploadChunk(req, res, m[1], Number(m[2]))],
  ['POST', /^\/api\/uploads\/([a-f0-9]{32})\/complete\/?$/, async (req, res, m) => handleUploadComplete(req, res, m[1])],
  ['POST', /^\/api\/submissions\/?$/, handleSubmit],
  ['GET', /^\/api\/submissions\/([a-f0-9]{32})\/?$/, async (req, res, m) => handleSubmissionReceipt(req, res, m[1])],
  ['GET', /^\/api\/admin\/submissions\/?$/, async (req, res, m, url) => handleAdminList(req, res, url)],
  ['GET', /^\/api\/admin\/submissions\/([a-f0-9]{32})\/?$/, async (req, res, m) => handleAdminDetail(req, res, m[1])],
  ['GET', /^\/api\/admin\/files\/([a-f0-9]{32})\/?$/, async (req, res, m) => handleAdminFile(req, res, m[1])],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    for (const [method, re, fn] of ROUTES) {
      const m = re.exec(p);
      if (!m) continue;
      if (req.method !== method) continue;
      if (p.startsWith('/api/admin/') && !isAdmin(req, url)) {
        return json(res, 403, { ok: false, error: '需要管理秘钥' });
      }
      return await fn(req, res, m, url);
    }
    return json(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    const code = e && e.code && Number.isInteger(e.code) ? e.code : 500;
    if (code >= 500) console.error('[error]', req.method, p, e && e.stack || e);
    return json(res, code, { ok: false, error: code === 413 ? '请求体过大' : '服务器内部错误' });
  }
});

/* ------------------------------------------------------------ 启动 */

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  up.initDirs(DATA_DIR);
  await db.init();
  const retentionDays = Number(cfg.retentionDays || 7);
  const sweep = async () => {
    try {
      const r = await up.cleanup(DATA_DIR, retentionDays * 86400 * 1000);
      const stale = await db.staleUploads(new Date(Date.now() - retentionDays * 86400 * 1000));
      for (const s of stale) if (s.state === 'open') await db.dropUpload(s.id);
      if (r.removedTmp) console.log(`[cleanup] 清理过期分片目录 ${r.removedTmp} 个`);
    } catch (e) {
      console.error('[cleanup] 失败', e && e.message);
    }
  };
  await sweep();
  setInterval(sweep, 6 * 3600 * 1000);

  server.listen(PORT, HOST, () => {
    console.log(`columbina-birthday api listening on http://${HOST}:${PORT}${PUBLIC_BASE || ''}`);
  });
}

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });

main().catch((e) => {
  console.error('启动失败：', e);
  process.exit(1);
});
