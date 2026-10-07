import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5500,
    host: true,
    open: false,
    fs: {
      strict: false,
      allow: ['..', 'C:/NivaaroFIX-', 'D:/My Project']
    }
  }
});
