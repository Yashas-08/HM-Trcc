import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
const isVercel = Boolean(process.env.VERCEL);

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set in production.');
}

// In local development without .env, generate a process-stable secret or read env
const devFallbackSecret =
  process.env.JWT_SECRET ||
  crypto.createHash('sha256').update(`hm-trcc-dev-${process.cwd()}`).digest('hex');

const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const vercelOrigins = [
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
  process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : '',
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : '',
].filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || devFallbackSecret,
  jwtExpiresIn: '12h',
  clientOrigin,
  allowedOrigins: Array.from(new Set([clientOrigin, ...vercelOrigins])),
  dbPath: process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : isVercel
      ? '/tmp/hm-trcc.db'
      : path.resolve(process.cwd(), 'server/data/hm-trcc.db'),
  uploadsDir: isVercel ? '/tmp/uploads' : path.resolve(process.cwd(), 'server/uploads'),
};

