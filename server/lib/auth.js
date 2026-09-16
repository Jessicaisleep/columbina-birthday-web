'use strict';
/**
 * 管理员登录态与口令校验。
 * 口令用 PBKDF2-SHA512 加盐哈希存库（不存明文）；登录态是一次性随机串，落库并带过期时间，可随时吊销。
 */
const crypto = require('crypto');
const fs = require('fs');

const ITERATIONS = 120000;
const KEY_LEN = 64;
const DIGEST = 'sha512';
const TTL_HOURS_DEFAULT = 12;

function newId(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashSecret(secret, salt) {
  return crypto.pbkdf2Sync(String(secret), String(salt), ITERATIONS, KEY_LEN, DIGEST).toString('hex');
}

function sameSecret(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifySecret(secret, salt, hash) {
  if (!salt || !hash) return false;
  return sameSecret(hashSecret(secret, salt), hash);
}

function sessionTtlMs(cfg) {
  const h = Number((cfg && cfg.sessionTTLHours) || TTL_HOURS_DEFAULT);
  return Math.max(1, h) * 3600 * 1000;
}

/* ---- 口令的可查看副本（加密存储）----
 * 登录校验永远走加盐哈希；这里额外存一份用服务器密钥加密的副本，
 * 仅供超级管理员在后台点「查看密码」时解密查看。密钥文件（默认 data/secret.key，600）不能丢，
 * 丢了只影响查看，不影响登录。
 */

function loadKey(file) {
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(file, key.toString('hex') + '\n', { mode: 0o600 });
  return key;
}

function encryptSecret(plain, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

function decryptSecret(blob, key) {
  try {
    const [v, iv64, tag64, data64] = String(blob || '').split(':');
    if (v !== 'v1' || !iv64 || !tag64 || !data64) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv64, 'base64'));
    decipher.setAuthTag(Buffer.from(tag64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data64, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    return '';
  }
}

/** 用户名规则：4–32 位，字母数字下划线短横线，字母开头 */
function validUsername(name) {
  return /^[A-Za-z][A-Za-z0-9_-]{3,31}$/.test(String(name || ''));
}

/** 口令规则：至少 8 位，且不能是纯数字 */
function validSecret(secret) {
  const s = String(secret || '');
  return s.length >= 8 && s.length <= 64 && !/^\d+$/.test(s);
}

/* ---- 登录失败限流（进程内即可，重启清零无妨） ---- */

const attempts = new Map();

function tooManyAttempts(key, max, windowMs) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.start > windowMs) return false;
  return rec.count >= max;
}

function noteFailure(key, windowMs) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.start > windowMs) attempts.set(key, { start: now, count: 1 });
  else rec.count += 1;
}

function clearFailures(key) {
  attempts.delete(key);
}

module.exports = {
  newId, newSalt, hashSecret, verifySecret, sameSecret,
  sessionTtlMs, validUsername, validSecret,
  tooManyAttempts, noteFailure, clearFailures,
  loadKey, encryptSecret, decryptSecret,
};
