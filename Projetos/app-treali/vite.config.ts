import { resolve } from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { trealiApiPlugin } from './src/vite-plugin-api.ts'

export default defineConfig({
  plugins: [trealiApiPlugin(), tailwindcss()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html')
      }
    }
  }
})
