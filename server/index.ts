import fs from 'fs';
import path from 'path';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { getDb } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { studentsRouter } from './routes/students.js';
import { roomsRouter } from './routes/rooms.js';
import { leavesRouter } from './routes/leaves.js';
import { complaintsRouter } from './routes/complaints.js';
import { messRouter } from './routes/mess.js';
import { movementsRouter } from './routes/movements.js';
import { noticesRouter } from './routes/notices.js';
import { staffRouter } from './routes/staff.js';
import { reportsRouter } from './routes/reports.js';
import { settingsRouter } from './routes/settings.js';
import { uploadsRouter } from './routes/uploads.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'ws:', 'http://localhost:*', 'http://127.0.0.1:*'],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please wait and try again.' },
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth/login', authLimiter);

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  app.use('/uploads', express.static(config.uploadsDir));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'hm-trcc-api' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/leaves', leavesRouter);
  app.use('/api/complaints', complaintsRouter);
  app.use('/api/mess', messRouter);
  app.use('/api/movements', movementsRouter);
  app.use('/api/notices', noticesRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/uploads', uploadsRouter);

  const distDir = path.resolve(process.cwd(), 'dist');
  if (!process.env.VERCEL && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]', err.message);
    res.status(400).json({ error: err.message || 'Unexpected server error' });
  });

  return app;
}

const isMainEntry =
  process.argv[1] &&
  (process.argv[1].replace(/\\/g, '/').endsWith('server/index.ts') ||
    process.argv[1].replace(/\\/g, '/').endsWith('server/index.js'));

if (isMainEntry) {
  getDb();
  seedDatabase();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`HM Trcc API server listening on http://127.0.0.1:${config.port}`);
  });
}

