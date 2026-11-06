import express from 'express';
import fs from 'fs';
import path from 'path';
import { initializeDatabase, saveDatabaseToDisk } from './src/server/db';
import { registerAuthAndAdminRoutes } from './src/server/routes/authAndUsers';
import { registerOperationsRoutes } from './src/server/routes/operations';
import { registerAiGuideRoutes } from './src/server/routes/aiGuide';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

async function startProductionServer() {
  await initializeDatabase();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = '127.0.0.1';

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const apiRouter = express.Router();
  registerAuthAndAdminRoutes(apiRouter);
  registerOperationsRoutes(apiRouter);
  registerAiGuideRoutes(apiRouter);

  app.use('/api', apiRouter);

  // Error handler for API routes
  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  const APP_ROOT = process.env.COWORKING_APP_ROOT || process.cwd();
  const distPath = path.join(APP_ROOT, 'web-dist');

  app.use(express.static(distPath));

  // Fallback static file reader for packaged Electron asar archives
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    if (req.path.startsWith('/api')) {
      return next();
    }
    const safeRelPath = req.path.replace(/^\/+/, '');
    if (!safeRelPath) {
      return next();
    }
    const candidatePath = path.join(distPath, safeRelPath);
    try {
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        const ext = path.extname(candidatePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const content = fs.readFileSync(candidatePath);
        res.setHeader('Content-Type', contentType);
        return res.send(content);
      }
    } catch {
      // Fall through to SPA index.html handler
    }
    next();
  });

  app.get('*', (_req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    try {
      if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, 'utf-8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      }
    } catch {
      // Fallback to res.sendFile
    }
    res.sendFile(indexPath);
  });

  const server = app.listen(PORT, HOST, () => {
    console.log(`Coworking Space Production Server running at http://${HOST}:${PORT}`);
  });

  const gracefulShutdown = () => {
    try {
      saveDatabaseToDisk();
    } catch (e) {
      console.error('Error flushing database on shutdown:', e);
    }
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      gracefulShutdown();
    }
  });
}

startProductionServer().catch((err) => {
  console.error('Failed to start production server:', err);
  process.exit(1);
});
