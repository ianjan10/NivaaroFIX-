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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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

// Initialize database schema and start server
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 NivaaroFix Auth API listening on http://localhost:${PORT}`);
      console.log(`📊 PostgreSQL Database: ${process.env.PG_DATABASE || 'nivaarofix_db'} on port ${process.env.PG_PORT || '5432'}`);
    });
  } catch (err) {
    console.error('❌ Failed to start backend server:', err);
    process.exit(1);
  }
}

startServer();
