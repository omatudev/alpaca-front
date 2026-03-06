import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: import.meta.env.VITE_BACKEND_URL,
        changeOrigin: true,
      },
      '/ws': {
        target: import.meta.env.VITE_WEBSOCKET_URL,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
