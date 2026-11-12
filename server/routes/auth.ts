import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db/database.js';
import { authenticateJWT, signToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { resolvePermissions } from '../utils/permissions.js';
import { logActivity } from '../utils/audit.js';
import type { UserRole } from '../types.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

authRouter.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid credentials payload' });
    return;
  }

  const db = getDb();
  const user = db
    .prepare(
      `SELECT id, staff_code, full_name, email, password_hash, phone, photo_url, designation, role, assigned_block_id, permissions_json, status
       FROM users WHERE lower(email) = lower(?)`,
    )
    .get(parsed.data.email.trim()) as
    | {
        id: number;
        staff_code: string;
        full_name: string;
        email: string;
        password_hash: string;
        phone: string;
        photo_url: string | null;
        designation: string;
        role: UserRole;
        assigned_block_id: number | null;
        permissions_json: string | null;
        status: string;
      }
    | undefined;

  if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (user.status !== 'active') {
    res.status(403).json({ error: 'This staff account has been deactivated. Contact Super Admin.' });
    return;
  }

  const token = signToken({ id: user.id, role: user.role });
  const authUser = {
    id: user.id,
    staff_code: user.staff_code,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    photo_url: user.photo_url,
    designation: user.designation,
    role: user.role,
    assigned_block_id: user.assigned_block_id,
    permissions: resolvePermissions(user.role, user.permissions_json),
  };

  logActivity({
    user: { id: user.id, full_name: user.full_name, role: user.role },
    module: 'auth',
    action: 'LOGIN',
    entityType: 'user',
    entityId: user.id,
    details: `${user.full_name} signed in`,
  });

  res.json({ token, user: authUser });
});

authRouter.get('/me', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const row = db
    .prepare('SELECT phone FROM users WHERE id = ?')
    .get(req.user!.id) as { phone: string } | undefined;

  res.json({ user: { ...req.user, phone: row?.phone || '' } });
});

const profileUpdateSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(30).optional().default(''),
  photo_url: z.string().nullable().optional(),
});

authRouter.put('/profile', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile data' });
    return;
  }

  const db = getDb();
  const conflict = db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?')
    .get(parsed.data.email.trim(), req.user!.id);
  if (conflict) {
    res.status(409).json({ error: 'Email is already used by another account' });
    return;
  }

  db.prepare(
    `UPDATE users
     SET full_name = ?, email = ?, phone = ?, photo_url = COALESCE(?, photo_url), updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    parsed.data.full_name.trim(),
    parsed.data.email.trim(),
    parsed.data.phone.trim(),
    parsed.data.photo_url ?? null,
    req.user!.id,
  );

  logActivity({
    user: req.user,
    module: 'settings',
    action: 'UPDATE_PROFILE',
    entityType: 'user',
    entityId: req.user!.id,
    details: `Updated own admin profile (${parsed.data.full_name.trim()})`,
  });

  res.json({ success: true });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

authRouter.put('/change-password', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password input' });
    return;
  }

  const db = getDb();
  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(req.user!.id) as { password_hash: string } | undefined;

  if (!row || !bcrypt.compareSync(parsed.data.currentPassword, row.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect' });
    return;
  }

  const nextHash = bcrypt.hashSync(parsed.data.newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
    nextHash,
    req.user!.id,
  );

  logActivity({
    user: req.user,
    module: 'settings',
    action: 'CHANGE_PASSWORD',
    entityType: 'user',
    entityId: req.user!.id,
    details: 'Changed account password',
  });

  res.json({ success: true });
});

