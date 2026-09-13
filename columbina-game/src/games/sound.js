let audioContext

function context() {
  if (typeof window === 'undefined' || !window.AudioContext) return null
  audioContext ||= new window.AudioContext()
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {})
  return audioContext
}

function tone({ from, to = from, duration = 0.12, volume = 0.035, type = 'sine', delay = 0 }) {
  const ctx = context()
  if (!ctx) return
  const start = ctx.currentTime + delay
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(from, start)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.025, duration / 3))
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

export function playSfx(kind) {
  switch (kind) {
    case 'ui': tone({ from: 660, to: 720, duration: 0.07, volume: 0.018, type: 'triangle' }); break
    case 'start': tone({ from: 440, to: 740, duration: 0.16, volume: 0.025, type: 'sine' }); break
    case 'jump': tone({ from: 370, to: 620, duration: 0.12, volume: 0.026, type: 'sine' }); break
    case 'score':
      tone({ from: 740, to: 860, duration: 0.11, volume: 0.026, type: 'sine' })
      tone({ from: 980, to: 1120, duration: 0.12, volume: 0.016, type: 'triangle', delay: 0.055 })
      break
    case 'hit': tone({ from: 220, to: 110, duration: 0.2, volume: 0.028, type: 'sine' }); break
    case 'piece': tone({ from: 430, to: 390, duration: 0.08, volume: 0.022, type: 'triangle' }); break
    case 'piece-ai': tone({ from: 520, to: 465, duration: 0.1, volume: 0.019, type: 'sine' }); break
    case 'undo': tone({ from: 480, to: 330, duration: 0.1, volume: 0.016, type: 'triangle' }); break
    case 'win':
      tone({ from: 660, to: 760, duration: 0.14, volume: 0.026, type: 'sine' })
      tone({ from: 880, to: 1040, duration: 0.18, volume: 0.019, type: 'triangle', delay: 0.1 })
      break
    case 'lose': tone({ from: 330, to: 180, duration: 0.25, volume: 0.022, type: 'sine' }); break
    case 'draw': tone({ from: 490, to: 520, duration: 0.14, volume: 0.018, type: 'triangle' }); break
    default: break
  }
}
