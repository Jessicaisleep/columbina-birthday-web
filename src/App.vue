<template>
  <SkyCanvas />
  <div class="grain"></div>
  <div class="vignette"></div>

  <AudioToggle />
  <HeroSection />
  <IntroSection />
  <WorksSection />
  <GameSection />
  <TimelineSection />
  <CtaSection @join="joinOpen = true" />
  <SiteFooter />

  <JoinModal :open="joinOpen" @close="joinOpen = false" />
  <LandscapeGate />
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
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

const joinOpen = ref(false)

/* 滚动显现 */
onMounted(() => {
  nextTick(() => {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in')
          io.unobserve(e.target)
        }
      })
    }, { threshold: 0.12 })
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el))
  })
})
</script>
