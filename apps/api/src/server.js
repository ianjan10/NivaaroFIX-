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

import http from 'http';
import { initTrackingWebSocket } from './modules/tracking/trackingSocket.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5500'],
  credentials: true
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// REST API Routes
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api', apiRoutes);

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
    initTrackingWebSocket(server);
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

