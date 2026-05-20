import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // 🎯 CHANGE THIS PORT TO MATCH YOUR BACKEND TERMINAL EXACTLY!
        target: 'http://localhost:5000', 
        changeOrigin: true,
        secure: false,
      }
    }
  }
});