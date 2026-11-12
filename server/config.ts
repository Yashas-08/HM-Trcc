import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set in production.');
}

// In local development without .env, generate a process-stable secret or read env
const devFallbackSecret =
  process.env.JWT_SECRET ||
  crypto.createHash('sha256').update(`hm-trcc-dev-${process.cwd()}`).digest('hex');

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || devFallbackSecret,
  jwtExpiresIn: '12h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  dbPath: process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.resolve(process.cwd(), 'server/data/hm-trcc.db'),
  uploadsDir: path.resolve(process.cwd(), 'server/uploads'),
};

