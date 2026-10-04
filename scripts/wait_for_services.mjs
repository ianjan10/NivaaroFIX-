/**
 * Waits for backend, Dashboard, and WebLogin services to become responsive
 */
const targets = [
  'http://localhost:5000/api/health',
  'http://localhost:5173',
  'http://localhost:5500'
];

async function waitForOne(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      // Service not yet ready
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for service at ${url}`);
}

async function main() {
  console.log('⏳ Waiting for development servers to be ready...');
  for (const url of targets) {
    process.stdout.write(`   Connecting to ${url}... `);
    await waitForOne(url);
    console.log('✅ Online');
  }
  console.log('🚀 All services are healthy and responding!\n');
}

main().catch((err) => {
  console.error('\n❌ Service health check failed:', err.message);
  process.exit(1);
});
