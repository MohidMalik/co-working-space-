import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeDatabase, saveDatabaseToDisk } from './src/server/db';
import { registerAuthAndAdminRoutes } from './src/server/routes/authAndUsers';
import { registerOperationsRoutes } from './src/server/routes/operations';
import { registerAiGuideRoutes } from './src/server/routes/aiGuide';

async function startServer() {
  await initializeDatabase();

  const app = express();
  const PORT = 3000;

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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const APP_ROOT = process.env.COWORKING_APP_ROOT || process.cwd();
    const distPath = path.join(APP_ROOT, 'web-dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`DaftarPro Coworking Management Server running at http://0.0.0.0:${PORT}`);
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
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
