let audioContext
let current
let activeSource = ''
let requestId = 0
const buffers = new Map()
const volume = 0.18

function context() {
  if (typeof window === 'undefined' || !window.AudioContext) return null
  audioContext ||= new window.AudioContext()
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {})
  return audioContext
}

async function loadBuffer(source, ctx) {
  if (!buffers.has(source)) buffers.set(source, fetch(source).then((response) => response.arrayBuffer()).then((data) => ctx.decodeAudioData(data)))
  return buffers.get(source)
}

export async function setBgm(source) {
  const ctx = context()
  if (!ctx || (source === activeSource && current)) return
  activeSource = source
  const thisRequest = ++requestId
  try {
    const buffer = await loadBuffer(source, ctx)
    if (thisRequest !== requestId) return
    const now = ctx.currentTime
    const gain = ctx.createGain()
    const node = ctx.createBufferSource()
    node.buffer = buffer
    node.loop = true
    gain.gain.setValueAtTime(0, now)
    node.connect(gain).connect(ctx.destination)
    node.start(now)
    if (current) {
      current.gain.gain.cancelScheduledValues(now)
      current.gain.gain.setValueAtTime(current.gain.gain.value, now)
      current.gain.gain.linearRampToValueAtTime(0, now + 0.9)
      current.node.stop(now + 0.95)
    }
    gain.gain.linearRampToValueAtTime(volume, now + 0.9)
    current = { node, gain }
  } catch {}
}
