import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import dispatchRoutes from './routes/dispatchRoutes.js';
import discoveryRoutes from './modules/discovery/discoveryRoutes.js';
import apiRoutes from './routes/apiRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import verificationRoutes from './routes/verificationRoutes.js';
import adminAuthRoutes from './routes/adminAuthRoutes.js';
import adminApprovalsRoutes from './routes/adminApprovalsRoutes.js';
import adminAnalyticsRoutes from './routes/adminAnalyticsRoutes.js';
import adminFeedbackRoutes from './routes/adminFeedbackRoutes.js';
import adminTransactionRoutes from './routes/adminTransactionRoutes.js';
import publicFeedbackRoutes from './routes/publicFeedbackRoutes.js';
import supportRoutes from './routes/supportRoutes.js';
import adminSupportRoutes from './routes/adminSupportRoutes.js';
import { validateProductionAdminSecurity, parseCookies, verifyAdminSession } from './utils/adminSecurity.js';
import { initAdminWebSocket, handleAdminUpgrade, registerAdminStream } from './modules/realtime/adminRealtime.js';
import { PaymentService } from './modules/payments/paymentService.js';

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { initTrackingWebSocket, handleTrackingUpgrade } from './modules/tracking/trackingSocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Configurable Production & Development CORS
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5500';
const allowedOrigins = rawAllowedOrigins.split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser agents (curl, server-to-server) or approved origins
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for unauthorized origin: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({
  limit: '25mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// REST API Routes
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/payments', paymentRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/verification', verificationRoutes);
app.use('/admin', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use('/admin/auth', adminAuthRoutes);

// Realtime SSE stream for Admin dashboard
app.get(['/admin/realtime/events', '/api/admin/realtime/events'], async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.admin_session;
  if (!sessionId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const sessionCheck = await verifyAdminSession(sessionId);
  if (!sessionCheck.valid || !sessionCheck.user) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid' });
  }
  registerAdminStream(req, res, sessionCheck.user);
});
app.use('/admin', adminApprovalsRoutes);
app.use('/admin', adminAnalyticsRoutes);
app.use('/admin', adminFeedbackRoutes);
app.use('/admin', adminTransactionRoutes);
app.use('/admin/support', adminSupportRoutes);
app.use('/api/admin/support', adminSupportRoutes);
app.use('/api/support', supportRoutes);
app.use('/uploads/support_attachments', express.static(path.join(__dirname, '../uploads/support_attachments')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api', publicFeedbackRoutes);
app.use('/api', apiRoutes);
app.use('/geo', apiRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'NivaaroFix PostgreSQL REST & OAuth API',
    database: 'PostgreSQL 18.6 (nivaarofix_db)',
    timestamp: new Date().toISOString()
  });
});

// Explicit JSON 404 for all /api routes (never returns HTML)
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Explicit JSON error handler for all routes (never returns HTML)
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

async function startServer() {
  try {
    const mapProvider = process.env.MAP_PROVIDER || 'osm_osrm';
    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
    const mapboxToken = process.env.MAPBOX_TOKEN;

    if (process.env.NODE_ENV === 'production') {
      if (mapProvider === 'google' && !googleMapsKey) {
        console.error('❌ FATAL: GOOGLE_MAPS_API_KEY is required in production when MAP_PROVIDER=google');
        process.exit(1);
      }
      if (mapProvider === 'mapbox' && !mapboxToken) {
        console.error('❌ FATAL: MAPBOX_TOKEN is required in production when MAP_PROVIDER=mapbox');
        process.exit(1);
      }
    } else {
      console.log(`🗺️  Map Provider Adapter: ${mapProvider} (Keyless development mode: Carto Positron & OSRM routing)`);
    }

    await initDatabase();
    await validateProductionAdminSecurity();
    initTrackingWebSocket();
    initAdminWebSocket();

    server.on('upgrade', (req, socket, head) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/ws/tracking') {
          handleTrackingUpgrade(req, socket, head);
        } else if (url.pathname === '/ws/admin') {
          handleAdminUpgrade(req, socket, head);
        } else {
          socket.destroy();
        }
      } catch (_) {
        socket.destroy();
      }
    });

    // Periodic payment reconciliation runner (reconciles stuck processing/due payments)
    const reconciliationInterval = setInterval(() => {
      PaymentService.runReconciliation().catch(err => {
        console.warn('Scheduled payment reconciliation notice:', err.message);
      });
    }, 5 * 60 * 1000);
    if (reconciliationInterval.unref) reconciliationInterval.unref();

    server.listen(PORT, () => {
      console.log(`🚀 NivaaroFix Auth API listening on http://localhost:${PORT}`);
      console.log(`📊 PostgreSQL Database: ${process.env.PG_DATABASE || 'nivaarofix_db'} on port ${process.env.PG_PORT || '5432'}`);
    });
  } catch (err) {
    console.error('❌ Failed to start backend server:', err);
    process.exit(1);
  }
}

startServer();

