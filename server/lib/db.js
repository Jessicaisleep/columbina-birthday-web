'use strict';
/**
 * 数据层（MySQL / mysql2）。
 * 投稿内容、投稿附件元数据、分片上传会话全部存在库里；
 * 附件本体以文件形式落在 server/data/uploads/files/ 下（视频体积大，不进 BLOB）。
 * 连接参数来自 server/config.json 的 db 段；口令可直接写，也可放文件（secretFile）。
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = path.join(__dirname, '..');

let pool = null;

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
}

function readSecret(dbCfg) {
  if (dbCfg.secret) return String(dbCfg.secret);
  if (dbCfg.secretFile) {
    const p = path.isAbsolute(dbCfg.secretFile) ? dbCfg.secretFile : path.join(ROOT, dbCfg.secretFile);
    return fs.readFileSync(p, 'utf8').trim();
  }
  return '';
}

function readAdminSecret(cfg) {
  if (cfg.adminSecret) return String(cfg.adminSecret);
  if (cfg.adminSecretFile) {
    const p = path.isAbsolute(cfg.adminSecretFile) ? cfg.adminSecretFile : path.join(ROOT, cfg.adminSecretFile);
    try { return fs.readFileSync(p, 'utf8').trim(); } catch (e) { return ''; }
  }
  return '';
}

/* ------------------------------------------------------------ 建表 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS submissions (
     id VARCHAR(32) NOT NULL PRIMARY KEY,
     contact_type VARCHAR(16) NOT NULL,
     contact_value VARCHAR(255) NOT NULL,
     nicknames VARCHAR(600) NULL,
     creation_type VARCHAR(16) NOT NULL,
     team_members JSON NULL,
     title VARCHAR(255) NOT NULL,
     category VARCHAR(32) NOT NULL,
     intro TEXT NOT NULL,
     duration VARCHAR(32) NOT NULL,
     has_other_chars TINYINT(1) NOT NULL DEFAULT 0,
     other_chars JSON NULL,
     progress VARCHAR(32) NULL,
     preview_type VARCHAR(16) NULL,
     preview_link VARCHAR(1024) NULL,
     agreed TINYINT(1) NOT NULL DEFAULT 0,
     ip VARCHAR(64) NULL,
     ua VARCHAR(500) NULL,
     created_at DATETIME NOT NULL,
     KEY idx_created (created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS submission_files (
     id VARCHAR(32) NOT NULL PRIMARY KEY,
     submission_id VARCHAR(32) NULL,
     original_name VARCHAR(255) NOT NULL,
     stored_path VARCHAR(500) NOT NULL,
     size BIGINT NOT NULL,
     mime VARCHAR(160) NULL,
     created_at DATETIME NOT NULL,
     KEY idx_sub (submission_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS upload_sessions (
     id VARCHAR(32) NOT NULL PRIMARY KEY,
     original_name VARCHAR(255) NOT NULL,
     size BIGINT NOT NULL,
     mime VARCHAR(160) NULL,
     chunk_size INT NOT NULL,
     chunks_total INT NOT NULL,
     state VARCHAR(16) NOT NULL DEFAULT 'open',
     created_at DATETIME NOT NULL,
     updated_at DATETIME NOT NULL,
     KEY idx_updated (updated_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

async function init() {
  const cfg = loadConfig();
  const dbCfg = cfg.db;
  pool = mysql.createPool({
    host: dbCfg.host || '127.0.0.1',
    port: dbCfg.port || 3306,
    user: dbCfg.user,
    password: readSecret(dbCfg),
    database: dbCfg.database,
    connectionLimit: dbCfg.connectionLimit || 8,
    charset: 'utf8mb4_unicode_ci',
    timezone: '+08:00',
    namedPlaceholders: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
  });
  for (const sql of SCHEMA) await pool.query(sql);
  return pool;
}

function get() {
  if (!pool) throw new Error('db not initialized');
  return pool;
}

const now = () => new Date();

/* ------------------------------------------------------------ 上传会话 */

