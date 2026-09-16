<template>
  <section class="admin">
    <div class="wrap">
      <!-- 未登录 -->
      <div v-if="!me" class="card login-card">
        <h2>投稿管理后台</h2>
        <p class="sub">《新月再梦听羽生》哥伦比娅生日会</p>
        <form class="login-form" @submit.prevent="doLogin">
          <label class="field">
            <span class="label">账号</span>
            <input v-model.trim="loginForm.username" autocomplete="username" placeholder="管理员账号" />
          </label>
          <label class="field">
            <span class="label">口令</span>
            <input v-model="loginForm.secret" type="password" autocomplete="current-password" placeholder="登录口令" />
          </label>
          <button class="btn" type="submit" :disabled="logging">{{ logging ? '登录中…' : '登录' }}</button>
          <p v-if="loginError" class="err center">{{ loginError }}</p>
        </form>
      </div>

      <!-- 已登录 -->
      <template v-else>
        <header class="head">
          <div>
            <div class="eyebrow">Admin</div>
            <h2>投稿管理</h2>
          </div>
          <div class="who">
            <span class="badge" :class="me.role">{{ me.role === 'super' ? '超级管理员' : '管理员' }}</span>
            <span class="who-name">{{ me.username }}</span>
            <button class="mini" type="button" @click="doLogout">退出</button>
          </div>
        </header>

        <div class="stats">
          <button class="stat" :class="{ on: filter === 'all' }" type="button" @click="setFilter('all')">
            <b>{{ stats.total }}</b><span>全部投稿</span>
          </button>
          <button class="stat" :class="{ on: filter === 'favorite' }" type="button" @click="setFilter('favorite')">
            <b>{{ stats.favorites }}</b><span>已收藏</span>
          </button>
          <button class="stat" :class="{ on: filter === 'file' }" type="button" @click="setFilter('file')">
            <b>{{ stats.withFiles }}</b><span>含附件</span>
          </button>
          <div class="stat plain"><b>{{ stats.last24h }}</b><span>24 小时内</span></div>
        </div>

        <div class="toolbar">
          <input v-model.trim="q" class="search" placeholder="搜索单品名称 / 简介 / 联系方式 / 昵称" @keydown.enter="refresh" />
          <button class="mini" type="button" @click="refresh" :disabled="loading">{{ loading ? '加载中…' : '搜索 / 刷新' }}</button>
        </div>

        <p v-if="listError" class="err">{{ listError }}</p>

        <div v-if="!items.length && !loading" class="empty">还没有符合条件的投稿。</div>

        <ul v-if="items.length" class="subs">
          <li v-for="it in items" :key="it.id" :class="{ fav: it.favorite }">
            <div class="sub-main">
              <div class="sub-title">
                <button class="star" :class="{ on: it.favorite }" type="button" :title="it.favorite ? '取消收藏' : '收藏'" @click="toggleFav(it)">
                  {{ it.favorite ? '★' : '☆' }}
                </button>
                <span class="t">{{ it.title }}</span>
                <span class="chip">{{ it.category }}</span>
                <span v-if="it.files && it.files.length" class="chip blue">附件 {{ it.files.length }}</span>
              </div>
              <div class="sub-meta">
                <span>{{ contactLabel(it) }}</span>
                <span>{{ fmtTime(it.createdAt) }}</span>
                <span>{{ it.creationType === 'team' ? '团队创作' : '个人创作' }}</span>
                <span v-if="it.previewType === 'link'">仅链接</span>
              </div>
            </div>
            <div class="sub-ops">
              <button class="mini" type="button" @click="openDetail(it)">查看详情</button>
              <button class="mini danger" type="button" @click="askDelete(it)">删除</button>
            </div>
          </li>
        </ul>

        <div v-if="total > items.length" class="more">
          <button class="mini" type="button" :disabled="loading" @click="loadMore">加载更多（已显示 {{ items.length }} / {{ total }}）</button>
        </div>

        <!-- 账号管理（仅超级管理员） -->
        <section v-if="me.role === 'super'" class="users">
          <h3>管理员账号</h3>
          <p class="hint">超级管理员可以新建管理员；管理员只能查看、收藏、删除投稿，不能管理账号。<br />口令可点「查看密码」查看：普通管理员的都能看，超级管理员只能看<b>自己</b>的（存的是加密副本）。</p>
          <form class="user-form" @submit.prevent="createUser">
            <input v-model.trim="newUser.username" placeholder="新账号（4–32 位，字母开头）" />
            <input v-model="newUser.secret" type="password" placeholder="口令（至少 8 位，非纯数字）" />
            <select v-model="newUser.role">
              <option value="admin">管理员</option>
              <option value="super">超级管理员</option>
            </select>
            <button class="mini gold" type="submit" :disabled="userBusy">新增</button>
          </form>
          <p v-if="userMsg" class="hint msg" :class="{ err: userErr }">{{ userMsg }}</p>

          <ul class="user-list">
            <li v-for="u in users" :key="u.id">
              <span class="uname">{{ u.username }}</span>
              <span class="badge small" :class="u.role">{{ u.role === 'super' ? '超级管理员' : '管理员' }}</span>
              <span class="dim">建号 {{ fmtTime(u.createdAt) }}</span>
              <span class="dim">上次登录 {{ u.lastLoginAt ? fmtTime(u.lastLoginAt) : '—' }}</span>
              <span v-if="revealed[u.id]" class="pw">
                口令：<code>{{ revealed[u.id] }}</code>
                <button class="mini tiny" type="button" @click="copySecret(revealed[u.id], u.id)">{{ copiedId === u.id ? '已复制 ✓' : '复制' }}</button>
              </span>
              <span v-else-if="revealHint[u.id]" class="dim pw-hint">{{ revealHint[u.id] }}</span>
              <span class="spacer"></span>
              <button class="mini" type="button"
                      :disabled="revealingId === u.id || !canReveal(u)"
                      :title="canReveal(u) ? '' : '其他超级管理员的口令不提供查看'"
                      @click="toggleReveal(u)">
                {{ revealed[u.id] ? '隐藏密码' : (revealingId === u.id ? '读取中…' : '查看密码') }}
              </button>
              <button class="mini" type="button" @click="askReset(u)">重置口令</button>
              <button class="mini danger" type="button" :disabled="u.username === me.username" @click="askDeleteUser(u)">删除</button>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="detail" class="modal open" role="dialog" aria-modal="true" @click.self="detail = null">
      <div class="modal-card wide">
        <button class="modal-close" type="button" aria-label="关闭" @click="detail = null">✕</button>
        <h3>{{ detail.title }}</h3>
        <div class="detail-head">
          <button class="star big" :class="{ on: detail.favorite }" type="button" @click="toggleFav(detail)">
            {{ detail.favorite ? '★ 已收藏' : '☆ 收藏' }}
          </button>
          <span class="chip">{{ detail.category }}</span>
          <span class="chip">{{ detail.duration }}</span>
          <span class="chip">{{ detail.creationType === 'team' ? '团队创作' : '个人创作' }}</span>
          <span v-if="detail.progress" class="chip blue">{{ detail.progress }}</span>
        </div>

        <dl class="detail">
          <div><dt>投稿编号</dt><dd class="mono">{{ detail.id }}</dd></div>
          <div><dt>提交时间</dt><dd>{{ fmtTime(detail.createdAt) }}</dd></div>
          <div><dt>联系方式</dt><dd>{{ typeLabel(detail.contactType) }}：{{ detail.contactValue }}</dd></div>
          <div><dt>参与昵称</dt><dd>{{ detail.nicknames || '—' }}</dd></div>
          <div v-if="detail.teamMembers && detail.teamMembers.length">
            <dt>成员分工</dt>
            <dd>
              <span v-for="(m, i) in detail.teamMembers" :key="i" class="member">{{ m.role }}：{{ m.nickname }}</span>
            </dd>
          </div>
          <div><dt>作品简介</dt><dd class="pre">{{ detail.intro }}</dd></div>
          <div>
            <dt>其他角色</dt>
            <dd>{{ detail.hasOtherCharacters ? (detail.otherCharacters.join('、') || '—') : '未涉及' }}</dd>
          </div>
          <div><dt>作品预览</dt>
            <dd>
              <a v-if="detail.previewType === 'link'" :href="detail.previewLink" target="_blank" rel="noopener" class="link">{{ detail.previewLink }}</a>
              <template v-else-if="detail.previewType === 'file'">见下方附件</template>
              <template v-else>未提供</template>
            </dd>
          </div>
          <div v-if="detail.files && detail.files.length">
            <dt>附件</dt>
            <dd>
              <a v-for="f in detail.files" :key="f.id" class="file" :href="fileUrl(f.id)" target="_blank" rel="noopener">
                ⬇ {{ f.name }}（{{ prettySize(f.size) }}）
              </a>
            </dd>
          </div>
        </dl>

        <div class="modal-actions">
          <button class="btn small" type="button" @click="toggleFav(detail)">{{ detail.favorite ? '取消收藏' : '收藏' }}</button>
          <button class="btn small danger" type="button" @click="askDelete(detail)">删除这份投稿</button>
        </div>
      </div>
    </div>

    <!-- 硬删除确认 -->
    <div v-if="pendingDelete" class="modal open" role="dialog" aria-modal="true" @click.self="pendingDelete = null">
      <div class="modal-card">
        <h3 class="danger-title">确认删除？</h3>
        <p class="del-target">「{{ pendingDelete.title }}」</p>
        <p class="del-warn">
          这是<strong>硬删除</strong>：数据库里的投稿记录、附件记录，以及服务器上已上传的附件文件都会被<strong>真正删除，无法恢复</strong>。
        </p>
        <div class="modal-actions">
          <button class="btn small danger" type="button" :disabled="deleting" @click="doDelete">{{ deleting ? '删除中…' : '确认硬删除' }}</button>
          <button class="btn small ghost" type="button" @click="pendingDelete = null">取消</button>
        </div>
      </div>
    </div>

    <!-- 重置口令 / 删账号确认 -->
    <div v-if="pendingUser" class="modal open" role="dialog" aria-modal="true" @click.self="pendingUser = null">
      <div class="modal-card">
        <h3>{{ pendingUser.mode === 'reset' ? '重置口令' : '删除账号' }}</h3>
        <p class="del-target">账号：{{ pendingUser.user.username }}</p>
        <template v-if="pendingUser.mode === 'reset'">
          <input v-model="pendingUser.secret" type="password" placeholder="新口令（至少 8 位，非纯数字）" />
        </template>
        <p v-else class="del-warn">删除后该账号立即失效（已登录的会话也会一并吊销），<strong>无法恢复</strong>。</p>
        <div class="modal-actions">
          <button class="btn small" :class="{ danger: pendingUser.mode === 'delete' }" type="button" :disabled="userBusy" @click="confirmUser">
            {{ pendingUser.mode === 'reset' ? '确认重置' : '确认删除' }}
          </button>
          <button class="btn small ghost" type="button" @click="pendingUser = null">取消</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { adminApi, loadToken, saveToken } from '../api/admin.js'

