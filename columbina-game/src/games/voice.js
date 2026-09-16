/**
 * 小游戏语音（角色台词）。
 *
 * 和 bgm.js / sound.js 一样走 Web Audio：页面上不放 <audio> 元素、也不让浏览器
 * 直接从 <audio src> 拉文件，避开国产浏览器（QQ / 夸克 / UC / 百度等）的媒体嗅探
 * 与悬浮播放器；音频文件本身仍是 p/audio/voice 下的 .wav。
 *
 * 用法：
 *   playVoice(VOICE_EVENTS.RUNNER_JUMP, { chance: 0.24, cooldown: 7000 })
 *   stopVoice()
 */
const voiceFiles = import.meta.glob('../../p/audio/voice/**/*.wav', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const VOICE_EVENTS = Object.freeze({
  BOARD_ENTER: 'board/enter',
  BOARD_HANDICAP: 'board/handicap',
  BOARD_MOVE: 'board/move',
  BOARD_COLUMBINA_WIN: 'board/columbina-win',
  BOARD_PLAYER_WIN: 'board/player-win',
  RUNNER_START: 'runner/start',
  RUNNER_JUMP: 'runner/jump',
  RUNNER_DEATH: 'runner/death',
})

const VOLUME = 0.55

const pools = Object.fromEntries(Object.values(VOICE_EVENTS).map((event) => [event, []]))

Object.entries(voiceFiles).forEach(([path, source]) => {
  const match = path.match(/\/voice\/(board|runner)\/([^/]+)\//)
  if (!match) return
  const event = `${match[1]}/${match[2]}`
  pools[event]?.push(source)
})

let audioContext
let current
let requestId = 0
const buffers = new Map()
const lastPlayedAt = new Map()
const lastPicked = new Map()

function context() {
  if (typeof window === 'undefined' || !window.AudioContext) return null
  audioContext ||= new window.AudioContext()
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {})
  return audioContext
}

async function loadBuffer(source, ctx) {
  if (!buffers.has(source)) {
    buffers.set(
      source,
      fetch(source)
        .then((response) => response.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null),
    )
  }
  return buffers.get(source)
}

function pickVoice(event, sources) {
  if (sources.length === 1) return sources[0]
  const previous = lastPicked.get(event)
  const candidates = sources.filter((source) => source !== previous)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

/* 停掉正在播的语音，并作废还没解码完的（避免“停了下一条才响”） */
export function stopVoice() {
  requestId += 1
  if (!current) return
  const voice = current
  current = undefined
  try { voice.node.stop() } catch {}
  try { voice.node.disconnect() } catch {}
  try { voice.gain.disconnect() } catch {}
}

export function playVoice(event, { chance = 1, cooldown = 0 } = {}) {
  const sources = pools[event] || []
  const now = Date.now()
  if (!sources.length || now - (lastPlayedAt.get(event) || 0) < cooldown || Math.random() > chance) return false

  const ctx = context()
  if (!ctx) return false

  const source = pickVoice(event, sources)
  lastPicked.set(event, source)
  lastPlayedAt.set(event, now)
  stopVoice()
  const thisRequest = ++requestId

  loadBuffer(source, ctx)
    .then((buffer) => {
      if (!buffer || thisRequest !== requestId) return
      const gain = ctx.createGain()
      gain.gain.value = VOLUME
      const node = ctx.createBufferSource()
      node.buffer = buffer
      node.connect(gain).connect(ctx.destination)
      node.onended = () => {
        if (current && current.node === node) {
          try { gain.disconnect() } catch {}
          current = undefined
        }
      }
      node.start()
      current = { node, gain }
    })
    .catch(() => {})
  return true
}
