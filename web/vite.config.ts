import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/internal': {
        target: 'http://localhost:8044',
        changeOrigin: true,
      },
      '/v1': {
        target: 'http://localhost:8044',
        changeOrigin: true,
      },
      '/v1beta': {
        target: 'http://localhost:8044',
        changeOrigin: true,
      },
    },
  },
})
