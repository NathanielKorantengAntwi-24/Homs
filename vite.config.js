import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Allows ngrok and local connections simultaneously
    allowedHosts: true, 
    cors: true,
    hmr: {
      // This is the magic line: it tells Vite to use the browser's 
      // current URL for the websocket connection.
      host: 'localhost', 
      protocol: 'ws',
    },
    
    proxy: {
      '/api/recommendations': {
        // Points directly to your active local Firebase Emulator Function instance path
        target: 'http://127.0.0.1:5001/homs-system-d71d5/africa-south1/recommendations',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/recommendations/, ''),
      }
    }
  }
})