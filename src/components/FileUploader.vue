<template>
  <div class="uploader">
    <div
      class="drop"
      :class="{ over: dragging }"
      role="button"
      tabindex="0"
      @click="pick"
      @keydown.enter.prevent="pick"
      @dragover.prevent="dragging = true"
      @dragenter.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <input ref="inputEl" class="hidden-input" type="file" multiple :accept="accept" @change="onPick" />
      <span class="drop-icon">☁</span>
      <p class="drop-main">点击选择文件，或把文件拖到这里</p>
      <p class="drop-hint">支持大文件断点续传 · 单个文件最大 {{ maxMB }} MB · 最多 {{ maxFiles }} 个</p>
    </div>

    <p v-if="resumeHint" class="resume">检测到未完成的上传「{{ resumeHint }}」，重新选择同一个文件即可接着传。</p>

    <ul v-if="items.length" class="list">
      <li v-for="it in items" :key="it.key">
        <div class="row">
          <span class="name" :title="it.file.name">{{ it.file.name }}</span>
          <span class="size">{{ prettySize(it.file.size) }}</span>
          <button type="button" class="x" aria-label="移除" @click="remove(it)">✕</button>
        </div>
        <div class="bar-row">
          <div class="bar"><i :style="{ width: it.percent + '%' }"></i></div>
          <span class="pct" :class="it.status">{{ it.percent }}%</span>
        </div>
        <div class="state" :class="it.status">
          <template v-if="it.status === 'done'">
            <template v-if="it.existing">原有附件 ✓　<span class="dim">不改动就保持原样</span></template>
            <template v-else>已上传 ✓　<span class="dim">{{ doneText(it) }}</span></template>
          </template>
          <template v-else-if="it.status === 'error'">{{ it.error || '上传失败' }}　<button type="button" class="retry" @click="retry(it)">重试</button></template>
          <template v-else-if="it.status === 'uploading'">
            上传中 · <b class="spd">{{ formatSpeed(it.speed) }}</b> · {{ prettySize(sentBytes(it)) }} / {{ prettySize(it.file.size) }}
          </template>
          <template v-else>等待上传…</template>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { createUpload, getUpload, putChunk, completeUpload } from '../api/client.js'

const props = defineProps({
  maxFiles: { type: Number, default: 5 },
  maxMB: { type: Number, default: 2048 },
  accept: { type: String, default: 'video/*,image/*,audio/*,.zip,.rar,.7z,.psd,.pdf' },
  /* 修改已有投稿时传进来：服务器上已经存在的附件（{ id, name, size }） */
  initial: { type: Array, default: () => [] },
})
const emit = defineEmits(['change'])

const PENDING_KEY = 'cb_pending_uploads_v1'
const CHUNK_FALLBACK = 4 * 1024 * 1024

const inputEl = ref(null)
const dragging = ref(false)
const items = ref([])
const resumeHint = ref('')

let keySeq = 0

/* ---------------- 未完成任务记录（跨刷新续传） ---------------- */

function loadPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch (e) { return [] }
}

function savePending() {
  try {
    const arr = items.value
      .filter((it) => !it.fileId && it.uploadId)
      .map((it) => ({ uploadId: it.uploadId, name: it.file.name, size: it.file.size }))
    const keep = loadPending().filter((p) => !items.value.some((it) => it.uploadId === p.uploadId))
    const merged = keep.concat(arr)
    localStorage.setItem(PENDING_KEY, JSON.stringify(merged.slice(0, 20)))
  } catch (e) { /* 忽略隐私模式下的写入失败 */ }
}

function findPending(file) {
  return loadPending().find((p) => p.name === file.name && Number(p.size) === file.size) || null
}

function dropPending(uploadId) {
  try {
    const arr = loadPending().filter((p) => p.uploadId !== uploadId)
    localStorage.setItem(PENDING_KEY, JSON.stringify(arr))
  } catch (e) { /* 忽略 */ }
}

onMounted(() => {
  const pending = loadPending()
  if (pending.length) resumeHint.value = `${pending[0].name}（${prettySize(pending[0].size)}）`
  seedInitial()
})

/** 回显已有附件：直接摆成「已完成」状态，可以单独移除（移除后保存即从服务器删掉） */
function seedInitial() {
  for (const f of props.initial) {
    if (!f || !f.id) continue
    if (items.value.some((it) => it.fileId === f.id)) continue
    const it = reactiveItem({ name: f.name, size: Number(f.size) || 0 })
    it.fileId = f.id
    it.existing = true
    it.status = 'done'
    it.percent = 100
    it.uploadedBytes = Number(f.size) || 0
    items.value.push(it)
  }
  emitChange()
}

/* ---------------- 选择文件 ---------------- */

function pick() { inputEl.value && inputEl.value.click() }

function onPick(e) {
  addFiles(Array.from(e.target.files || []))
  e.target.value = ''
}

function onDrop(e) {
  dragging.value = false
  addFiles(Array.from((e.dataTransfer && e.dataTransfer.files) || []))
}

