'use strict';
/**
 * 分片上传（断点续传）本体。
 * 每个分片落成 uploads/tmp/<uploadId>/<index>.part；
 * 「已收到哪些分片」直接以磁盘为准 —— 重启 / 断线后客户端 GET 一次即可续传。
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

function newId() {
  return crypto.randomBytes(16).toString('hex');
}

function uploadsRoot(dataDir) { return path.join(dataDir, 'uploads'); }
function tmpDir(dataDir, id) { return path.join(uploadsRoot(dataDir), 'tmp', id); }
function filesDir(dataDir) { return path.join(uploadsRoot(dataDir), 'files'); }

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

async function initDirs(dataDir) {
  ensureDir(tmpDir(dataDir, 'x'));
  ensureDir(filesDir(dataDir));
}

function receivedChunks(dataDir, id) {
  const dir = tmpDir(dataDir, id);
  let names;
  try { names = fs.readdirSync(dir); } catch (e) { return []; }
  return names
    .filter((n) => n.endsWith('.part'))
    .map((n) => Number(n.slice(0, -5)))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);
}

function chunkPath(dataDir, id, index) {
  return path.join(tmpDir(dataDir, id), `${index}.part`);
}

async function writeChunk(dataDir, id, index, stream, maxBytes) {
  const dir = tmpDir(dataDir, id);
  ensureDir(dir);
  const dest = chunkPath(dataDir, id, index);
  const tmp = `${dest}.tmp`;
  let written = 0;
  const out = fs.createWriteStream(tmp);
  stream.on('data', (d) => { written += d.length; });
  try {
    await pipeline(stream, out);
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
  if (written > maxBytes) {
    await fsp.rm(tmp, { force: true });
    const err = new Error('chunk too large');
    err.code = 413;
    throw err;
  }
  await fsp.rename(tmp, dest);
  return written;
}

function sanitizeExt(name) {
  const m = /(\.[A-Za-z0-9]{1,8})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

async function mergeChunks(dataDir, id, total, originalName) {
  const dir = tmpDir(dataDir, id);
  const outDir = filesDir(dataDir);
  ensureDir(outDir);
  const stored = path.join(outDir, `${id}${sanitizeExt(originalName)}`);
  const out = fs.createWriteStream(stored);
  try {
    for (let i = 0; i < total; i++) {
      const p = path.join(dir, `${i}.part`);
      const buf = await fsp.readFile(p);
      if (!out.write(buf)) {
        await new Promise((res) => out.once('drain', res));
      }
    }
    await new Promise((res, rej) => out.end((err) => (err ? rej(err) : res())));
  } catch (e) {
    out.destroy();
    throw e;
  }
  const st = await fsp.stat(stored);
  await fsp.rm(dir, { recursive: true, force: true });
  return { stored, size: st.size };
}

/** 清理：过期未完成的上传会话 + 孤儿分片目录 + 无人引用的合并文件 */
async function cleanup(dataDir, olderThanMs) {
  const cutoff = Date.now() - olderThanMs;
  const tmpRoot = path.join(uploadsRoot(dataDir), 'tmp');
  let removedTmp = 0;
  try {
    for (const name of fs.readdirSync(tmpRoot)) {
      const p = path.join(tmpRoot, name);
      const st = await fsp.stat(p).catch(() => null);
      if (st && st.mtimeMs < cutoff) {
        await fsp.rm(p, { recursive: true, force: true });
        removedTmp++;
      }
    }
  } catch (e) { /* 目录不存在就算了 */ }
  return { removedTmp };
}

async function statFile(p) {
  return fsp.stat(p);
}

module.exports = {
  newId, initDirs, uploadsRoot, tmpDir, filesDir,
  receivedChunks, chunkPath, writeChunk, mergeChunks, cleanup, statFile, sanitizeExt,
};
