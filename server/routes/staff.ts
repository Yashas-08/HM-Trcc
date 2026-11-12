import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db/database.js';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { DEFAULT_ROLE_PERMISSIONS, resolvePermissions } from '../utils/permissions.js';
import { logActivity } from '../utils/audit.js';
import type { UserRole } from '../types.js';

export const staffRouter = Router();
staffRouter.use(authenticateJWT);

staffRouter.get('/', requirePermission('staff', 'view'), (req, res) => {
  const db = getDb();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const role = typeof req.query.role === 'string' ? req.query.role : 'all';

  const conds: string[] = [];
  const params: Array<string | number> = [];

  if (q) {
    const like = `%${q}%`;
    conds.push('(u.full_name LIKE ? OR u.staff_code LIKE ? OR u.email LIKE ? OR u.designation LIKE ?)');
    params.push(like, like, like, like);
  }
  if (status !== 'all') {
    conds.push('u.status = ?');
    params.push(status);
  }
  if (role !== 'all') {
    conds.push('u.role = ?');
    params.push(role);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT
         u.id, u.staff_code, u.full_name, u.email, u.phone, u.photo_url, u.designation,
         u.role, u.assigned_block_id, u.responsibilities, u.permissions_json, u.status, u.created_at,
         b.name AS assigned_block_name,
         (SELECT COUNT(*) FROM complaints c WHERE c.assigned_staff_id = u.id) AS assigned_complaints_count
       FROM users u
       LEFT JOIN blocks b ON b.id = u.assigned_block_id
       ${where}
       ORDER BY u.id ASC`,
    )
    .all(...params) as Array<Record<string, unknown>>;

  const staff = rows.map((r) => ({
    ...r,
    permissions: resolvePermissions(r.role as UserRole, (r.permissions_json as string | null) ?? null),
  }));

  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive
       FROM users`,
    )
    .get();

  res.json({ staff, summary, defaultRolePermissions: DEFAULT_ROLE_PERMISSIONS });
});

