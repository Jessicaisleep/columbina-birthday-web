/**
 * 后端接口客户端（前后端分离：静态站点 + Node/MySQL API）。
 * 线上由 nginx 把 /api/ 反代到后端进程；本地 dev 由 vite proxy 转发（见 vite.config.js）。
 * 需要换地址时用 VITE_API_BASE 覆盖，例如 VITE_API_BASE=https://example.com/api
 */
const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '')

function url(p) {
  return `${API_BASE}${p}`
}

async function readJson(res) {
  let data = null
  try { data = await res.json() } catch (e) { data = null }
  if (data && typeof data === 'object') return data
  return { ok: false, error: `服务器返回异常（${res.status}）` }
}

/** 创建分片上传会话 */
export async function createUpload({ fileName, size, mime, chunkSize }) {
  const res = await fetch(url('/uploads'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, size, mime, chunkSize }),
  })
  return readJson(res)
}

/** 查询上传会话（已收到哪些分片 —— 断点续传） */
export async function getUpload(uploadId) {
  const res = await fetch(url(`/uploads/${uploadId}`), { cache: 'no-store' })
  return readJson(res)
}

/** 上传单个分片 */
export async function putChunk(uploadId, index, blob, signal) {
  const res = await fetch(url(`/uploads/${uploadId}/chunk/${index}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: blob,
    signal,
  })
  return readJson(res)
}

/** 合并分片 */
export async function completeUpload(uploadId) {
  const res = await fetch(url(`/uploads/${uploadId}/complete`), { method: 'POST' })
  return readJson(res)
}

/** 提交投稿 */
export async function submitForm(payload) {
  const res = await fetch(url('/submissions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJson(res)
}

/** 投稿回执 */
export async function getReceipt(id) {
  const res = await fetch(url(`/submissions/${id}`), { cache: 'no-store' })
  return readJson(res)
}

export { API_BASE }
