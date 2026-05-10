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
  }
})