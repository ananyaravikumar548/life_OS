import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.PORT || '3001'
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: Number(env.VITE_DEV_PORT) || 5173,
      proxy: {
        '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
      },
    },
  }
})
