import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// En développement, le front (5173) relaie l'API et le WebSocket vers le serveur (3000) : même origine, pas de CORS.
const SERVER = process.env.VITE_DEV_SERVER ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  build: {
    // Bibliothèques dans des fichiers à part : elles changent rarement, le navigateur les garde en cache d'une
    // mise à jour du jeu à l'autre et ne retélécharge que le code de Flash Poker.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          animation: ['framer-motion'],
          reseau: ['socket.io-client', 'zustand'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/rooms': SERVER,
      '/health': SERVER,
      '/auth': SERVER,
      '/me': SERVER,
      '/users': SERVER,
      '/invites': SERVER,
      '/socket.io': { target: SERVER, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 30_000,
  },
});
