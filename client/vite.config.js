import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Librerías en un archivo aparte: cambian poco, el navegador las guarda en caché entre versiones
        manualChunks: {
          react: ['react', 'react-dom', 'react-router', '@tanstack/react-query'],
          ui: ['@radix-ui/react-dialog', 'lucide-react'],
          shared: ['@pescaderia/shared'],
        },
      },
    },
  },
});
