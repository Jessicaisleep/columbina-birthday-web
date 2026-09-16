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
const auth = require('./lib/auth');
const { validateSubmission } = require('./lib/validate');

const cfg = db.loadConfig();
/* 内置超级管理员：不可删除（用户名取自 config.initAdmin，默认 admin） */
const PROTECTED_ADMIN = String((cfg.initAdmin && cfg.initAdmin.username) || 'admin');
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

/* 口令可查看副本用的服务器密钥（首次运行自动生成，600）。丢了只影响查看，不影响登录。 */
let SECRET_KEY = null;
function keyFilePath() {
  const f = cfg.secretKeyFile || 'data/secret.key';
  return path.isAbsolute(f) ? f : path.join(ROOT, f);
}

/**
 * 管理端鉴权：
 * - 配置里的总秘钥（adminSecretFile）→ 视为 super，供运维/脚本使用
 * - 登录后拿到的会话串（请求头 X-Admin-Key，或 ?tk= 兼容写法）→ 按库里的角色
 * 返回 { ok, role, username, viaMaster, tk }
 */
async function resolveAuth(req, url) {
  const got = String(url.searchParams.get('tk') || req.headers['x-admin-key'] || '');
  if (!got) return { ok: false };

  const master = readAdminSecret();
  if (master && auth.sameSecret(got, master)) {
    return { ok: true, role: 'super', username: 'master', viaMaster: true };
  }

  const sess = await db.getSession(got);
  if (!sess) return { ok: false };
  const u = await db.getAdminUserById(sess.user_id);
  if (!u) { await db.deleteSession(got); return { ok: false }; }
  return { ok: true, role: u.role, username: u.username, userId: u.id, viaMaster: false, tk: got };
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
    favorite: !!row.favorite,
    favoritedAt: row.favorited_at,
    createdAt: row.created_at,
  };
  if (withContact) {
    out.contactType = row.contact_type;
    out.contactValue = row.contact_value;
  } else {
    out.contact = `${row.contact_type} / ${maskContact(row.contact_type, row.contact_value)}`;
  }
  return out;
}

function fileToJson(f) {
  return { id: f.id, name: f.original_name, size: Number(f.size), mime: f.mime, createdAt: f.created_at };
}

/* ---------------- 登录 ---------------- */

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  const username = String(body.username || '').trim();
  const secret = String(body.secret || '');
  const ip = clientIp(req);
  const throttleKey = `${ip}|${username.toLowerCase()}`;

  if (auth.tooManyAttempts(throttleKey, 8, 15 * 60 * 1000)) {
    return json(res, 429, { ok: false, error: '尝试次数过多，请 15 分钟后再试' });
  }
  if (!username || !secret) {
    return json(res, 400, { ok: false, error: '请填写账号与口令' });
  }

  const user = await db.getAdminUserByName(username);
  if (!user || !auth.verifySecret(secret, user.salt, user.hash)) {
    auth.noteFailure(throttleKey, 15 * 60 * 1000);
    return json(res, 401, { ok: false, error: '账号或口令不正确' });
  }

  auth.clearFailures(throttleKey);
  const tk = auth.newId(32);
  const ttl = auth.sessionTtlMs(cfg);
  await db.createSession({ tk, userId: user.id, role: user.role, expiresAt: new Date(Date.now() + ttl) });
  /* 单点登录：同一账号新登录就把其它设备上的会话踢掉，只留这一条 */
  await db.revokeUserSessions(user.id, tk);
  await db.touchAdminLogin(user.id);
  return json(res, 200, {
    ok: true, tk, role: user.role, username: user.username, expiresAt: new Date(Date.now() + ttl).toISOString(),
  });
}

async function handleLogout(req, res, me) {
  if (me.tk) await db.deleteSession(me.tk);
  return json(res, 200, { ok: true });
}

async function handleMe(req, res, me) {
  return json(res, 200, { ok: true, id: me.userId || '', username: me.username, role: me.role, viaMaster: !!me.viaMaster });
}

