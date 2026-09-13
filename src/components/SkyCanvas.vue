<template>
  <canvas id="sky" ref="canvasRef"></canvas>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const canvasRef = ref(null)
let ctx = null
let parts = []
let stars = []
let rafId = null

function resize() {
  const sky = canvasRef.value
  sky.width = innerWidth * devicePixelRatio
  sky.height = innerHeight * devicePixelRatio
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
}

/* 霜粒 / 光羽 */
class Part {
  constructor(init) {
    this.reset(init)
  }
  reset(init) {
    this.x = Math.random() * innerWidth
    this.y = init ? -20 - Math.random() * innerHeight * 0.4 : Math.random() * innerHeight
    this.v = 0.25 + Math.random() * 0.6
    this.size = 0.6 + Math.random() * 2.1
    this.rot = Math.random() * Math.PI * 2
    this.rv = (Math.random() - .5) * 0.01
    this.a = 0.10 + Math.random() * 0.35
    this.flick = Math.random() * Math.PI * 2
    this.isFeather = Math.random() < 0.16
  }
  draw() {
    this.y += this.v * (this.isFeather ? 0.55 : 1)
    this.x += Math.sin(this.y * 0.008 + this.flick) * 0.35
    this.rot += this.rv
    if (this.y > innerHeight + 10) this.reset(true)
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rot)
    ctx.globalAlpha = this.a * (0.7 + 0.3 * Math.sin(performance.now() * 0.001 + this.flick))
    if (this.isFeather) {
      ctx.beginPath()
      ctx.moveTo(0, -3.4); ctx.quadraticCurveTo(3, 0, 0, 3.4); ctx.quadraticCurveTo(-3, 0, 0, -3.4)
      ctx.fillStyle = '#cddcf5'
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(0, 0, this.size, 0, Math.PI * 2)
      ctx.fillStyle = '#dfe7f6'
      ctx.fill()
    }
    ctx.restore()
  }
}

function frame(t) {
  ctx.clearRect(0, 0, innerWidth, innerHeight)
  // 夜空渐变（半透明，透出宣传图）
  const bg = ctx.createLinearGradient(0, 0, 0, innerHeight)
  bg.addColorStop(0, 'rgba(5,7,15,.32)')
  bg.addColorStop(0.5, 'rgba(5,7,15,0)')
  bg.addColorStop(1, 'rgba(5,7,15,.38)')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, innerWidth, innerHeight)
  // 星星
  for (const s of stars) {
    s.t += 0.01
    ctx.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(s.t)) * 0.8
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = '#dbe4f5'
    ctx.fill()
  }
  ctx.globalAlpha = 1
  for (const p of parts) p.draw()
  rafId = requestAnimationFrame(frame)
}

onMounted(() => {
  ctx = canvasRef.value.getContext('2d')
  resize()
  addEventListener('resize', resize)
  for (let i = 0; i < 46; i++) parts.push(new Part(false))
  stars = Array.from({ length: 80 }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight * 0.8,
    r: Math.random() * 1.1 + 0.2,
    a: Math.random() * 0.7 + 0.15,
    t: Math.random() * 6
  }))
  rafId = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  removeEventListener('resize', resize)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>
