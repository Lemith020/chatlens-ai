import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],

  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,

    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Translate only this dev UI's same-origin requests. Foreign/null
            // origins and cross-site metadata still reach backend protections.
            if (req.headers.origin === 'http://127.0.0.1:5173') {
              proxyReq.setHeader('Origin', 'http://127.0.0.1:3001')
            }
          })
        },
      },
    },
  },
})
