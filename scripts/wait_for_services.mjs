/**
 * Waits for backend, Dashboard, and WebLogin services to become responsive in CI and local environments.
 * Checks both localhost and 127.0.0.1 for IPv4/IPv6 resilience on Linux and Windows.
 */
const targets = [
  ['http://127.0.0.1:5000/api/health', 'http://localhost:5000/api/health'],
  ['http://127.0.0.1:5173', 'http://localhost:5173'],
  ['http://127.0.0.1:5500', 'http://localhost:5500']
];

async function checkOne(url) {
  try {
    const res = await fetch(url);
    if (res.status < 500) return true;
  } catch {
    // not yet listening
  }
  return false;
}

async function waitForAny(urls, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const url of urls) {
      if (await checkOne(url)) {
        return url;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for service at ${urls.join(' or ')}`);
}

async function main() {
  console.log('⏳ Waiting for development servers to be ready...');
  for (const urlGroup of targets) {
    process.stdout.write(`   Connecting to ${urlGroup[0]}... `);
    const readyUrl = await waitForAny(urlGroup);
    console.log(`✅ Online (${readyUrl})`);
  }
  console.log('🚀 All services are healthy and responding!\n');
}

main().catch((err) => {
  console.error('\n❌ Service health check failed:', err.message);
  process.exit(1);
});
