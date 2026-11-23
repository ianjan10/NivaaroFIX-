import express from 'express';
import {
  parseCookies,
  verifyAdminSession,
  verifyCsrfToken,
  getClientIp
} from '../utils/adminSecurity.js';
import { AdminTransactionService } from '../modules/payments/adminTransactionService.js';
import { broadcastAdminEvent } from '../modules/realtime/adminRealtime.js';

const router = express.Router();

// Enforce standard admin security headers on all responses
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// Middleware: Authenticate Admin Session
async function requireAdminAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.admin_session;

  if (!sessionId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const sessionCheck = await verifyAdminSession(sessionId);
  if (!sessionCheck.valid || !sessionCheck.user) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid' });
  }

  req.adminUser = sessionCheck.user;
  next();
}

// Middleware: CSRF Token Check for State-Changing Requests
function requireAdminCsrf(req, res, next) {
  const token = req.headers['x-csrf-token'] || req.body?.csrfToken;
  if (!verifyCsrfToken(token)) {
    return res.status(403).json({ success: false, error: 'Invalid or missing CSRF token' });
  }
  next();
}

/**
 * GET /admin/registry/transactions
 * Retrieve paginated, filtered transactions with KPI totals
 */
router.get('/registry/transactions', requireAdminAuth, async (req, res) => {
  try {
    const { status, search, method, dateRange, sort, page, limit } = req.query;
    const data = await AdminTransactionService.getTransactions({
      status,
      search,
      method,
      dateRange,
      sort,
      page,
      limit
    });

    try {
      broadcastAdminEvent('transactions.updated', { paymentId: id });
    } catch (_) {}

    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    console.error('Error fetching admin transactions:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve transactions registry'
    });
  }
});

/**
 * GET /admin/registry/transactions/:id
 * Retrieve single transaction details for drawer
 */
router.get('/registry/transactions/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await AdminTransactionService.getTransactionDetail(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction record not found'
      });
    }

    try {
      broadcastAdminEvent('transactions.updated', { paymentId: id });
    } catch (_) {}

    res.json({
      success: true,
      transaction
    });
  } catch (err) {
    console.error('Error fetching transaction detail:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve transaction detail'
    });
  }
});

/**
 * POST /admin/registry/transactions/:id/refund
 * Administrative refund execution
 */
router.post('/registry/transactions/:id/refund', requireAdminAuth, requireAdminCsrf, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        error: 'A clear administrative reason is required for processing a refund.'
      });
    }

    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';

    const result = await AdminTransactionService.issueRefund({
      paymentId: id,
      adminId: req.adminUser.id,
      reason: reason.trim(),
      ip,
      userAgent
    });

    try {
      broadcastAdminEvent('transactions.updated', { paymentId: id });
    } catch (_) {}

    res.json({
      success: true,
      message: 'Refund successfully initiated and logged to audit trail.',
      ...result
    });
  } catch (err) {
    console.error('Error issuing admin refund:', err);
    res.status(400).json({
      success: false,
      error: err.message || 'Failed to execute administrative refund.'
    });
  }
});

export default router;
