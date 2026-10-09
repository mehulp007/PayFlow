import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': process.env.PAYFLOW_API_URL ?? 'http://127.0.0.1:4000' },
  },
});
