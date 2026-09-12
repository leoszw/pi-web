import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:3210', ws: true },
      '/api': { target: 'http://127.0.0.1:3210' },
    },
  },
})
