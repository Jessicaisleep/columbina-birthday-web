<template>
  <SkyCanvas />
  <div class="grain"></div>
  <div class="vignette"></div>

  <AudioToggle />

  <template v-if="view === 'signup'">
    <SubmitPage @back="go('home')" />
  </template>
  <template v-else>
    <HeroSection />
    <IntroSection />
    <WorksSection />
    <GameSection />
    <TimelineSection />
    <CtaSection @join="joinOpen = true" @signup="go('signup')" />
    <SiteFooter />
  </template>

  <JoinModal :open="joinOpen" @close="joinOpen = false" />
  <LandscapeGate />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import SkyCanvas from './components/SkyCanvas.vue'
import AudioToggle from './components/AudioToggle.vue'
import HeroSection from './components/HeroSection.vue'
import IntroSection from './components/IntroSection.vue'
import WorksSection from './components/WorksSection.vue'
import GameSection from './components/GameSection.vue'
import TimelineSection from './components/TimelineSection.vue'
import CtaSection from './components/CtaSection.vue'
import SiteFooter from './components/SiteFooter.vue'
import JoinModal from './components/JoinModal.vue'
import LandscapeGate from './components/LandscapeGate.vue'
import SubmitPage from './components/SubmitPage.vue'

const joinOpen = ref(false)

/* 页面内切换首页 / 报名页（不跳新标签页），用 hash 记录，刷新和后退都能回到原处 */
const SIGNUP_HASH = '#/signup'
const view = ref(window.location.hash === SIGNUP_HASH ? 'signup' : 'home')

function go(next) {
  view.value = next
  const want = next === 'signup' ? SIGNUP_HASH : ''
  if (window.location.hash !== want) {
    if (next === 'signup') window.location.hash = SIGNUP_HASH
    else window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  if (next === 'home') nextTick(observeReveals)
  window.scrollTo({ top: 0, behavior: 'auto' })
}

function onHashChange() {
  const want = window.location.hash === SIGNUP_HASH ? 'signup' : 'home'
  if (want !== view.value) {
    view.value = want
    if (want === 'home') nextTick(observeReveals)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
}

/* 滚动显现 */
function observeReveals() {
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in')
        io.unobserve(e.target)
      }
    })
  }, { threshold: 0.12 })
  document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el))
}

onMounted(() => {
  window.addEventListener('hashchange', onHashChange)
  nextTick(observeReveals)
})

onBeforeUnmount(() => window.removeEventListener('hashchange', onHashChange))
</script>
