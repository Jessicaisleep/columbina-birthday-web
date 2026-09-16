/**
 * 管理后台接口封装。
 * 登录后拿到的会话串存在 localStorage，随请求头 X-Admin-Key 发送（不放在 URL 里）；
 * 只有「下载附件」用 ?tk= —— 文件可能很大，走浏览器原生下载更稳。
 */
const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '')
const TK_KEY = 'cb_admin_tk'

let tk = ''

export function loadToken() {
  try { tk = localStorage.getItem(TK_KEY) || '' } catch (e) { tk = '' }
  return tk
}

export function getToken() { return tk }

export function saveToken(v) {
  tk = v || ''
  try {
    if (tk) localStorage.setItem(TK_KEY, tk)
    else localStorage.removeItem(TK_KEY)
  } catch (e) { /* 隐私模式下忽略 */ }
}

async function call(path, { method = 'GET', body, quiet = false } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (tk) headers['X-Admin-Key'] = tk
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  let data = null
  try { data = await res.json() } catch (e) { data = null }
  if (!data || typeof data !== 'object') data = { ok: false, error: `服务器返回异常（${res.status}）` }
  if (res.status === 401 && !quiet) saveToken('')
  return { status: res.status, ...data }
}

export const adminApi = {
  base: API_BASE,

  login(username, secret) {
    return call('/admin/login', { method: 'POST', body: { username, secret }, quiet: true })
  },
  me() { return call('/admin/me', { quiet: true }) },
  logout() { return call('/admin/logout', { method: 'POST' }) },
  stats() { return call('/admin/stats') },

  list({ filter = 'all', q = '', limit = 50, offset = 0 } = {}) {
    const p = new URLSearchParams({ filter, limit: String(limit), offset: String(offset) })
    if (q) p.set('q', q)
    return call(`/admin/submissions?${p.toString()}`)
  },
  detail(id) { return call(`/admin/submissions/${id}`) },
  setFavorite(id, favorite) { return call(`/admin/submissions/${id}/favorite`, { method: 'POST', body: { favorite } }) },
  remove(id) { return call(`/admin/submissions/${id}`, { method: 'DELETE' }) },

  users() { return call('/admin/users') },
  createUser(payload) { return call('/admin/users', { method: 'POST', body: payload }) },
  deleteUser(id) { return call(`/admin/users/${id}`, { method: 'DELETE' }) },
  resetUserSecret(id, secret) { return call(`/admin/users/${id}/secret`, { method: 'POST', body: { secret } }) },

  fileUrl(id) { return `${API_BASE}/admin/files/${id}?tk=${encodeURIComponent(tk)}` },
}