/* ---------------- 投稿列表 / 详情 ---------------- */

async function handleAdminList(req, res, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  const filter = String(url.searchParams.get('filter') || 'all');
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 60);
  const { rows, total } = await db.listForAdmin({ filter, q, limit, offset });
  const items = [];
  for (const r of rows) {
    const files = await db.filesOf(r.id);
    items.push({ ...rowToJson(r, true), files: files.map(fileToJson) });
  }
  return json(res, 200, { ok: true, total, limit, offset, filter, q, items });
}

async function handleAdminStats(req, res) {
  const stats = await db.adminStats();
  return json(res, 200, { ok: true, stats });
}

async function handleAdminDetail(req, res, id) {
  const row = await db.getSubmission(id);
  if (!row) return json(res, 404, { ok: false, error: '投稿不存在' });
  const files = await db.filesOf(id);
  return json(res, 200, { ok: true, item: { ...rowToJson(row, true), files: files.map(fileToJson) } });
}

async function handleFavorite(req, res, id) {
  const body = await readJsonBody(req);
  const row = await db.getSubmission(id);
  if (!row) return json(res, 404, { ok: false, error: '投稿不存在' });
  const want = body.favorite === undefined ? !row.favorite : !!body.favorite;
  await db.setFavorite(id, want);
  return json(res, 200, { ok: true, id, favorite: want });
}

/** 硬删除：投稿行、附件记录、磁盘上的附件文件全部真删，不留任何软删标记 */
async function handleDelete(req, res, id) {
  const row = await db.getSubmission(id);
  if (!row) return json(res, 404, { ok: false, error: '投稿不存在' });
  const { deleted, files } = await db.hardDeleteSubmission(id);
  const removed = [];
  for (const f of files) {
    if (!f.stored_path) continue;
    try {
      await fs.promises.rm(f.stored_path, { force: true });
      removed.push(f.original_name);
    } catch (e) {
      console.error('[delete] 附件删除失败', f.stored_path, e && e.message);
    }
  }
  console.log(`[admin] 硬删除投稿 ${id}（附件 ${removed.length} 个）`);
  return json(res, 200, {
    ok: true, id, deleted, removedFiles: removed,
    title: row.title, contact: `${row.contact_type} / ${row.contact_value}`,
  });
}

/* ---------------- 批量操作 ---------------- */

const MAX_BATCH = 200;

function pickIds(body) {
  if (!Array.isArray(body.ids)) return [];
  const seen = new Set();
  return body.ids
    .map((id) => String(id || ''))
    .filter((id) => /^[a-f0-9]{32}$/.test(id) && !seen.has(id) && seen.add(id))
    .slice(0, MAX_BATCH);
}

/** 批量收藏 / 取消收藏 */
async function handleBatchFavorite(req, res) {
  const body = await readJsonBody(req);
  const ids = pickIds(body);
  if (!ids.length) return json(res, 400, { ok: false, error: '没有选中任何单品' });
  const want = body.favorite === undefined ? true : !!body.favorite;
  const done = [];
  const missing = [];
  for (const id of ids) {
    const row = await db.getSubmission(id);
    if (!row) { missing.push(id); continue; }
    await db.setFavorite(id, want);
    done.push(id);
  }
  console.log(`[admin] 批量${want ? '收藏' : '取消收藏'} ${done.length} 条`);
  return json(res, 200, { ok: true, favorite: want, updated: done.length, ids: done, missing });
}

