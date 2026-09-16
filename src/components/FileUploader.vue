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
        <div class="bar"><i :style="{ width: it.percent + '%' }"></i></div>
        <div class="state" :class="it.status">
          <template v-if="it.status === 'done'">已上传 ✓</template>
          <template v-else-if="it.status === 'error'">{{ it.error || '上传失败' }}　<button type="button" class="retry" @click="retry(it)">重试</button></template>
          <template v-else-if="it.status === 'uploading'">上传中 {{ it.percent }}%（{{ prettySize(it.uploadedBytes) }} / {{ prettySize(it.file.size) }}）</template>
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
})

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
      items.value.push({ key: `k${++keySeq}`, file, status: 'error', error: `超过 ${props.maxMB} MB 上限`, percent: 0, uploadedBytes: 0, chunks: new Set() })
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
    uploadId: null,
    chunkSize: CHUNK_FALLBACK,
    chunksTotal: 0,
    chunks: new Set(),
    uploadedBytes: 0,
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
  emit('change', items.value.filter((it) => it.fileId).map((it) => ({ fileId: it.fileId, name: it.file.name, size: it.file.size })))
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
    it.percent = Math.min(100, Math.round((it.uploadedBytes / it.file.size) * 100))

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
        await putWithRetry(it, idx, blob)
        it.chunks.add(idx)
        it.uploadedBytes += blob.size
        it.percent = Math.min(100, Math.round((it.uploadedBytes / it.file.size) * 100))
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

async function putWithRetry(it, idx, blob) {
  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (it.cancelled) throw new Error('已取消')
    try {
      const r = await putChunk(it.uploadId, idx, blob)
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

/* ---------------- 展示 ---------------- */

function prettySize(n) {
  const v = Number(n) || 0
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`
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
.bar{height:4px;border-radius:99px;background:rgba(157,184,232,.16);margin:10px 0 6px;overflow:hidden}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--gold));transition:width .3s}
.state{font-size:12px;color:var(--ink-dim);letter-spacing:.03em}
.state.done{color:#8fd6a8}
.state.error{color:#e89c9c}
.retry{background:none;border:1px solid rgba(230,200,138,.5);border-radius:99px;color:var(--gold);font-size:12px;padding:2px 10px;cursor:pointer}
@media(max-width:860px) and (orientation:portrait){
  .drop{padding:20px 12px}
}
</style>
