<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { DICE_ENTRY } from '../games/teyvatDice.js'
import { playSfx } from '../games/sound.js'

/* 提瓦特战力党是零依赖的单文件游戏，源码原样放在 public/teyvat-dice/。
   这里不重写它（它经过 39600 局蒙特卡洛校准，重写等于把平衡和 AI 全丢掉），
   而是用 iframe 承载，保留它自己的 16:9 舞台、竖屏挡层与全屏按钮。

   注意 iframe 必须带 allow="fullscreen"：游戏内右上角有全屏按钮，
   没有这个授权，浏览器会静默拒绝它的全屏请求。 */
const emit = defineEmits(['back'])

const frame = ref(null)
const loading = ref(true)
let safetyTimer = 0

function goBack() {
  playSfx('ui')
  emit('back')
}

function onFrameLoad() {
  loading.value = false
  clearTimeout(safetyTimer)
}

onMounted(() => {
  nextTick(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  /* 兜底：万一 load 事件没来（个别国产浏览器对 iframe 事件不靠谱），
     也不要让「进入提瓦特…」一直糊在画面上 */
  safetyTimer = window.setTimeout(() => { loading.value = false }, 12000)
})

onBeforeUnmount(() => clearTimeout(safetyTimer))
</script>

<template>
  <section class="game-page dice-page">
    <header class="game-header">
      <button class="back-button" type="button" @click="goBack"><span>←</span> 返回游廊</button>
      <div class="game-title">
        <span class="status-dot"></span>
        <strong>提瓦特战力党</strong>
      </div>
      <div class="best-score">TEYVAT POWER DICE</div>
    </header>

    <div class="dice-layout">
      <div class="dice-frame-wrap">
        <iframe
          ref="frame"
          class="dice-frame"
          :src="DICE_ENTRY"
          title="提瓦特战力党"
          allow="fullscreen"
          @load="onFrameLoad"
        ></iframe>
        <div v-if="loading" class="dice-loading">
          <span class="dice-moon" aria-hidden="true">☾</span>
          <p>PREPARING DREAM</p>
          <h2>提瓦特战力党</h2>
          <small>进入提瓦特…</small>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dice-layout {
  min-height: 0;
  flex: 1;
  padding: clamp(10px, 2vw, 26px);
}
.dice-frame-wrap {
  position: relative;
  width: min(1440px, 100%);
  height: 100%;
  min-height: 430px;
  margin: auto;
  overflow: hidden;
  border: 1px solid rgba(216, 239, 255, .4);
  border-radius: 3px;
  background: #05070e;
  box-shadow: 0 24px 80px rgba(0, 0, 30, .42);
}
.dice-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
.dice-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  background: radial-gradient(circle at 50% 0, #233a8a 0, #07112e 62%);
}
.dice-moon {
  font-size: 40px;
  color: var(--ice, #a9efff);
  filter: drop-shadow(0 0 18px rgba(140, 222, 255, .8));
}
.dice-loading p {
  margin: 0;
  font-size: 10px;
  letter-spacing: .22em;
  color: rgba(229, 237, 255, .6);
}
.dice-loading h2 {
  margin: 0;
  font-family: var(--serif, serif);
  font-size: clamp(22px, 3vw, 34px);
  font-weight: 600;
  letter-spacing: .1em;
}
.dice-loading small {
  color: rgba(229, 237, 255, .5);
  font-size: 12px;
  letter-spacing: .1em;
}

@media (max-width: 800px) {
  .dice-layout { padding: 7px; }
  .dice-frame-wrap { min-height: 0; width: 100%; margin: 0; }
}
</style>