function addFiles(files) {
  for (const file of files) {
    if (items.value.length >= props.maxFiles) break
    if (file.size > props.maxMB * 1024 * 1024) {
      items.value.push({ key: `k${++keySeq}`, file, existing: false, status: 'error', error: `超过 ${props.maxMB} MB 上限`, percent: 0, uploadedBytes: 0, speed: 0, chunks: new Set() })
      continue
    }
    if (items.value.some((it) => it.file.name === file.name && it.file.size === file.size && it.status !== 'error')) continue
    const it = reactiveItem(file)
    items.value.push(it)
    start(it)
  }
  emitChange()
}

function reactiveItem(file) {
  return reactive({
    key: `k${++keySeq}`,
    file,
    existing: false,
    uploadId: null,
    chunkSize: CHUNK_FALLBACK,
    chunksTotal: 0,
    chunks: new Set(),
    uploadedBytes: 0,
    /* 上传中：每个分片已发出去的字节（idx -> loaded），用于字节级进度 */
    inflight: new Map(),
    /* 速度采样：最近几秒的 (时间, 已发字节) */
    samples: [],
    speed: 0,
    startedAt: 0,
    elapsedMs: 0,
    avgSpeed: 0,
    percent: 0,
    status: 'waiting',
    error: '',
    fileId: null,
  })
}

function remove(it) {
  it.cancelled = true
  if (it.uploadId) dropPending(it.uploadId)
  items.value = items.value.filter((x) => x !== it)
  emitChange()
}

function retry(it) {
  it.error = ''
  it.status = 'waiting'
  start(it)
}

function emitChange() {
  emit('change', items.value
    .filter((it) => it.fileId)
    .map((it) => ({ fileId: it.fileId, name: it.file.name, size: it.file.size, existing: !!it.existing })))
}

/* ---------------- 上传（分片 + 断点续传） ---------------- */

async function start(it) {
  if (it.status === 'uploading') return
  it.status = 'uploading'
  it.error = ''
  try {
    const pending = findPending(it.file)
    let session = null
    if (pending) {
      const st = await getUpload(pending.uploadId)
      if (st.ok) {
        it.uploadId = st.uploadId
        it.chunkSize = st.chunkSize
        it.chunksTotal = st.chunksTotal
        st.received.forEach((i) => it.chunks.add(i))
        it.uploadedBytes = Number(st.uploadedBytes) || 0
      } else {
        dropPending(pending.uploadId)
      }
    }
    if (!it.uploadId) {
      session = await createUpload({ fileName: it.file.name, size: it.file.size, mime: it.file.type, chunkSize: CHUNK_FALLBACK })
      if (!session.ok) throw new Error(session.error || '创建上传任务失败')
      it.uploadId = session.uploadId
      it.chunkSize = session.chunkSize
      it.chunksTotal = session.chunksTotal
      it.uploadedBytes = 0
      it.chunks = new Set()
      savePending()
    }
    if (!it.chunksTotal) it.chunksTotal = Math.max(1, Math.ceil(it.file.size / it.chunkSize))
    it.inflight = new Map()
    it.samples = [{ t: Date.now(), bytes: it.uploadedBytes }]
    it.speed = 0
    it.startedAt = Date.now()
    it.elapsedMs = 0
    it.avgSpeed = 0
    it.percent = percentOf(it)

    const todo = []
    for (let i = 0; i < it.chunksTotal; i++) if (!it.chunks.has(i)) todo.push(i)

    let cursor = 0
    const lanes = Math.min(3, Math.max(1, todo.length))
    const worker = async () => {
      while (cursor < todo.length) {
        if (it.cancelled) return
        const idx = todo[cursor++]
        const begin = idx * it.chunkSize
        const blob = it.file.slice(begin, Math.min(begin + it.chunkSize, it.file.size))
        await putWithRetry(it, idx, blob, (loaded) => {
          it.inflight.set(idx, loaded)
          tick(it)
        })
        it.inflight.delete(idx)
        it.chunks.add(idx)
        it.uploadedBytes += blob.size
        tick(it)
      }
    }
    await Promise.all(Array.from({ length: lanes }, worker))
    if (it.cancelled) return

    const done = await completeUpload(it.uploadId)
    if (!done.ok) throw new Error(done.error || '分片合并失败')
    it.fileId = done.fileId
    it.status = 'done'
    it.percent = 100
    it.uploadedBytes = it.file.size
    it.inflight = new Map()
    it.elapsedMs = it.startedAt ? Date.now() - it.startedAt : 0
    it.avgSpeed = it.elapsedMs > 0 ? it.file.size / (it.elapsedMs / 1000) : 0
    dropPending(it.uploadId)
    resumeHint.value = ''
    emitChange()
  } catch (e) {
    if (it.cancelled) return
    it.status = 'error'
    it.error = (e && e.message) || '上传失败，请重试'
    savePending()
  }
}

