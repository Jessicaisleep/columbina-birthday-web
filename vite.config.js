import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 相对路径，方便部署到 GitHub Pages 子路径或任意静态托管
  base: './',
})
