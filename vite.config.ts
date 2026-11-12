import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('exceljs')) return 'excel-vendor';
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) return 'pdf-vendor';
          if (id.includes('qrcode') || id.includes('jsqr')) return 'qr-vendor';
          if (id.includes('lucide-react')) return 'icons-vendor';
          if (
            id.includes('/react/') ||
            id.includes('\\react\\') ||
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('@remix-run') ||
            id.includes('scheduler')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});

