import { ref, onMounted, onBeforeUnmount } from 'vue'

/* 默认倒计时：2027-01-14 20:00 GMT+8 */
const TARGET = new Date('2027-01-14T20:00:00+08:00')

function pad(n){ return String(n).padStart(2, '0') }

export function useCountdown() {
  const d = ref('--')
  const h = ref('--')
  const m = ref('--')
  const s = ref('--')
  const done = ref(false)
  let timer = null

  function tick() {
    const diff = TARGET - Date.now()
    if (diff <= 0) {
      done.value = true
      return
    }
    d.value = Math.floor(diff / 864e5)
    h.value = pad(Math.floor(diff / 36e5) % 24)
    m.value = pad(Math.floor(diff / 6e4) % 60)
    s.value = pad(Math.floor(diff / 1e3) % 60)
  }

  onMounted(() => {
    tick()
    timer = setInterval(tick, 1000)
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
  })

  return { d, h, m, s, done }
}
