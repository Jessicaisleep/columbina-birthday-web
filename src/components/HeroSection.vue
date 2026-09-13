<template>
  <header class="hero" ref="heroRef">
    <div class="hero-top" ref="topRef">
      <div class="hero-top-inner">
        <h1 class="title" ref="titleRef">新月再梦听羽生</h1>
        <p class="sub">哥伦比娅 · 生日企划</p>
        <div class="flourish">愿此月夜，献予哥伦比娅</div>
      </div>
    </div>
    <div class="countdown" id="countdown" ref="countdownRef" v-show="!done">
      <div class="cd-item"><div class="cd-num" id="cd-d">{{ d }}</div><div class="cd-label">天</div></div>
      <div class="cd-sep">·</div>
      <div class="cd-item"><div class="cd-num" id="cd-h">{{ h }}</div><div class="cd-label">时</div></div>
      <div class="cd-sep">·</div>
      <div class="cd-item"><div class="cd-num" id="cd-m">{{ m }}</div><div class="cd-label">分</div></div>
      <div class="cd-sep">·</div>
      <div class="cd-item"><div class="cd-num" id="cd-s">{{ s }}</div><div class="cd-label">秒</div></div>
    </div>
    <div class="cd-done" id="cdDone" ref="doneRef" v-show="done">☾ 生日会已经开始 ❋</div>
    <div class="scroll-hint" ref="hintRef"><div class="scroll-hint-inner">↓向 下↓<br><span class="line"></span></div></div>
  </header>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useCountdown } from '../composables/useCountdown'

/* 标题：cover 映射动态定位（基于 4096×2304 原图） */
const ORIG_W = 4096, ORIG_H = 2304
const NECK = { x: 0.5151, y: 0.44 }

const heroRef = ref(null)
const titleRef = ref(null)
const topRef = ref(null)
const countdownRef = ref(null)
const doneRef = ref(null)
const hintRef = ref(null)

const { d, h, m, s, done } = useCountdown()

function placeTitle() {
  const hero = heroRef.value
  if (!hero) return
  const Wc = hero.clientWidth, Hc = hero.clientHeight
  const scale = Math.max(Wc / ORIG_W, Hc / ORIG_H)
  const dispW = Wc / scale, dispH = Hc / scale
  const ox = (ORIG_W - dispW) / 2, oy = (ORIG_H - dispH) / 2
  const cx = (NECK.x * ORIG_W - ox) * scale
  const cy = (NECK.y * ORIG_H - oy) * scale
  const ts = parseFloat(getComputedStyle(titleRef.value).fontSize)
  topRef.value.style.left = cx + 'px'
  topRef.value.style.top = (cy - ts) + 'px'
}

/* 滚动提示：中心对齐倒计时 */
function alignHint() {
  const cd = countdownRef.value
  const doneEl = doneRef.value
  const hint = hintRef.value
  const hero = heroRef.value
  if (!hint || !hero) return
  const ref = (cd && cd.offsetWidth > 0) ? cd : doneEl
  if (!ref) return
  const hr = hero.getBoundingClientRect()
  const rr = ref.getBoundingClientRect()
  hint.style.left = (rr.left - hr.left + rr.width / 2) + 'px'
}

function onResize() {
  placeTitle()
  alignHint()
}

onMounted(() => {
  placeTitle()
  alignHint()
  addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  removeEventListener('resize', onResize)
})
</script>

