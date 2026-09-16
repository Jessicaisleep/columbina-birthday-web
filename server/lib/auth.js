'use strict';
/**
 * 管理员登录态与口令校验。
 * 口令用 PBKDF2-SHA512 加盐哈希存库（不存明文）；登录态是一次性随机串，落库并带过期时间，可随时吊销。
 */
const crypto = require('crypto');

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
};
