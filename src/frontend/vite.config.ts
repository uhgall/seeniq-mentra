import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  base: '/webview/',
  envDir: path.resolve(__dirname, '../..'), // Use root .env file
  server: {
    port: 5173,
    // Allow any host for ngrok tunnels - users can use their own ngrok domains
    allowedHosts: true,
    hmr: {
      // HMR will work when accessing localhost:3000/webview directly
      // When accessing through ngrok/Porter, you'll need to manually refresh
      overlay: true,
    },
    proxy: {
      '/api': {
        // Proxy API requests to backend
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/assets': {
        // Proxy assets to backend
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