async function createUpload(row) {
  await get().query(
    `INSERT INTO upload_sessions
       (id, original_name, size, mime, chunk_size, chunks_total, state, created_at, updated_at)
     VALUES (?,?,?,?,?,?,'open',?,?)`,
    [row.id, row.originalName, row.size, row.mime, row.chunkSize, row.chunksTotal, now(), now()]
  );
}

async function getUpload(id) {
  const [rows] = await get().query('SELECT * FROM upload_sessions WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function touchUpload(id, state) {
  if (state) {
    await get().query('UPDATE upload_sessions SET updated_at = ?, state = ? WHERE id = ?', [now(), state, id]);
  } else {
    await get().query('UPDATE upload_sessions SET updated_at = ? WHERE id = ?', [now(), id]);
  }
}

async function findUploadByNameSize(name, size) {
  const [rows] = await get().query(
    'SELECT * FROM upload_sessions WHERE original_name = ? AND size = ? AND state = ? ORDER BY created_at DESC LIMIT 1',
    [name, size, 'open']
  );
  return rows[0] || null;
}

async function staleUploads(beforeDate) {
  const [rows] = await get().query('SELECT * FROM upload_sessions WHERE updated_at < ?', [beforeDate]);
  return rows;
}

async function dropUpload(id) {
  await get().query('DELETE FROM upload_sessions WHERE id = ?', [id]);
}

/* ------------------------------------------------------------ 附件 */

async function insertFile(row) {
  await get().query(
    `INSERT INTO submission_files
       (id, submission_id, original_name, stored_path, size, mime, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [row.id, row.submissionId || null, row.originalName, row.storedPath, row.size, row.mime || null, now()]
  );
}

async function getFile(id) {
  const [rows] = await get().query('SELECT * FROM submission_files WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function attachFiles(submissionId, ids) {
  if (!ids || !ids.length) return;
  const marks = ids.map(() => '?').join(',');
  await get().query(
    `UPDATE submission_files SET submission_id = ? WHERE id IN (${marks}) AND submission_id IS NULL`,
    [submissionId, ...ids]
  );
}

async function filesOf(submissionId) {
  const [rows] = await get().query('SELECT * FROM submission_files WHERE submission_id = ?', [submissionId]);
  return rows;
}

/* ------------------------------------------------------------ 投稿 */

const SUB_FIELDS = [
  'id', 'contact_type', 'contact_value', 'nicknames', 'creation_type', 'team_members',
  'title', 'category', 'intro', 'duration', 'has_other_chars', 'other_chars',
  'progress', 'preview_type', 'preview_link', 'agreed', 'ip', 'ua', 'created_at',
];

async function insertSubmission(row) {
  const cols = SUB_FIELDS.join(',');
  const marks = SUB_FIELDS.map(() => '?').join(',');
  await get().query(
    `INSERT INTO submissions (${cols}) VALUES (${marks})`,
    SUB_FIELDS.map((f) => row[f] === undefined ? null : row[f])
  );
}

async function getSubmission(id) {
  const [rows] = await get().query('SELECT * FROM submissions WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function listSubmissions(limit, offset) {
  const [rows] = await get().query(
    'SELECT * FROM submissions ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [Number(limit), Number(offset)]
  );
  return rows;
}

async function countSubmissions() {
  const [rows] = await get().query('SELECT COUNT(*) AS n FROM submissions');
  return Number(rows[0].n);
}

async function countRecentSubmissions(ip, since) {
  const [rows] = await get().query(
    'SELECT COUNT(*) AS n FROM submissions WHERE ip = ? AND created_at >= ?',
    [ip, since]
  );
  return Number(rows[0].n);
}

module.exports = {
  loadConfig, readAdminSecret, init, get, now,
  createUpload, getUpload, touchUpload, findUploadByNameSize, staleUploads, dropUpload,
  insertFile, getFile, attachFiles, filesOf,
  insertSubmission, getSubmission, listSubmissions, countSubmissions, countRecentSubmissions,
};
