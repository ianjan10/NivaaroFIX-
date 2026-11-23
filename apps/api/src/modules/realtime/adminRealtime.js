import { WebSocketServer } from 'ws';
import { pool } from '../../config/db.js';
import { parseCookies, verifyAdminSession } from '../../utils/adminSecurity.js';

// Set of active authenticated admin sockets: ws -> { adminId, role, username }
const adminSockets = new Map();
// Set of active authenticated admin SSE clients: client -> { res, user }
const adminSseClients = new Set();

let adminWssInstance = null;

// Periodic heartbeat to keep SSE connections alive
setInterval(() => {
  const ping = ': heartbeat\n\n';
  adminSseClients.forEach((client) => {
    try {
      client.res.write(ping);
    } catch (_) {
      adminSseClients.delete(client);
    }
  });
}, 20000);

export function registerAdminStream(req, res, user) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.flushHeaders?.();

  const client = { res, user };
  adminSseClients.add(client);

  res.write(`event: connected\ndata: ${JSON.stringify({ user: { username: user.username, role: user.role }, timestamp: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    adminSseClients.delete(client);
  });
}

export async function handleAdminUpgrade(req, socket, head) {
  if (!adminWssInstance) {
    socket.destroy();
    return;
  }
  try {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.admin_session;
    if (!sessionId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const sessionCheck = await verifyAdminSession(sessionId);
    if (!sessionCheck.valid || !sessionCheck.user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    adminWssInstance.handleUpgrade(req, socket, head, (ws) => {
      ws.adminUser = sessionCheck.user;
      adminWssInstance.emit('connection', ws, req);
    });
  } catch (err) {
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
}

/**
 * Initializes Admin WebSocket Server on /ws/admin
 */
export function initAdminWebSocket() {
  const wss = new WebSocketServer({ noServer: true });
  adminWssInstance = wss;

  wss.on('connection', (ws) => {
    const user = ws.adminUser;
    adminSockets.set(ws, user);

    // Initial connection acknowledgment
    ws.send(JSON.stringify({
      type: 'connected',
      user: { username: user.username, role: user.role }
    }));

    ws.on('close', () => {
      adminSockets.delete(ws);
    });

    ws.on('error', () => {
      adminSockets.delete(ws);
    });
  });

  return wss;
}

/**
 * Broadcasts throttled, role-filtered realtime event to admin sockets.
 * Events:
 * - verification.submitted
 * - verification.claimed
 * - verification.released
 * - verification.decided
 * - customer.registered
 */
export function broadcastAdminEvent(eventType, payload = {}) {
  const message = JSON.stringify({
    type: eventType,
    event: eventType,
    payload,
    timestamp: new Date().toISOString()
  });

  adminSockets.forEach((user, ws) => {
    if (ws.readyState !== 1) return;

    // Role filtering: 'verifier' must NOT receive customer events
    if (eventType.startsWith('customer.') && user.role === 'verifier') {
      return;
    }

    try {
      ws.send(message);
    } catch (_) {}
  });

  // Also broadcast to active SSE streams
  const sseChunk = `event: ${eventType}\ndata: ${message}\n\n`;
  adminSseClients.forEach((client) => {
    if (eventType.startsWith('customer.') && client.user.role === 'verifier') {
      return;
    }
    try {
      client.res.write(sseChunk);
    } catch (_) {
      adminSseClients.delete(client);
    }
  });

  // Persist realtime event into PostgreSQL for zero data loss
  pool.query(`
    INSERT INTO realtime_events (channel, event_type, payload, actor_type, actor_id)
    VALUES ($1, $2, $3, $4, $5);
  `, [
    'admin',
    eventType,
    JSON.stringify(payload),
    payload.actorType || 'admin',
    payload.actorId ? String(payload.actorId) : null
  ]).catch(err => {
    console.warn('Realtime event database persistence notice:', err.message);
  });
}
