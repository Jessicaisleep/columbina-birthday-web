import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 相对路径，方便部署到 GitHub Pages 子路径或任意静态托管
  base: './',
  server: {
    // 本地开发时把 /api 转发给本机后端（node server/index.js，默认 8788）
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
})