async function putWithRetry(it, idx, blob, onProgress) {
  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (it.cancelled) throw new Error('已取消')
    try {
      const r = await putChunk(it.uploadId, idx, blob, onProgress)
      if (r.ok) return r
      if (r.expired) { it.uploadId = null; throw new Error('上传会话已过期，请重试') }
      lastErr = new Error(r.error || '分片上传失败')
    } catch (e) {
      lastErr = e
    }
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
  }
  throw lastErr || new Error('网络异常')
}

/* ---------------- 进度与速度 ---------------- */

/** 已发出去的字节 = 已传完的分片 + 正在传的分片已发出的部分 */
function sentBytes(it) {
  let inFlight = 0
  if (it.inflight) it.inflight.forEach((v) => { inFlight += Number(v) || 0 })
  return Math.min(it.file.size, it.uploadedBytes + inFlight)
}

function percentOf(it) {
  if (!it.file.size) return 0
  return Math.min(100, Math.floor((sentBytes(it) / it.file.size) * 100))
}

/** 每来一次进度事件就采一次样，用最近 4 秒的窗口算瞬时速度（再做指数平滑，避免跳来跳去） */
function tick(it) {
  const now = Date.now()
  const bytes = sentBytes(it)
  const s = it.samples
  if (!s.length || now - s[s.length - 1].t >= 150) s.push({ t: now, bytes })
  while (s.length > 2 && now - s[0].t > 4000) s.shift()
  if (s.length >= 2) {
    const dt = (now - s[0].t) / 1000
    const db = bytes - s[0].bytes
    if (dt >= 0.35 && db >= 0) {
      const inst = db / dt
      it.speed = it.speed > 0 ? it.speed * 0.55 + inst * 0.45 : inst
    }
  }
  it.percent = percentOf(it)
}

/* ---------------- 展示 ---------------- */

function prettySize(n) {
  const v = Number(n) || 0
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatSpeed(bytesPerSec) {
  const v = Number(bytesPerSec) || 0
  if (v <= 0) return '测速中…'
  if (v < 1024) return `${Math.round(v)} B/s`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB/s`
  return `${(v / 1024 / 1024).toFixed(1)} MB/s`
}

function formatDuration(ms) {
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  return `${m} 分 ${s % 60} 秒`
}

function doneText(it) {
  if (!it.elapsedMs) return ''
  return `用时 ${formatDuration(it.elapsedMs)} · 平均 ${formatSpeed(it.avgSpeed)}`
}

onBeforeUnmount(() => { savePending() })

defineExpose({ hasUploading: computed(() => items.value.some((it) => it.status === 'uploading')) })
</script>

<style scoped>
.uploader{display:flex;flex-direction:column;gap:12px}
.hidden-input{display:none}
.drop{
  border:1px dashed rgba(157,184,232,.38);border-radius:14px;padding:26px 18px;
  text-align:center;cursor:pointer;background:rgba(157,184,232,.05);
  transition:border-color .3s,background .3s,transform .3s;
}
.drop:hover,.drop.over{border-color:rgba(230,200,138,.7);background:rgba(230,200,138,.08)}
.drop.over{transform:scale(1.01)}
.drop-icon{font-size:26px;color:var(--blue);display:block;margin-bottom:6px}
.drop-main{font-size:14px;color:var(--ink)}
.drop-hint{font-size:12px;color:var(--ink-faint);margin-top:4px;letter-spacing:.04em}
.resume{font-size:12px;color:var(--gold);letter-spacing:.03em}
.list{list-style:none;display:flex;flex-direction:column;gap:12px;margin-top:4px}
.list li{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:rgba(10,15,30,.5)}
.row{display:flex;align-items:center;gap:10px}
.row .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.row .size{font-size:12px;color:var(--ink-faint);font-variant-numeric:tabular-nums}
.x{background:none;border:none;color:var(--ink-faint);cursor:pointer;font-size:14px;padding:2px 4px;transition:color .3s}
.x:hover{color:#e88}
.bar-row{display:flex;align-items:center;gap:10px;margin:10px 0 6px}
.bar{flex:1;height:4px;border-radius:99px;background:rgba(157,184,232,.16);overflow:hidden}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--gold));transition:width .25s}
.pct{font-size:12px;color:var(--ink-dim);font-variant-numeric:tabular-nums;min-width:38px;text-align:right}
.pct.done{color:#8fd6a8}
.pct.error{color:#e89c9c}
.state{font-size:12px;color:var(--ink-dim);letter-spacing:.03em}
.state .spd{color:var(--gold);font-weight:400}
.state .dim{color:var(--ink-faint)}
.state.done{color:#8fd6a8}
.state.error{color:#e89c9c}
.retry{background:none;border:1px solid rgba(230,200,138,.5);border-radius:99px;color:var(--gold);font-size:12px;padding:2px 10px;cursor:pointer}
@media(max-width:860px) and (orientation:portrait){
  .drop{padding:20px 12px}
}
</style>
