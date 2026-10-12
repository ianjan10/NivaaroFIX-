import EventEmitter from 'events';

class RealtimeBus extends EventEmitter {}
const eventBus = new RealtimeBus();

// Maximum listeners to avoid Node warnings during active concurrency
eventBus.setMaxListeners(500);

// Active SSE client maps
const customerClients = new Map(); // requestRef -> Set(res)
const providerClients = new Map(); // normalized email -> Set(res)

// Periodic heartbeat to keep SSE connections alive
setInterval(() => {
  const ping = ': heartbeat\n\n';
  customerClients.forEach((clients) => {
    clients.forEach((res) => {
      try {
        res.write(ping);
      } catch (err) {
        // ignore closed sockets
      }
    });
  });
  providerClients.forEach((clients) => {
    clients.forEach((res) => {
      try {
        res.write(ping);
      } catch (err) {
        // ignore closed sockets
      }
    });
  });
}, 20000);

/**
 * Register an SSE stream for a customer tracking a service request.
 */
export function registerCustomerStream(requestRef, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.flushHeaders?.();

  if (!customerClients.has(requestRef)) {
    customerClients.set(requestRef, new Set());
  }
  const clients = customerClients.get(requestRef);
  clients.add(res);

  // Send initial handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ requestRef, connectedAt: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    clients.delete(res);
    if (clients.size === 0) {
      customerClients.delete(requestRef);
    }
  });
}

/**
 * Register an SSE stream for a provider listening for nearby requests and status changes.
 */
export function registerProviderStream(email, req, res) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.flushHeaders?.();

  if (!providerClients.has(normalizedEmail)) {
    providerClients.set(normalizedEmail, new Set());
  }
  const clients = providerClients.get(normalizedEmail);
  clients.add(res);

  res.write(`event: connected\ndata: ${JSON.stringify({ providerEmail: normalizedEmail, connectedAt: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    clients.delete(res);
    if (clients.size === 0) {
      providerClients.delete(normalizedEmail);
    }
  });
}

/**
 * Send an event to the customer watching a service request.
 */
export function notifyCustomer(requestRef, eventName, payload) {
  const clients = customerClients.get(requestRef);
  if (clients && clients.size > 0) {
    const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    clients.forEach((res) => {
      try {
        res.write(data);
      } catch (err) {
        clients.delete(res);
      }
    });
  }
  eventBus.emit(`customer:${requestRef}`, { eventName, payload });
}

/**
 * Send an event to a specific service provider.
 */
export function notifyProvider(email, eventName, payload) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const clients = providerClients.get(normalizedEmail);
  if (clients && clients.size > 0) {
    const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    clients.forEach((res) => {
      try {
        res.write(data);
      } catch (err) {
        clients.delete(res);
      }
    });
  }
  eventBus.emit(`provider:${normalizedEmail}`, { eventName, payload });
}

/**
 * Notify multiple providers (e.g. dispatched providers in a discovery radius wave).
 */
export function broadcastToProviders(emails, eventName, payload) {
  if (!Array.isArray(emails)) return;
  emails.forEach((email) => {
    notifyProvider(email, eventName, payload);
  });
}

export default {
  registerCustomerStream,
  registerProviderStream,
  notifyCustomer,
  notifyProvider,
  broadcastToProviders,
  eventBus
};
