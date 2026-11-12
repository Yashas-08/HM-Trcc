import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { config } from '../config.js';
import { getDb } from '../db/database.js';
import type { AuthUser, ModuleKey, PermissionAction, UserRole } from '../types.js';
import { hasModulePermission, resolvePermissions } from '../utils/permissions.js';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

interface JwtPayload {
  sub: number;
  role: UserRole;
}

export function signToken(user: { id: number; role: UserRole }): string {
  const options: jwt.SignOptions = {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  };
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, options);
}

export function authenticateJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as unknown as JwtPayload;
    const db = getDb();
    const row = db
      .prepare(
        `SELECT id, staff_code, full_name, email, role, designation, photo_url, assigned_block_id, permissions_json, status
         FROM users WHERE id = ?`,
      )
      .get(decoded.sub) as
      | {
          id: number;
          staff_code: string;
          full_name: string;
          email: string;
          role: UserRole;
          designation: string;
          photo_url: string | null;
          assigned_block_id: number | null;
          permissions_json: string | null;
          status: string;
        }
      | undefined;

    if (!row || row.status !== 'active') {
      res.status(401).json({ error: 'Account is inactive or not found' });
      return;
    }

    req.user = {
      id: row.id,
      staff_code: row.staff_code,
      full_name: row.full_name,
      email: row.email,
      role: row.role,
      designation: row.designation,
      photo_url: row.photo_url,
      assigned_block_id: row.assigned_block_id,
      permissions: resolvePermissions(row.role, row.permissions_json),
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

export function requirePermission(moduleKey: ModuleKey, action: PermissionAction = 'view') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!hasModulePermission(req.user, moduleKey, action)) {
      res.status(403).json({ error: 'You do not have permission to perform this action' });
      return;
    }
    next();
  };
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Access restricted for your role' });
      return;
    }
    next();
  };
}

fs.mkdirSync(config.uploadsDir, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(config.uploadsDir, { recursive: true });
      cb(null, config.uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      cb(null, safeName);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: JPG, PNG, WEBP, PDF, TXT.'));
    }
  },
});
