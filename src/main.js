import { createApp } from 'vue'
import App from './App.vue'
import './styles/base.css'
import { initLocalization } from './i18n.js'

createApp(App).mount('#app')
initLocalization()
