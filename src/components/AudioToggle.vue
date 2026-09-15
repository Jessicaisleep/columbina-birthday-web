<template>
  <button
    class="audio-toggle"
    :class="{ playing }"
    type="button"
    :aria-label="playing ? '关闭背景音乐' : '播放背景音乐'"
    :aria-pressed="playing"
    :title="playing ? '关闭背景音乐' : '播放背景音乐'"
    @click="toggle"
  >
    <svg class="audio-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path class="spk" d="M11 5.4 6.5 9.1H3.4a1 1 0 0 0-1 1v3.8a1 1 0 0 0 1 1h3.1L11 18.6z" />
      <template v-if="playing">
        <path class="wave" d="M14.5 9.1a4.2 4.2 0 0 1 0 5.8" />
        <path class="wave" d="M17.2 6.4a8 8 0 0 1 0 11.2" />
      </template>
      <path v-else class="slash" d="M14.5 8.7 20.7 15.3" />
    </svg>
    <audio
      ref="audioRef"
      src="./audio/nod-krai.mp3"
      loop
      preload="none"
    ></audio>
  </button>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const audioRef = ref(null)
/* 默认开启：图标进站即显示「播放中」 */
const playing = ref(true)
const VOLUME = 0.5

/* 进站不主动播放：页面下滑（或首次点击/按键）后才开始；一直不动就保持安静 */
const SCROLL_TRIGGERS = ['scroll', 'wheel', 'touchmove']
const ACTION_TRIGGERS = ['pointerdown', 'keydown']
const SCROLLED_PX = 6

let armed = false

function onScrollTrigger() {
  if (window.scrollY > SCROLLED_PX || document.documentElement.scrollTop > SCROLLED_PX) attemptPlay()
}

function onActionTrigger(e) {
  if (e.target && e.target.closest && e.target.closest('.audio-toggle')) return
  attemptPlay()
}

function armStartWatch() {
  if (armed) return
  armed = true
  SCROLL_TRIGGERS.forEach((type) => window.addEventListener(type, onScrollTrigger, { passive: true }))
  ACTION_TRIGGERS.forEach((type) => document.addEventListener(type, onActionTrigger, { passive: true }))
}

function stopStartWatch() {
  if (!armed) return
  armed = false
  SCROLL_TRIGGERS.forEach((type) => window.removeEventListener(type, onScrollTrigger))
  ACTION_TRIGGERS.forEach((type) => document.removeEventListener(type, onActionTrigger))
}

function attemptPlay() {
  const el = audioRef.value
  if (!el || !playing.value || !el.paused) return
  el.volume = VOLUME
  const promise = el.play()
  if (promise && typeof promise.then === 'function') {
    promise.then(stopStartWatch).catch(() => { /* 还没拿到播放许可，继续等下一次交互 */ })
  }
}

function toggle() {
  const el = audioRef.value
  if (!el) return
  if (playing.value) {
    playing.value = false
    stopStartWatch()
    el.pause()
  } else {
    playing.value = true
    attemptPlay()
  }
}

/* 离开页面先暂停：避免主站 BGM 与游戏音乐叠在一起响（手机 bfcache 尤为明显） */
function onPageHide() {
  const el = audioRef.value
  if (el && !el.paused) el.pause()
}

/* 用前进/后退回到本页时，若本来在播就接着播 */
function onPageShow(event) {
  if (event && event.persisted && playing.value) attemptPlay()
}

onMounted(() => {
  armStartWatch()
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
})

onBeforeUnmount(() => {
  stopStartWatch()
  window.removeEventListener('pagehide', onPageHide)
  window.removeEventListener('pageshow', onPageShow)
})
</script>

<style scoped>
.audio-toggle{
  position:fixed;z-index:60;top:22px;right:22px;
  width:46px;height:46px;padding:0;cursor:pointer;
  display:grid;place-items:center;
  border:1px solid var(--line);border-radius:50%;
  background:rgba(8,12,26,.42);
  backdrop-filter:blur(6px);
  color:var(--blue);
  transition:color .35s,border-color .35s,background .35s,transform .35s;
}
.audio-toggle:hover{color:var(--gold);border-color:rgba(230,200,138,.5);background:rgba(8,12,26,.62);transform:translateY(-2px)}
.audio-toggle.playing{color:var(--moon);border-color:rgba(157,184,232,.4)}
.audio-icon{width:22px;height:22px;display:block;overflow:visible}
.spk{fill:currentColor;stroke:none}
.wave,.slash{fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round}
.slash{stroke:var(--gold)}
.audio-toggle.playing .wave{animation:pulse 1.8s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.55}50%{opacity:1}}

@media(max-width:520px){
  .audio-toggle{top:12px;right:12px;width:40px;height:40px}
  .audio-icon{width:19px;height:19px}
}
</style>
