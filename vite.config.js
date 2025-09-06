// vite.config.js
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const espIp = env.VITE_ESP_IP || '192.168.0.185';
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/esp': {
          target: `http://${espIp}`,
          changeOrigin: true,
          rewrite: p => p.replace(/^\/esp/, ''),
        },
      },
    },
  };
});