staffRouter.get('/:id', requirePermission('staff', 'view'), (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const member = db
    .prepare(
      `SELECT u.id, u.staff_code, u.full_name, u.email, u.phone, u.photo_url, u.designation,
              u.role, u.assigned_block_id, u.responsibilities, u.permissions_json, u.status, u.created_at,
              b.name AS assigned_block_name
       FROM users u
       LEFT JOIN blocks b ON b.id = u.assigned_block_id
       WHERE u.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!member) {
    res.status(404).json({ error: 'Staff member not found' });
    return;
  }

  const assignedComplaints = db
    .prepare(
      `SELECT c.id, c.complaint_code, c.title, c.category, c.priority, c.status, c.created_at, s.full_name AS student_name
       FROM complaints c
       JOIN students s ON s.id = c.student_id
       WHERE c.assigned_staff_id = ?
       ORDER BY c.id DESC`,
    )
    .all(id);

  const workHistory = db
    .prepare(
      `SELECT id, module, action, details, created_at
       FROM activity_logs
       WHERE user_id = ?
       ORDER BY id DESC LIMIT 25`,
    )
    .all(id);

  res.json({
    member: {
      ...member,
      permissions: resolvePermissions(
        member.role as UserRole,
        (member.permissions_json as string | null) ?? null,
      ),
    },
    assignedComplaints,
    workHistory,
  });
});

const createStaffSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().max(25).optional().default(''),
  photo_url: z.string().nullable().optional(),
  designation: z.string().min(2).max(120),
  role: z.enum(['super_admin', 'warden', 'mess_staff', 'security_staff', 'maintenance_staff']),
  assigned_block_id: z.number().int().positive().nullable().optional(),
  responsibilities: z.string().max(500).optional().default(''),
  permissions: z.record(z.array(z.string())).nullable().optional(),
});

staffRouter.post('/', requirePermission('staff', 'create'), (req: AuthenticatedRequest, res) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid staff details' });
    return;
  }

  const db = getDb();
  const d = parsed.data;
  const dup = db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?)')
    .get(d.email.trim());
  if (dup) {
    res.status(409).json({ error: 'A staff account with this email already exists' });
    return;
  }

  const nextNum = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM users').get() as { n: number }).n;
  const staffCode = `STF-${String(nextNum).padStart(3, '0')}`;
  const hash = bcrypt.hashSync(d.password, 10);

  const result = db
    .prepare(
      `INSERT INTO users (
        staff_code, full_name, email, password_hash, phone, photo_url, designation,
        role, assigned_block_id, responsibilities, permissions_json, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    )
    .run(
      staffCode,
      d.full_name.trim(),
      d.email.trim(),
      hash,
      d.phone.trim(),
      d.photo_url || null,
      d.designation.trim(),
      d.role,
      d.assigned_block_id ?? null,
      d.responsibilities.trim(),
      d.permissions ? JSON.stringify(d.permissions) : null,
    );

  const id = Number(result.lastInsertRowid);
  logActivity({
    user: req.user,
    module: 'staff',
    action: 'CREATE_STAFF',
    entityType: 'user',
    entityId: staffCode,
    details: `Created staff account ${d.full_name.trim()} (${d.role})`,
  });

  res.status(201).json({ id, staff_code: staffCode });
});

staffRouter.put('/:id', requirePermission('staff', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const schema = createStaffSchema.partial().extend({
    password: z.string().min(8).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update input' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | {
        id: number;
        full_name: string;
        role: string;
        assigned_block_id: number | null;
        permissions_json: string | null;
      }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Staff member not found' });
    return;
  }

  const d = parsed.data;
  if (d.email) {
    const dup = db
      .prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?')
      .get(d.email.trim(), id);
    if (dup) {
      res.status(409).json({ error: 'Email already used by another staff member' });
      return;
    }
  }

  if (id === req.user!.id && d.status === 'inactive') {
    res.status(400).json({ error: 'You cannot deactivate your own active session account' });
    return;
  }

  const nextHash = d.password ? bcrypt.hashSync(d.password, 10) : null;
  const nextAssignedBlock =
    d.assigned_block_id === undefined ? existing.assigned_block_id : d.assigned_block_id;
  const nextPermissionsJson =
    d.permissions === undefined
      ? existing.permissions_json
      : d.permissions
        ? JSON.stringify(d.permissions)
        : null;

  db.prepare(
    `UPDATE users SET
       full_name = COALESCE(?, full_name),
       email = COALESCE(?, email),
       password_hash = COALESCE(?, password_hash),
       phone = COALESCE(?, phone),
       photo_url = COALESCE(?, photo_url),
       designation = COALESCE(?, designation),
       role = COALESCE(?, role),
       assigned_block_id = ?,
       responsibilities = COALESCE(?, responsibilities),
       permissions_json = ?,
       status = COALESCE(?, status),
       updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    d.full_name?.trim() ?? null,
    d.email?.trim() ?? null,
    nextHash,
    d.phone?.trim() ?? null,
    d.photo_url === undefined ? null : d.photo_url,
    d.designation?.trim() ?? null,
    d.role ?? null,
    nextAssignedBlock,
    d.responsibilities?.trim() ?? null,
    nextPermissionsJson,
    d.status ?? null,
    id,
  );

  logActivity({
    user: req.user,
    module: 'staff',
    action: 'UPDATE_STAFF',
    entityType: 'user',
    entityId: id,
    details: `Updated staff account ${d.full_name?.trim() || existing.full_name}`,
  });

  res.json({ success: true });
});

staffRouter.patch('/:id/status', requirePermission('staff', 'delete'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const schema = z.object({ status: z.enum(['active', 'inactive']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid status required' });
    return;
  }

  if (id === req.user!.id && parsed.data.status === 'inactive') {
    res.status(400).json({ error: 'You cannot deactivate your own account' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(id) as
    | { id: number; full_name: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Staff member not found' });
    return;
  }

  db.prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    parsed.data.status,
    id,
  );

  logActivity({
    user: req.user,
    module: 'staff',
    action: parsed.data.status === 'inactive' ? 'DEACTIVATE_STAFF' : 'ACTIVATE_STAFF',
    entityType: 'user',
    entityId: id,
    details: `Set ${existing.full_name} status to ${parsed.data.status}`,
  });

  res.json({ success: true });
});
