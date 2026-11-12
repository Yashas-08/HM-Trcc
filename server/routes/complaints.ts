import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database.js';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { createNotification, logActivity } from '../utils/audit.js';

export const complaintsRouter = Router();
complaintsRouter.use(authenticateJWT);

const CATEGORIES = [
  'Electrical',
  'Plumbing',
  'Cleaning',
  'Wi-Fi',
  'Food',
  'Room maintenance',
  'Other',
] as const;

complaintsRouter.get('/', requirePermission('complaints', 'view'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const category = typeof req.query.category === 'string' ? req.query.category : 'all';
  const priority = typeof req.query.priority === 'string' ? req.query.priority : 'all';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const conds: string[] = [];
  const params: Array<string | number> = [];

  if (req.user!.role === 'maintenance_staff') {
    conds.push('c.assigned_staff_id = ?');
    params.push(req.user!.id);
  }
  if (status !== 'all') {
    conds.push('c.status = ?');
    params.push(status);
  }
  if (category !== 'all') {
    conds.push('c.category = ?');
    params.push(category);
  }
  if (priority !== 'all') {
    conds.push('c.priority = ?');
    params.push(priority);
  }
  if (q) {
    const like = `%${q}%`;
    conds.push('(c.complaint_code LIKE ? OR c.title LIKE ? OR s.full_name LIKE ? OR r.room_number LIKE ?)');
    params.push(like, like, like, like);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const complaints = db
    .prepare(
      `SELECT
         c.*,
         s.student_code,
         s.full_name AS student_name,
         s.phone AS student_phone,
         COALESCE(r.room_number, '--') AS room_number,
         b.name AS block_name,
         u.full_name AS assigned_staff_name
       FROM complaints c
       JOIN students s ON s.id = c.student_id
       LEFT JOIN rooms r ON r.id = c.room_id
       LEFT JOIN blocks b ON b.id = r.block_id
       LEFT JOIN users u ON u.id = c.assigned_staff_id
       ${where}
       ORDER BY c.id DESC`,
    )
    .all(...params) as Array<Record<string, unknown>>;

  const formatted = complaints.map((c) => ({
    ...c,
    photo_urls: (() => {
      try {
        return JSON.parse(String(c.photo_urls_json || '[]'));
      } catch {
        return [];
      }
    })(),
    remarks: (() => {
      try {
        return JSON.parse(String(c.remarks_json || '[]'));
      } catch {
        return [];
      }
    })(),
  }));

  const scopeClause = req.user!.role === 'maintenance_staff' ? 'WHERE assigned_staff_id = ?' : '';
  const scopeParams = req.user!.role === 'maintenance_staff' ? [req.user!.id] : [];
  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('open', 'reopened') THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN status IN ('assigned', 'in_progress') THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved
       FROM complaints ${scopeClause}`,
    )
    .get(...scopeParams);

  const staffOptions = db
    .prepare(
      `SELECT id, staff_code, full_name, designation, role
       FROM users
       WHERE status = 'active' AND role IN ('maintenance_staff', 'warden', 'super_admin')
       ORDER BY full_name ASC`,
    )
    .all();

  res.json({ complaints: formatted, summary, staffOptions });
});

const createComplaintSchema = z.object({
  student_id: z.number().int().positive(),
  category: z.enum(CATEGORIES),
  title: z.string().min(3, 'Complaint title is required').max(150),
  description: z.string().min(5, 'Description is required').max(1000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  photo_urls: z.array(z.string()).optional().default([]),
});

complaintsRouter.post('/', requirePermission('complaints', 'create'), (req: AuthenticatedRequest, res) => {
  const parsed = createComplaintSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid complaint data' });
    return;
  }

  const db = getDb();
  const d = parsed.data;
  const student = db
    .prepare(
      `SELECT s.id, s.full_name, ra.room_id
       FROM students s
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
       WHERE s.id = ?`,
    )
    .get(d.student_id) as { id: number; full_name: string; room_id: number | null } | undefined;

  if (!student) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  const nextNum = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM complaints').get() as { n: number }).n;
  const complaintCode = `CMP-${1000 + nextNum}`;

  const result = db
    .prepare(
      `INSERT INTO complaints (
        complaint_code, student_id, room_id, category, title, description, photo_urls_json, priority, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
    )
    .run(
      complaintCode,
      d.student_id,
      student.room_id,
      d.category,
      d.title.trim(),
      d.description.trim(),
      JSON.stringify(d.photo_urls),
      d.priority,
    );

  createNotification({
    type: 'complaint',
    title: `New ${d.category} Complaint`,
    message: `${complaintCode}: ${d.title.trim()} (${student.full_name})`,
    linkPath: '/complaints',
    targetRoles: ['super_admin', 'warden'],
  });
  logActivity({
    user: req.user,
    module: 'complaints',
    action: 'CREATE_COMPLAINT',
    entityType: 'complaint',
    entityId: complaintCode,
    details: `Logged complaint ${complaintCode}: ${d.title.trim()}`,
  });

  res.status(201).json({ id: Number(result.lastInsertRowid), complaint_code: complaintCode });
});

complaintsRouter.post('/:id/assign', requirePermission('complaints', 'approve'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const schema = z.object({ staff_id: z.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid staff_id is required' });
    return;
  }

  const db = getDb();
  const staff = db
    .prepare("SELECT id, full_name FROM users WHERE id = ? AND status = 'active'")
    .get(parsed.data.staff_id) as { id: number; full_name: string } | undefined;
  if (!staff) {
    res.status(404).json({ error: 'Active staff member not found' });
    return;
  }

  const comp = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id) as
    | { id: number; complaint_code: string; status: string; remarks_json: string }
    | undefined;
  if (!comp) {
    res.status(404).json({ error: 'Complaint not found' });
    return;
  }

  const remarks = JSON.parse(comp.remarks_json || '[]') as Array<{ author: string; text: string; at: string }>;
  remarks.push({
    author: req.user!.full_name,
    text: `Assigned to ${staff.full_name}`,
    at: new Date().toISOString().slice(0, 16),
  });
  const nextStatus = comp.status === 'open' || comp.status === 'reopened' ? 'assigned' : comp.status;

  db.prepare(
    `UPDATE complaints
     SET assigned_staff_id = ?, status = ?, remarks_json = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(staff.id, nextStatus, JSON.stringify(remarks), id);

  createNotification({
    type: 'complaint',
    title: 'Complaint Assigned',
    message: `${comp.complaint_code} was assigned to ${staff.full_name}.`,
    linkPath: '/complaints',
    targetRoles: ['super_admin', 'warden', 'maintenance_staff'],
  });
  logActivity({
    user: req.user,
    module: 'complaints',
    action: 'ASSIGN_COMPLAINT',
    entityType: 'complaint',
    entityId: comp.complaint_code,
    details: `Assigned ${comp.complaint_code} to ${staff.full_name}`,
  });

  res.json({ success: true });
});

complaintsRouter.patch('/:id/priority', requirePermission('complaints', 'approve'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const schema = z.object({ priority: z.enum(['low', 'medium', 'high', 'urgent']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid priority is required' });
    return;
  }

  const db = getDb();
  const comp = db.prepare('SELECT id, complaint_code FROM complaints WHERE id = ?').get(id) as
    | { id: number; complaint_code: string }
    | undefined;
  if (!comp) {
    res.status(404).json({ error: 'Complaint not found' });
    return;
  }

  db.prepare("UPDATE complaints SET priority = ?, updated_at = datetime('now') WHERE id = ?").run(
    parsed.data.priority,
    id,
  );
  logActivity({
    user: req.user,
    module: 'complaints',
    action: 'CHANGE_PRIORITY',
    entityType: 'complaint',
    entityId: comp.complaint_code,
    details: `Changed priority of ${comp.complaint_code} to ${parsed.data.priority}`,
  });

  res.json({ success: true });
});

complaintsRouter.patch('/:id/status', requirePermission('complaints', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const schema = z.object({
    status: z.enum(['in_progress', 'resolved', 'reopened']),
    resolution_notes: z.string().optional(),
    remark: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid status transition is required' });
    return;
  }

  const db = getDb();
  const comp = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id) as
    | {
        id: number;
        complaint_code: string;
        assigned_staff_id: number | null;
        status: string;
        remarks_json: string;
        resolution_notes: string;
      }
    | undefined;

  if (!comp) {
    res.status(404).json({ error: 'Complaint not found' });
    return;
  }

  if (req.user!.role === 'maintenance_staff' && comp.assigned_staff_id !== req.user!.id) {
    res.status(403).json({ error: 'You can only update complaints assigned to you' });
    return;
  }
  if (parsed.data.status === 'reopened' && req.user!.role === 'maintenance_staff') {
    res.status(403).json({ error: 'Only Wardens or Super Admins can reopen resolved complaints' });
    return;
  }

  const remarks = JSON.parse(comp.remarks_json || '[]') as Array<{ author: string; text: string; at: string }>;
  const noteText =
    parsed.data.remark?.trim() ||
    (parsed.data.status === 'resolved'
      ? parsed.data.resolution_notes?.trim() || 'Marked as resolved'
      : `Status changed to ${parsed.data.status.replace('_', ' ')}`);

  remarks.push({
    author: req.user!.full_name,
    text: noteText,
    at: new Date().toISOString().slice(0, 16),
  });

  const resolvedAt = parsed.data.status === 'resolved' ? new Date().toISOString().slice(0, 16) : null;
  const nextResolutionNotes =
    parsed.data.status === 'resolved'
      ? parsed.data.resolution_notes?.trim() || comp.resolution_notes
      : comp.resolution_notes;

  db.prepare(
    `UPDATE complaints
     SET status = ?, resolution_notes = ?, remarks_json = ?, resolved_at = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(parsed.data.status, nextResolutionNotes, JSON.stringify(remarks), resolvedAt, id);

  logActivity({
    user: req.user,
    module: 'complaints',
    action: `STATUS_${parsed.data.status.toUpperCase()}`,
    entityType: 'complaint',
    entityId: comp.complaint_code,
    details: `${comp.complaint_code}: ${noteText}`,
  });

  res.json({ success: true });
});

complaintsRouter.post('/:id/remarks', requirePermission('complaints', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const schema = z.object({ text: z.string().min(2, 'Remark cannot be empty').max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid remark' });
    return;
  }

  const db = getDb();
  const comp = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id) as
    | { id: number; complaint_code: string; assigned_staff_id: number | null; remarks_json: string }
    | undefined;
  if (!comp) {
    res.status(404).json({ error: 'Complaint not found' });
    return;
  }
  if (req.user!.role === 'maintenance_staff' && comp.assigned_staff_id !== req.user!.id) {
    res.status(403).json({ error: 'You can only comment on complaints assigned to you' });
    return;
  }

  const remarks = JSON.parse(comp.remarks_json || '[]') as Array<{ author: string; text: string; at: string }>;
  remarks.push({
    author: req.user!.full_name,
    text: parsed.data.text.trim(),
    at: new Date().toISOString().slice(0, 16),
  });

  db.prepare("UPDATE complaints SET remarks_json = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(remarks),
    id,
  );

  res.json({ success: true, remarks });
});

