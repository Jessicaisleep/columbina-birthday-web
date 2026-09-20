import { createApp } from 'vue'
import App from './App.vue'
import './styles/base.css'
import { initLocalization } from './i18n.js'

createApp(App).mount('#app')
requestAnimationFrame(() => {
  try {
    initLocalization()
  } catch (error) {
    if (import.meta.env.DEV) console.error('[localization]', error)
  }
})