const me = ref(null)
const tk = ref('')
const stats = reactive({ total: 0, favorites: 0, withFiles: 0, last24h: 0 })
const items = ref([])
const total = ref(0)
const filter = ref('all')
const q = ref('')
const loading = ref(false)
const listError = ref('')

const loginForm = reactive({ username: '', secret: '' })
const logging = ref(false)
const loginError = ref('')

const detail = ref(null)
const pendingDelete = ref(null)
const deleting = ref(false)
const deletingUserId = ref('')

const users = ref([])
const newUser = reactive({ username: '', secret: '', role: 'admin' })
const userMsg = ref('')
const userErr = ref(false)
const userBusy = ref(false)
const pendingUser = ref(null)

/* 查看口令（仅 super） */
const revealed = reactive({})
const revealHint = reactive({})
const revealingId = ref('')
const copiedId = ref('')

const TYPE_LABEL = { qq: 'QQ', wechat: '微信', email: '邮箱' }

/** 能看口令的：普通管理员（都是），或超级管理员看自己 */
function canReveal(u) {
  return u.role === 'admin' || (!!me.value && u.id === me.value.id)
}

function typeLabel(t) { return TYPE_LABEL[t] || t || '—' }
function contactLabel(it) { return `${typeLabel(it.contactType)}：${it.contactValue || '—'}` }

