import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        // 127.0.0.1 (e não localhost): o Node resolve localhost para ::1 (IPv6)
        // e o uvicorn em 0.0.0.0 só atende IPv4 no Windows.
        target: 'http://127.0.0.1:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