/** 批量硬删除：投稿行 + 附件记录 + 磁盘附件一起真删 */
async function handleBatchDelete(req, res) {
  const body = await readJsonBody(req);
  const ids = pickIds(body);
  if (!ids.length) return json(res, 400, { ok: false, error: '没有选中任何单品' });
  const done = [];
  const missing = [];
  const removedFiles = [];
  for (const id of ids) {
    const row = await db.getSubmission(id);
    if (!row) { missing.push(id); continue; }
    const { files } = await db.hardDeleteSubmission(id);
    for (const f of files) {
      if (!f.stored_path) continue;
      try {
        await fs.promises.rm(f.stored_path, { force: true });
        removedFiles.push(f.original_name);
      } catch (e) {
        console.error('[delete] 附件删除失败', f.stored_path, e && e.message);
      }
    }
    done.push(id);
  }
  console.log(`[admin] 批量硬删除投稿 ${done.length} 条（附件 ${removedFiles.length} 个）`);
  return json(res, 200, { ok: true, deleted: done.length, ids: done, missing, removedFiles });
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

/* ---------------- 管理员账号（仅 super） ---------------- */

async function handleUsersList(req, res) {
  const rows = await db.listAdminUsers();
  return json(res, 200, {
    ok: true,
    items: rows.map((u) => ({
      id: u.id, username: u.username, role: u.role,
      createdAt: u.created_at, createdBy: u.created_by, lastLoginAt: u.last_login_at,
      hasSecret: !!u.has_secret,
      protected: u.username === PROTECTED_ADMIN,
    })),
  });
}

async function handleUserCreate(req, res, me) {
  const body = await readJsonBody(req);
  const username = String(body.username || '').trim();
  const secret = String(body.secret || '');
  const role = body.role === 'super' ? 'super' : 'admin';

  if (!auth.validUsername(username)) {
    return json(res, 400, { ok: false, error: '账号需 4–32 位，字母开头，只能含字母/数字/下划线/短横线' });
  }
  if (!auth.validSecret(secret)) {
    return json(res, 400, { ok: false, error: '口令至少 8 位，且不能是纯数字' });
  }
  if (await db.getAdminUserByName(username)) {
    return json(res, 409, { ok: false, error: '该账号已存在' });
  }

  const salt = auth.newSalt();
  const row = {
    id: auth.newId(16), username, salt,
    hash: auth.hashSecret(secret, salt), role,
    secretEnc: SECRET_KEY ? auth.encryptSecret(secret, SECRET_KEY) : null,
    createdBy: me.viaMaster ? 'master' : me.username,
  };
  await db.createAdminUser(row);
  return json(res, 201, {
    ok: true, user: { id: row.id, username, role, createdAt: new Date().toISOString() },
  });
}

async function handleUserSecret(req, res, id, me) {
  const body = await readJsonBody(req);
  const secret = String(body.secret || '');
  if (!auth.validSecret(secret)) {
    return json(res, 400, { ok: false, error: '口令至少 8 位，且不能是纯数字' });
  }
  const u = await db.getAdminUserById(id);
  if (!u) return json(res, 404, { ok: false, error: '账号不存在' });
  /* 重置权限：普通管理员的随便重置；超级管理员只能重置自己的（超管之间不行，总秘钥也不行） */
  const isSelf = !me.viaMaster && me.userId === u.id;
  if (u.role !== 'admin' && !isSelf) {
    return json(res, 403, { ok: false, error: '只能重置自己的口令（其他超级管理员不行）' });
  }
  const salt = auth.newSalt();
  const enc = SECRET_KEY ? auth.encryptSecret(secret, SECRET_KEY) : null;
  await db.updateAdminSecret(id, salt, auth.hashSecret(secret, salt), enc);
  /* 改了口令就作废该账号所有会话（含自己）：下次要用新口令重新登录 */
  await db.revokeUserSessions(id);
  return json(res, 200, { ok: true, id, username: u.username, selfReset: isSelf, sessionsRevoked: true });
}

/**
 * 查看账号口令（仅 super）。
 * 规则：普通管理员的口令都能看；超级管理员只能看**自己**的，看不到其他超管的。
 * 解密的是创建/重置时存下的加密副本；登录校验永远走哈希，不受影响。
 * 老账号（加这个功能之前建的）没有副本，只能重置一次后才能查看。
 */
async function handleUserReveal(req, res, id, me) {
  const u = await db.getAdminUserById(id);
  if (!u) return json(res, 404, { ok: false, error: '账号不存在' });
  const isSelf = !me.viaMaster && me.userId === u.id;
  if (u.role !== 'admin' && !isSelf) {
    return json(res, 403, { ok: false, error: '其他超级管理员的口令不提供查看' });
  }
  if (!u.secret_enc) {
    return json(res, 200, {
      ok: true, id, username: u.username, secret: null, stored: false,
      hint: '这个账号是在「可查看口令」之前建的，请点「重置口令」重设一次，之后就能查看。',
    });
  }
  if (!SECRET_KEY) return json(res, 500, { ok: false, error: '服务端未加载密钥' });
  const plain = auth.decryptSecret(u.secret_enc, SECRET_KEY);
  if (!plain) {
    return json(res, 200, {
      ok: true, id, username: u.username, secret: null, stored: true,
      hint: '口令副本解密失败（密钥文件可能换过了），请重置口令。',
    });
  }
  return json(res, 200, { ok: true, id, username: u.username, secret: plain, stored: true });
}

async function handleUserDelete(req, res, me, id) {
  const u = await db.getAdminUserById(id);
  if (!u) return json(res, 404, { ok: false, error: '账号不存在' });
  /* 内置超级管理员一直是系统的落脚点：谁都删不掉（包括总秘钥和它自己） */
  if (u.username === PROTECTED_ADMIN) {
    return json(res, 403, { ok: false, error: '内置超级管理员不可删除' });
  }
  if (!me.viaMaster && me.userId === id) {
    return json(res, 400, { ok: false, error: '不能删除自己' });
  }
  if (u.role === 'super' && (await db.countSupers(id)) === 0) {
    return json(res, 400, { ok: false, error: '至少要保留一个超级管理员' });
  }
  await db.deleteAdminUser(id);
  return json(res, 200, { ok: true, id, username: u.username });
}

/* ------------------------------------------------------------ 路由 */

const ROUTES = [
  ['GET', /^\/api\/health\/?$/, async (req, res) => json(res, 200, { ok: true, service: 'columbina-birthday', time: new Date().toISOString() }), null],
  ['POST', /^\/api\/uploads\/?$/, handleUploadsCreate, null],
  ['GET', /^\/api\/uploads\/([a-f0-9]{32})\/?$/, async (req, res, m) => handleUploadStatus(req, res, m[1]), null],
  ['PUT', /^\/api\/uploads\/([a-f0-9]{32})\/chunk\/(\d+)\/?$/, async (req, res, m) => handleUploadChunk(req, res, m[1], Number(m[2])), null],
  ['POST', /^\/api\/uploads\/([a-f0-9]{32})\/complete\/?$/, async (req, res, m) => handleUploadComplete(req, res, m[1]), null],
  ['POST', /^\/api\/submissions\/?$/, handleSubmit, null],
  ['GET', /^\/api\/submissions\/([a-f0-9]{32})\/?$/, async (req, res, m) => handleSubmissionReceipt(req, res, m[1]), null],

  /* 管理端 */
  ['POST', /^\/api\/admin\/login\/?$/, handleLogin, null],
  ['POST', /^\/api\/admin\/logout\/?$/, async (req, res, m, url, me) => handleLogout(req, res, me), 'session'],
  ['GET', /^\/api\/admin\/me\/?$/, async (req, res, m, url, me) => handleMe(req, res, me), 'session'],
  ['GET', /^\/api\/admin\/stats\/?$/, handleAdminStats, 'session'],
  ['GET', /^\/api\/admin\/submissions\/?$/, async (req, res, m, url) => handleAdminList(req, res, url), 'session'],
  ['GET', /^\/api\/admin\/submissions\/([a-f0-9]{32})\/?$/, async (req, res, m) => handleAdminDetail(req, res, m[1]), 'session'],
  ['POST', /^\/api\/admin\/submissions\/batch\/favorite\/?$/, handleBatchFavorite, 'session'],
  ['POST', /^\/api\/admin\/submissions\/batch\/delete\/?$/, handleBatchDelete, 'session'],
  ['POST', /^\/api\/admin\/submissions\/([a-f0-9]{32})\/favorite\/?$/, async (req, res, m) => handleFavorite(req, res, m[1]), 'session'],
  ['DELETE', /^\/api\/admin\/submissions\/([a-f0-9]{32})\/?$/, async (req, res, m) => handleDelete(req, res, m[1]), 'session'],
  ['GET', /^\/api\/admin\/files\/([a-f0-9]{32})\/?$/, async (req, res, m) => handleAdminFile(req, res, m[1]), 'session'],
  ['GET', /^\/api\/admin\/users\/?$/, handleUsersList, 'super'],
  ['POST', /^\/api\/admin\/users\/?$/, async (req, res, m, url, me) => handleUserCreate(req, res, me), 'super'],
  ['POST', /^\/api\/admin\/users\/([a-f0-9]{32})\/secret\/?$/, async (req, res, m, url, me) => handleUserSecret(req, res, m[1], me), 'super'],
  ['GET', /^\/api\/admin\/users\/([a-f0-9]{32})\/secret\/?$/, async (req, res, m, url, me) => handleUserReveal(req, res, m[1], me), 'super'],
  ['DELETE', /^\/api\/admin\/users\/([a-f0-9]{32})\/?$/, async (req, res, m, url, me) => handleUserDelete(req, res, me, m[1]), 'super'],
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
    for (const [method, re, fn, level] of ROUTES) {
      const m = re.exec(p);
      if (!m) continue;
      if (req.method !== method) continue;
      let me = null;
      if (level) {
        me = await resolveAuth(req, url);
        if (!me.ok) return json(res, 401, { ok: false, error: '未登录或登录已过期' });
        if (level === 'super' && me.role !== 'super') {
          return json(res, 403, { ok: false, error: '需要超级管理员权限' });
        }
      }
      return await fn(req, res, m, url, me);
    }
    return json(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    const code = e && e.code && Number.isInteger(e.code) ? e.code : 500;
    if (code >= 500) console.error('[error]', req.method, p, e && e.stack || e);
    return json(res, code, { ok: false, error: code === 413 ? '请求体过大' : '服务器内部错误' });
  }
});