<style scoped>
/* ---------- HERO ---------- */
.hero{
  position:relative;
  min-height:100vh;display:flex;flex-direction:column;align-items:center;text-align:center;
  padding:0 24px;
  background:
    linear-gradient(180deg, rgba(5,7,15,.52) 0%, rgba(5,7,15,.10) 32%, rgba(5,7,15,.08) 58%, rgba(5,7,15,.62) 86%, rgba(5,7,15,.9) 100%),
    url('../assets/hero_4k.png') no-repeat center / cover;
}
.hero-top{
  position:absolute;z-index:3;
  transform:translate(-50%,-50%);
  left:50%;top:50%;
  pointer-events:none;
}
.hero-top-inner{animation:rise 1.6s cubic-bezier(.2,.6,.2,1) both}
.hero .title{
  font-size:clamp(26px,4.2vw,44px);letter-spacing:.16em;line-height:1.3;
  background:linear-gradient(180deg,#ffffff 30%,var(--blue) 130%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 3px 14px rgba(5,7,15,.85));
}
.hero .sub{
  margin-top:8px;font-size:clamp(11px,1.4vw,15px);letter-spacing:.5em;color:#e6ebf7;
  text-shadow:0 2px 10px rgba(5,7,15,.9);
}
.hero .flourish{
  margin:14px 0 0;display:flex;align-items:center;justify-content:center;gap:14px;color:#b9c4dc;
  text-shadow:0 2px 8px rgba(5,7,15,.9);font-size:13px;
}
.hero .flourish::before,.hero .flourish::after{content:"";width:46px;height:1px;background:linear-gradient(90deg,transparent,#b9c4dc)}
.hero .flourish::after{background:linear-gradient(90deg,#b9c4dc,transparent)}
@keyframes rise{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}
/* 倒计时 */
.countdown{
  margin-top:auto;margin-bottom:64px;
  display:flex;gap:clamp(14px,3vw,34px);justify-content:center;flex-wrap:wrap;
  animation:rise 1.6s .65s cubic-bezier(.2,.6,.2,1) both;
}
.cd-item{min-width:86px}
.cd-num{
  font-family:var(--serif);font-size:clamp(32px,4.6vw,52px);line-height:1.15;
  color:#fff;text-shadow:0 2px 16px rgba(5,7,15,.95),0 0 44px rgba(255,255,255,.25);
  font-variant-numeric:tabular-nums;
}
.cd-label{font-size:12px;letter-spacing:.34em;color:#c6cfe2;text-shadow:0 1px 8px rgba(5,7,15,.9);margin-top:6px}
.cd-sep{align-self:center;font-family:var(--serif);color:var(--gold);font-size:clamp(20px,2.8vw,30px);transform:translateY(-8px);text-shadow:0 2px 10px rgba(5,7,15,.9)}
.cd-done{
  margin-top:auto;margin-bottom:64px;
  font-family:var(--serif);
  font-size:clamp(24px,3.6vw,40px);
  letter-spacing:.14em;color:var(--moon);
  text-shadow:0 2px 16px rgba(5,7,15,.95),0 0 44px rgba(255,255,255,.25);
  animation:rise 1.6s .65s cubic-bezier(.2,.6,.2,1) both;
}
.scroll-hint{
  position:absolute;bottom:12px;left:50%;transform:translateX(-50%);
  color:#c6cfe2;font-size:12px;letter-spacing:.3em;
  text-shadow:0 1px 8px rgba(5,7,15,.9);
}
.scroll-hint-inner{display:flex;flex-direction:column;align-items:center;gap:10px;animation:rise 1.6s 1s both}
.scroll-hint .line{width:1px;height:44px;background:linear-gradient(180deg,var(--blue),transparent);animation:drip 2.2s ease-in-out infinite}
@keyframes drip{0%{transform:scaleY(0);transform-origin:top}45%{transform:scaleY(1);transform-origin:top}55%{transform:scaleY(1);transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}

/* ---------- 响应式（Hero 部分） ---------- */
@media(max-width:520px){
  /* 手机窄屏：倒计时紧凑成一行 */
  .countdown{gap:8px}
  .cd-item{min-width:56px}
  .cd-num{font-size:26px}
  .cd-label{font-size:10px;letter-spacing:.18em}
  .cd-sep{font-size:15px}
  /* 手机上隐藏“向下”提示，避免与倒计时重叠 */
  .scroll-hint{display:none}
  .cd-done{font-size:22px;letter-spacing:.1em;margin-bottom:48px}
}
</style>
