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

/** 上传单个分片（用 XHR 是为了拿字节级上传进度 —— fetch 没有 upload 进度事件） */
export function putChunk(uploadId, index, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url(`/uploads/${uploadId}/chunk/${index}`))
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total)
      }
    }
    xhr.onload = () => {
      let data = null
      try { data = JSON.parse(xhr.responseText) } catch (e) { data = null }
      resolve(data && typeof data === 'object' ? data : { ok: false, error: `服务器返回异常（${xhr.status}）` })
    }
    xhr.onerror = () => reject(new Error('网络异常'))
    xhr.onabort = () => reject(new Error('已取消'))
    xhr.ontimeout = () => reject(new Error('上传超时'))
    xhr.send(blob)
  })
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

/** 按编号读回投稿（修改前回显用） */
export async function lookupSubmission(id) {
  const res = await fetch(url('/submissions/lookup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  return readJson(res)
}

/** 按编号覆盖修改（编号不变） */
export async function updateSubmission(id, payload) {
  const res = await fetch(url(`/submissions/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJson(res)
}

export { API_BASE }