function prettySize(n) {
  const v = Number(n) || 0
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtTime(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fileUrl(id) { return adminApi.fileUrl(id) }

/* ---------------- 登录态 ---------------- */

async function bootstrap() {
  tk.value = loadToken()
  if (!tk.value) return
  const r = await adminApi.me()
  if (r.ok) {
    me.value = { id: r.id || '', username: r.username, role: r.role, viaMaster: r.viaMaster }
    await Promise.all([refresh(), me.value.role === 'super' ? loadUsers() : Promise.resolve()])
  } else {
    saveToken('')
    tk.value = ''
  }
}

async function doLogin() {
  loginError.value = ''
  if (!loginForm.username || !loginForm.secret) { loginError.value = '请填写账号与口令'; return }
  logging.value = true
  try {
    const r = await adminApi.login(loginForm.username, loginForm.secret)
    if (!r.ok) { loginError.value = r.error || '登录失败'; return }
    saveToken(r.tk)
    tk.value = r.tk
    const info = await adminApi.me()
    me.value = info.ok
      ? { id: info.id || '', username: info.username, role: info.role, viaMaster: info.viaMaster }
      : { id: '', username: r.username, role: r.role, viaMaster: false }
    loginForm.secret = ''
    await Promise.all([refresh(), me.value.role === 'super' ? loadUsers() : Promise.resolve()])
  } finally {
    logging.value = false
  }
}

async function doLogout() {
  await adminApi.logout()
  saveToken('')
  tk.value = ''
  me.value = null
  items.value = []
  users.value = []
  detail.value = null
}

/* ---------------- 列表 ---------------- */

async function refresh() {
  loading.value = true
  listError.value = ''
  try {
    const [list, st] = await Promise.all([adminApi.list({ filter: filter.value, q: q.value, limit: 50 }), adminApi.stats()])
    if (!list.ok) {
      if (list.status === 401) { me.value = null; saveToken(''); return }
      listError.value = list.error || '加载失败'
      return
    }
    items.value = list.items || []
    total.value = list.total || 0
    if (st.ok) Object.assign(stats, st.stats)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  loading.value = true
  try {
    const list = await adminApi.list({ filter: filter.value, q: q.value, limit: 50, offset: items.value.length })
    if (list.ok) items.value = items.value.concat(list.items || [])
  } finally {
    loading.value = false
  }
}

function setFilter(f) {
  filter.value = f
  refresh()
}

function openDetail(it) { detail.value = it }

async function toggleFav(it) {
  const want = !it.favorite
  const r = await adminApi.setFavorite(it.id, want)
  if (!r.ok) { listError.value = r.error || '操作失败'; return }
  it.favorite = r.favorite
  if (detail.value && detail.value.id === it.id) detail.value.favorite = r.favorite
  stats.favorites = Math.max(0, stats.favorites + (r.favorite ? 1 : -1))
  if (filter.value === 'favorite' && !r.favorite) items.value = items.value.filter((x) => x.id !== it.id)
}

/* ---------------- 删除（硬删） ---------------- */

function askDelete(it) { pendingDelete.value = it }

async function doDelete() {
  const target = pendingDelete.value
  if (!target) return
  deleting.value = true
  try {
    const r = await adminApi.remove(target.id)
    if (!r.ok) { listError.value = r.error || '删除失败'; return }
    items.value = items.value.filter((x) => x.id !== target.id)
    stats.total = Math.max(0, stats.total - 1)
    if (target.favorite) stats.favorites = Math.max(0, stats.favorites - 1)
    if (target.files && target.files.length) stats.withFiles = Math.max(0, stats.withFiles - 1)
    total.value = Math.max(0, total.value - 1)
    if (detail.value && detail.value.id === target.id) detail.value = null
    pendingDelete.value = null
  } finally {
    deleting.value = false
  }
}

/* ---------------- 账号管理（super） ---------------- */

async function loadUsers() {
  const r = await adminApi.users()
  if (r.ok) users.value = r.items || []
}

async function createUser() {
  userMsg.value = ''
  userErr.value = false
  if (!newUser.username || !newUser.secret) { userErr.value = true; userMsg.value = '请填写账号与口令'; return }
  userBusy.value = true
  try {
    const r = await adminApi.createUser({ username: newUser.username, secret: newUser.secret, role: newUser.role })
    if (!r.ok) { userErr.value = true; userMsg.value = r.error || '创建失败'; return }
    userErr.value = false
    userMsg.value = `已创建${r.user.role === 'super' ? '超级管理员' : '管理员'}「${r.user.username}」`
    newUser.username = ''
    newUser.secret = ''
    newUser.role = 'admin'
    await loadUsers()
  } finally {
    userBusy.value = false
  }
}

function askReset(u) { pendingUser.value = { mode: 'reset', user: u, secret: '' } }
function askDeleteUser(u) { pendingUser.value = { mode: 'delete', user: u } }

/** 查看口令：解密服务端存的副本；旧账号没副本时给出“重置一次”的提示 */
async function toggleReveal(u) {
  if (revealed[u.id]) { delete revealed[u.id]; return }
  if (!canReveal(u)) {
    userErr.value = true
    userMsg.value = '其他超级管理员的口令不提供查看'
    return
  }
  revealingId.value = u.id
  userErr.value = false
  try {
    const r = await adminApi.revealUserSecret(u.id)
    if (!r.ok) { userErr.value = true; userMsg.value = r.error || '无法查看口令'; return }
    if (r.secret) {
      revealed[u.id] = r.secret
      delete revealHint[u.id]
    } else {
      revealHint[u.id] = r.hint || '未保存可查看的口令'
    }
  } finally {
    revealingId.value = ''
  }
}

async function copySecret(text, id) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  } catch (e) {
    /* 剪贴板被拒（无权限 / 非安全上下文）就退回到老办法；口令反正已经显示在屏幕上 */
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch (e2) { /* 实在不行就算了 */ }
  }
  copiedId.value = id
  setTimeout(() => { if (copiedId.value === id) copiedId.value = '' }, 1600)
}

async function confirmUser() {
  const p = pendingUser.value
  if (!p) return
  userBusy.value = true
  userErr.value = false
  try {
    if (p.mode === 'reset') {
      const r = await adminApi.resetUserSecret(p.user.id, p.secret)
      if (!r.ok) { userErr.value = true; userMsg.value = r.error || '重置失败'; return }
      userMsg.value = `已重置「${p.user.username}」的口令`
      delete revealHint[p.user.id]
      revealed[p.user.id] = p.secret
    } else {
      const r = await adminApi.deleteUser(p.user.id)
      if (!r.ok) { userErr.value = true; userMsg.value = r.error || '删除失败'; return }
      userMsg.value = `已删除账号「${r.username}」`
    }
    pendingUser.value = null
    await loadUsers()
  } finally {
    userBusy.value = false
  }
}

onMounted(bootstrap)
</script>

<style scoped>
.admin{padding:120px 0 96px}
.card{border:1px solid var(--line);border-radius:18px;padding:38px 34px;background:radial-gradient(ellipse at 50% -8%,rgba(157,184,232,.1),transparent 60%),linear-gradient(170deg,rgba(22,30,56,.55),rgba(9,13,26,.8))}
.login-card{max-width:420px;margin:0 auto;text-align:center}
.login-card h2{font-size:26px;margin-bottom:8px}
.login-card .sub{font-size:13px;color:var(--ink-dim);letter-spacing:.14em;margin-bottom:26px}
.login-form{display:flex;flex-direction:column;gap:16px;text-align:left}
.field{display:flex;flex-direction:column;gap:8px}
.label{font-size:13px;color:var(--ink-dim);letter-spacing:.06em}
input,select,textarea{width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(157,184,232,.22);background:rgba(6,10,22,.72);color:var(--ink);font-family:var(--sans);font-size:14px;font-weight:300;outline:none;transition:border-color .3s,box-shadow .3s}
input:focus,select:focus{border-color:rgba(230,200,138,.55);box-shadow:0 0 0 3px rgba(230,200,138,.1)}
select{appearance:none;padding-right:34px;background-image:linear-gradient(45deg,transparent 50%,var(--ink-dim) 50%),linear-gradient(135deg,var(--ink-dim) 50%,transparent 50%);background-position:calc(100% - 17px) calc(50% - 2px),calc(100% - 12px) calc(50% - 2px);background-size:5px 5px,5px 5px;background-repeat:no-repeat}
option{background:#0a0f1e;color:var(--ink)}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:22px}
.head h2{margin:0}
.who{display:flex;align-items:center;gap:10px}
.who-name{font-size:13px;color:var(--ink-dim)}
.badge{font-size:11px;letter-spacing:.1em;padding:4px 10px;border-radius:99px;border:1px solid rgba(157,184,232,.35);color:var(--blue)}
.badge.super{border-color:rgba(230,200,138,.5);color:var(--gold);background:rgba(230,200,138,.08)}
.badge.small{font-size:10px;padding:2px 8px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
.stat{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:rgba(10,15,30,.5);cursor:pointer;color:var(--ink);text-align:left;transition:border-color .3s,background .3s}
.stat:hover{border-color:rgba(230,200,138,.4)}
.stat.on{border-color:rgba(230,200,138,.65);background:rgba(230,200,138,.08)}
.stat.plain{cursor:default}
.stat b{font-family:var(--serif);font-size:24px;font-weight:400}
.stat span{font-size:12px;color:var(--ink-dim);letter-spacing:.08em}
.toolbar{display:flex;gap:12px;margin-bottom:16px}
.toolbar .search{flex:1}
.mini{padding:9px 16px;border-radius:99px;border:1px solid rgba(157,184,232,.3);background:rgba(157,184,232,.06);color:var(--ink-dim);font-size:13px;cursor:pointer;transition:all .3s;white-space:nowrap}
.mini:hover:not(:disabled){color:var(--gold);border-color:rgba(230,200,138,.5)}
.mini:disabled{opacity:.4;cursor:not-allowed}
.mini.danger{color:#e9a2a2;border-color:rgba(233,162,162,.35)}
.mini.danger:hover:not(:disabled){color:#ffb4b4;border-color:rgba(233,162,162,.7);background:rgba(233,162,162,.08)}
.mini.gold{color:var(--bg);background:linear-gradient(135deg,var(--gold),#f0d9a8);border:none}
.mini.tiny{padding:2px 10px;font-size:12px;letter-spacing:.04em}
.pw{font-size:13px;color:var(--moon);display:inline-flex;align-items:center;gap:8px}
.pw code{font-family:ui-monospace,Consolas,monospace;font-size:13px;padding:2px 8px;border-radius:6px;background:rgba(230,200,138,.12);border:1px solid rgba(230,200,138,.28);color:var(--gold);user-select:all}
.pw-hint{flex:1 1 100%;color:var(--gold);opacity:.85}
.subs{list-style:none;display:flex;flex-direction:column;gap:12px}
.subs li{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:16px 18px;border:1px solid var(--line);border-radius:14px;background:rgba(10,15,30,.5);transition:border-color .3s}
.subs li.fav{border-color:rgba(230,200,138,.45);background:rgba(230,200,138,.05)}
.sub-main{min-width:0}
.sub-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sub-title .t{font-family:var(--serif);font-size:16px;letter-spacing:.04em}
.chip{font-size:11px;letter-spacing:.06em;padding:3px 10px;border-radius:99px;border:1px solid rgba(157,184,232,.28);color:var(--blue)}
.chip.blue{border-color:rgba(157,184,232,.5);background:rgba(157,184,232,.1)}
.sub-meta{display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:var(--ink-faint)}
.sub-ops{display:flex;gap:8px;flex:none}
.star{background:none;border:none;cursor:pointer;font-size:18px;color:var(--ink-faint);padding:0 2px;line-height:1;transition:color .3s,transform .3s}
.star:hover{transform:scale(1.15)}
.star.on{color:var(--gold)}
.star.big{font-size:14px;letter-spacing:.08em}
.empty{text-align:center;color:var(--ink-faint);font-size:14px;padding:40px 0}
.more{text-align:center;margin-top:18px}
.hint{font-size:12.5px;color:var(--ink-faint);margin:8px 0 12px}
.hint.err,.err{color:#eb9c9c}
.err.center{text-align:center;font-size:12.5px}
.users{margin-top:44px;border-top:1px solid var(--line);padding-top:28px}
.users h3{font-family:var(--serif);font-size:20px;letter-spacing:.1em;margin-bottom:6px}
.user-form{display:grid;grid-template-columns:1.2fr 1.2fr .9fr auto;gap:10px;margin-bottom:14px}
.user-list{list-style:none;display:flex;flex-direction:column;gap:10px}
.user-list li{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border:1px solid var(--line);border-radius:12px;background:rgba(10,15,30,.45)}
.uname{font-size:14px}
.dim{font-size:12px;color:var(--ink-faint)}
.spacer{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:15px 42px;border-radius:99px;font-family:var(--serif);font-size:16px;letter-spacing:.2em;color:var(--bg);background:linear-gradient(135deg,var(--gold),#f0d9a8);border:none;cursor:pointer;box-shadow:0 8px 34px rgba(230,200,138,.28);transition:transform .35s,box-shadow .35s,opacity .3s}
.btn:hover:not(:disabled){transform:translateY(-2px)}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn.small{padding:11px 26px;font-size:14px;letter-spacing:.12em}
.btn.danger{background:linear-gradient(135deg,#c96a6a,#e08b8b);color:#1a0d0d;box-shadow:0 8px 30px rgba(201,106,106,.25)}
.btn.ghost{background:none;border:1px solid rgba(157,184,232,.3);color:var(--ink-dim);box-shadow:none}
.modal{position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(4,6,13,.72);backdrop-filter:blur(10px);overflow:auto}
.modal-card{position:relative;width:100%;max-width:520px;border:1px solid rgba(230,200,138,.28);border-radius:18px;padding:38px 32px 28px;background:radial-gradient(ellipse at 50% -10%,rgba(157,184,232,.16),transparent 55%),linear-gradient(170deg,rgba(24,33,62,.95),rgba(8,12,26,.98));box-shadow:0 24px 80px rgba(0,0,0,.55);max-height:88vh;overflow:auto}
.modal-card.wide{max-width:760px}
.modal-card h3{font-size:22px;letter-spacing:.1em;margin-bottom:14px;text-align:center}
.danger-title{color:#e9a2a2}
.modal-close{position:absolute;top:14px;right:16px;background:none;border:none;color:var(--ink-faint);font-size:20px;cursor:pointer}
.modal-close:hover{color:var(--gold)}
.modal-actions{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:24px}
.detail-head{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-bottom:20px}
.detail{display:flex;flex-direction:column;gap:10px}
.detail>div{display:flex;gap:14px;border-bottom:1px dashed rgba(157,184,232,.14);padding-bottom:8px}
.detail dt{flex:0 0 84px;color:var(--ink-faint);font-size:13px}
.detail dd{flex:1;font-size:13.5px;min-width:0;word-break:break-word}
.detail dd.pre{white-space:pre-wrap}
.mono{font-family:ui-monospace,Consolas,monospace;color:var(--moon)}
.member{display:inline-block;margin:0 10px 4px 0;padding:2px 10px;border-radius:99px;background:rgba(157,184,232,.1);font-size:12.5px}
.link{color:#7fb2ff;word-break:break-all}
.file{display:block;color:#7fb2ff;font-size:13px;margin-bottom:4px}
.del-target{text-align:center;font-size:15px;margin-bottom:10px}
.del-warn{font-size:13px;color:var(--ink-dim);line-height:1.9}
.del-warn strong{color:#e9a2a2}
.modal-card input{margin-bottom:6px}
@media(max-width:860px) and (orientation:portrait){
  .admin{padding:96px 0 72px}
  .card{padding:26px 20px}
  .stats{grid-template-columns:1fr 1fr}
  .subs li{flex-direction:column;align-items:flex-start;gap:12px}
  .sub-ops{width:100%}
  .sub-ops .mini{flex:1}
  .user-form{grid-template-columns:1fr}
  .btn{width:100%}
  .toolbar{flex-direction:column}
}
</style>
