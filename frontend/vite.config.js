import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
  resolve: {
    alias: {
      // Dùng path.resolve để biến @ thành đường dẫn tuyệt đối đến thư mục src
      '@': path.resolve(__dirname, './src'),
    },
  },
});