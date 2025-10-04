import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const espIp = process.env.VITE_ESP_IP || '192.168.0.185';

export default defineConfig(({ mode }) => ({
  base: mode === 'development' ? '/' : './', // важливо для Electron (file://)
  plugins: [react()],
  server: {
    proxy: {
      '/esp': {
        target: `http://${espIp}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/esp/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
}));