/* ------------------------------------------------------------ 启动 */

/** 库里一个账号都没有时，建一个超级管理员，随机口令写在 data/admin-init.txt（600） */
async function ensureSuperAdmin() {
  const n = await db.countAdmins();
  if (n > 0) return;
  const username = String((cfg.initAdmin && cfg.initAdmin.username) || 'admin');
  const secret = auth.newId(12);
  const salt = auth.newSalt();
  await db.createAdminUser({
    id: auth.newId(16), username, salt,
    hash: auth.hashSecret(secret, salt), role: 'super', createdBy: 'system',
    secretEnc: SECRET_KEY ? auth.encryptSecret(secret, SECRET_KEY) : null,
  });
  const p = path.join(DATA_DIR, 'admin-init.txt');
  fs.writeFileSync(
    p,
    `账号：${username}\n口令：${secret}\n创建时间：${new Date().toISOString()}\n（首次登录后请在后台改掉）\n`,
    { mode: 0o600 }
  );
  console.log(`[init] 已创建超级管理员「${username}」，初始口令写在 ${p}（600 权限）`);
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  up.initDirs(DATA_DIR);
  SECRET_KEY = auth.loadKey(keyFilePath());
  await db.init();
  await ensureSuperAdmin();
  const retentionDays = Number(cfg.retentionDays || 7);
  const sweep = async () => {
    try {
      const r = await up.cleanup(DATA_DIR, retentionDays * 86400 * 1000);
      const stale = await db.staleUploads(new Date(Date.now() - retentionDays * 86400 * 1000));
      for (const s of stale) if (s.state === 'open') await db.dropUpload(s.id);
      await db.purgeSessions();
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
