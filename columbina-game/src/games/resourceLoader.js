const IMAGE_PATTERN = /\.(avif|gif|jpe?g|png|webp)(?:\?|$)/i
const preparedAssets = new Set()
const inFlightAssets = new Map()
const downloadWaiters = []
const MAX_ACTIVE_DOWNLOADS = 2
let activeDownloads = 0

function fillDownloadSlots() {
  while (activeDownloads < MAX_ACTIVE_DOWNLOADS && downloadWaiters.length) {
    const waiter = downloadWaiters.shift()
    if (waiter.signal?.aborted) {
      waiter.reject(new DOMException('资源加载已取消', 'AbortError'))
      continue
    }
    activeDownloads += 1
    waiter.signal?.removeEventListener('abort', waiter.abort)
    waiter.resolve(() => {
      activeDownloads -= 1
      fillDownloadSlots()
    })
  }
}

function acquireDownloadSlot(signal) {
  return new Promise((resolve, reject) => {
    const waiter = { signal, resolve, reject, abort: null }
    waiter.abort = () => {
      const index = downloadWaiters.indexOf(waiter)
      if (index >= 0) downloadWaiters.splice(index, 1)
      reject(new DOMException('资源加载已取消', 'AbortError'))
    }
    signal?.addEventListener('abort', waiter.abort, { once: true })
    downloadWaiters.push(waiter)
    fillDownloadSlots()
  })
}

async function downloadAndPrepare(url, signal) {
  if (preparedAssets.has(url)) return
  if (inFlightAssets.has(url)) return inFlightAssets.get(url)

  const task = (async () => {
    const release = await acquireDownloadSlot(signal)
    try {
      const response = await fetch(url, { cache: 'force-cache', signal })
      if (!response.ok) throw new Error(`资源下载失败：${response.status}`)
      const blob = await response.blob()

      if (IMAGE_PATTERN.test(url)) {
        const objectUrl = URL.createObjectURL(blob)
        try {
          const image = new Image()
          image.src = objectUrl
          if (image.decode) await image.decode()
          else await new Promise((resolve, reject) => {
            image.onload = resolve
            image.onerror = reject
          })
        } finally {
          URL.revokeObjectURL(objectUrl)
        }
      }
      preparedAssets.add(url)
    } finally {
      release()
    }
  })().finally(() => inFlightAssets.delete(url))

  inFlightAssets.set(url, task)
  return task
}

export async function loadAssetGroup(urls, { signal, onProgress, concurrency = 4 } = {}) {
  const queue = [...new Set(urls)]
  const total = queue.length
  let completed = 0
  onProgress?.(completed, total)

  async function worker() {
    while (queue.length) {
      if (signal?.aborted) throw new DOMException('资源加载已取消', 'AbortError')
      const url = queue.shift()
      await downloadAndPrepare(url, signal)
      completed += 1
      onProgress?.(completed, total)
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, total))
  await Promise.all(Array.from({ length: workerCount }, worker))
}
