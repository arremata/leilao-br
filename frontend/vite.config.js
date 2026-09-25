import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const remoteApi = loadEnv(mode, '.', 'VITE_').VITE_DEV_API_ORIGIN;
  return {
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: remoteApi || 'http://localhost:8000',
        changeOrigin: Boolean(remoteApi),
        rewrite: (path) => remoteApi ? path : path.replace(/^\/api/, ''),
        bypass: (req, res) => {
          if (remoteApi && !['GET', 'HEAD'].includes(req.method)) {
            res.statusCode = 403;
            res.end('O preview local permite somente consultas.');
            return false;
          }
        },
      },
    },
  },
  };
})
