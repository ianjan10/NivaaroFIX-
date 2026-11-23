import { createServer } from 'vite';
import path from 'path';

const appDir = import.meta.dirname;

const server = await createServer({
  configFile: path.resolve(appDir, 'vite.config.js'),
  root: appDir
});
await server.listen();
console.log(`Web server running at http://localhost:${server.config.server.port}`);
