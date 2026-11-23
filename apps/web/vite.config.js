import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'admin-security-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/admin')) {
            const origSetHeader = res.setHeader.bind(res);
            res.setHeader = (key, val) => {
              if (typeof key === 'string' && key.toLowerCase() === 'cache-control') {
                return origSetHeader('Cache-Control', 'no-store');
              }
              return origSetHeader(key, val);
            };
            origSetHeader('Cache-Control', 'no-store');
            origSetHeader('X-Frame-Options', 'DENY');
            origSetHeader('Referrer-Policy', 'no-referrer');
            origSetHeader('X-Robots-Tag', 'noindex, nofollow');
          }
          next();
        });
      }
    }
  ],
  server: {
    port: 5173,
    host: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/admin/auth': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/admin/analytics': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/admin/registry': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/admin/feedbacks': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/admin/support': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        bypass: (req) => (req.headers.accept && req.headers.accept.includes('text/html') ? '/index.html' : null)
      },
      '/admin/approvals': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        bypass: (req) => (req.headers.accept && req.headers.accept.includes('text/html') ? '/index.html' : null)
      },
      '/admin/documents': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/admin/pii': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true
      }
    },
    fs: {
      strict: false,
      allow: ['..']
    }
  }
});
