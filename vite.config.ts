import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// 四个窗口共用一套构建产物：index / mini / float / flash
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  clearScreen: false,
  build: {
    target: 'chrome110',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        mini: resolve(__dirname, 'mini.html'),
        float: resolve(__dirname, 'float.html'),
        flash: resolve(__dirname, 'flash.html'),
      },
    },
  },
  server: {
    port: 5183,
    strictPort: true,
    host: '127.0.0.1',
  },
})
