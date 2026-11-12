import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database.js';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { createNotification, logActivity } from '../utils/audit.js';

export const leavesRouter = Router();
leavesRouter.use(authenticateJWT);

leavesRouter.get('/', requirePermission('leaves', 'view'), (req, res) => {
  const db = getDb();
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const conds: string[] = [];
  const params: Array<string | number> = [];

  if (status !== 'all') {
    conds.push('lr.status = ?');
    params.push(status);
  }
  if (q) {
    const like = `%${q}%`;
    conds.push('(s.full_name LIKE ? OR s.student_code LIKE ? OR lr.leave_code LIKE ? OR lr.reason LIKE ?)');
    params.push(like, like, like, like);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const leaves = db
    .prepare(
      `SELECT
         lr.*,
         s.student_code,
         s.full_name AS student_name,
         s.phone AS student_phone,
         s.guardian_name,
         s.guardian_phone,
         COALESCE(r.room_number, '--') AS room_number,
         b.name AS block_name,
         u.full_name AS reviewed_by_name
       FROM leave_requests lr
       JOIN students s ON s.id = lr.student_id
       LEFT JOIN rooms r ON r.id = lr.room_id
       LEFT JOIN blocks b ON b.id = r.block_id
       LEFT JOIN users u ON u.id = lr.reviewed_by
       ${where}
       ORDER BY lr.id DESC`,
    )
    .all(...params);

  const counts = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM leave_requests`,
    )
    .get();

  res.json({ leaves, summary: counts });
});

const createLeaveSchema = z.object({
  student_id: z.number().int().positive(),
  reason: z.string().min(3, 'Leave reason is required').max(500),
  destination: z.string().max(150).optional().default(''),
  departure_at: z.string().min(8, 'Departure date & time required'),
  expected_return_at: z.string().min(8, 'Expected return date & time required'),
  guardian_contact_verified: z.boolean().optional().default(false),
  supporting_doc_url: z.string().nullable().optional(),
});

leavesRouter.post('/', requirePermission('leaves', 'create'), (req: AuthenticatedRequest, res) => {
  const parsed = createLeaveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid leave request' });
    return;
  }

  const d = parsed.data;
  if (new Date(d.expected_return_at) <= new Date(d.departure_at)) {
    res.status(400).json({ error: 'Expected return date/time must be after departure date/time' });
    return;
  }

  const db = getDb();
  const student = db
    .prepare(
      `SELECT s.id, s.full_name, s.status, ra.room_id
       FROM students s
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
       WHERE s.id = ?`,
    )
    .get(d.student_id) as { id: number; full_name: string; status: string; room_id: number | null } | undefined;

  if (!student || student.status !== 'active') {
    res.status(400).json({ error: 'Active student record not found' });
    return;
  }

  const nextNum = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM leave_requests').get() as { n: number }).n;
  const leaveCode = `LV-${new Date().getFullYear()}-${String(100 + nextNum)}`;

  const result = db
    .prepare(
      `INSERT INTO leave_requests (
        leave_code, student_id, room_id, reason, destination, departure_at, expected_return_at,
        guardian_contact_verified, supporting_doc_url, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    )
    .run(
      leaveCode,
      d.student_id,
      student.room_id,
      d.reason.trim(),
      d.destination.trim(),
      d.departure_at,
      d.expected_return_at,
      d.guardian_contact_verified ? 1 : 0,
      d.supporting_doc_url || null,
    );

  const id = Number(result.lastInsertRowid);
  createNotification({
    type: 'leave',
    title: 'New Leave Application',
    message: `${student.full_name} submitted leave request ${leaveCode}.`,
    linkPath: '/leaves',
    targetRoles: ['super_admin', 'warden'],
  });
  logActivity({
    user: req.user,
    module: 'leaves',
    action: 'CREATE_LEAVE',
    entityType: 'leave_request',
    entityId: leaveCode,
    details: `Created leave request ${leaveCode} for ${student.full_name}`,
  });

  res.status(201).json({ id, leave_code: leaveCode });
});

leavesRouter.post('/:id/approve', requirePermission('leaves', 'approve'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const leave = db
    .prepare(
      `SELECT lr.*, s.full_name AS student_name
       FROM leave_requests lr JOIN students s ON s.id = lr.student_id
       WHERE lr.id = ?`,
    )
    .get(id) as { id: number; leave_code: string; status: string; student_name: string } | undefined;

  if (!leave) {
    res.status(404).json({ error: 'Leave request not found' });
    return;
  }
  if (leave.status !== 'pending') {
    res.status(400).json({ error: `Only pending requests can be approved (current status: ${leave.status})` });
    return;
  }

  db.prepare(
    `UPDATE leave_requests
     SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
  ).run(req.user!.id, id);

  logActivity({
    user: req.user,
    module: 'leaves',
    action: 'APPROVE_LEAVE',
    entityType: 'leave_request',
    entityId: leave.leave_code,
    details: `Approved leave ${leave.leave_code} for ${leave.student_name}`,
  });

  res.json({ success: true });
});

leavesRouter.post('/:id/reject', requirePermission('leaves', 'approve'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const schema = z.object({ rejection_reason: z.string().min(3, 'Rejection reason is required').max(400) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Rejection reason is required' });
    return;
  }

  const db = getDb();
  const leave = db
    .prepare(
      `SELECT lr.*, s.full_name AS student_name
       FROM leave_requests lr JOIN students s ON s.id = lr.student_id
       WHERE lr.id = ?`,
    )
    .get(id) as { id: number; leave_code: string; status: string; student_name: string } | undefined;

  if (!leave) {
    res.status(404).json({ error: 'Leave request not found' });
    return;
  }
  if (leave.status !== 'pending') {
    res.status(400).json({ error: `Only pending requests can be rejected (current status: ${leave.status})` });
    return;
  }

  db.prepare(
    `UPDATE leave_requests
     SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
  ).run(parsed.data.rejection_reason.trim(), req.user!.id, id);

  logActivity({
    user: req.user,
    module: 'leaves',
    action: 'REJECT_LEAVE',
    entityType: 'leave_request',
    entityId: leave.leave_code,
    details: `Rejected leave ${leave.leave_code}: ${parsed.data.rejection_reason.trim()}`,
  });

  res.json({ success: true });
});

leavesRouter.post('/:id/record-departure', requirePermission('leaves', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id) as
    | {
        id: number;
        leave_code: string;
        student_id: number;
        expected_return_at: string;
        actual_departure_at: string | null;
        status: string;
      }
    | undefined;

  if (!leave) {
    res.status(404).json({ error: 'Leave request not found' });
    return;
  }
  if (leave.status !== 'approved') {
    res.status(400).json({ error: 'Only approved leaves can record actual departure' });
    return;
  }
  if (leave.actual_departure_at) {
    res.status(400).json({ error: 'Actual departure already recorded for this leave' });
    return;
  }

  const alreadyOutside = db
    .prepare("SELECT id FROM movements WHERE student_id = ? AND status = 'outside'")
    .get(leave.student_id);
  if (alreadyOutside) {
    res.status(400).json({ error: 'Student is already checked out in movement register' });
    return;
  }

  const nowIso = new Date().toISOString().slice(0, 16);
  db.transaction(() => {
    db.prepare("UPDATE leave_requests SET actual_departure_at = ?, updated_at = datetime('now') WHERE id = ?").run(
      nowIso,
      id,
    );
    db.prepare(
      `INSERT INTO movements (student_id, leave_request_id, exit_time, expected_return_time, status, exit_remarks, recorded_exit_by)
       VALUES (?, ?, ?, ?, 'outside', ?, ?)`,
    ).run(leave.student_id, id, nowIso, leave.expected_return_at, `Approved leave ${leave.leave_code}`, req.user!.id);

    logActivity({
      user: req.user,
      module: 'leaves',
      action: 'RECORD_LEAVE_DEPARTURE',
      entityType: 'leave_request',
      entityId: leave.leave_code,
      details: `Recorded actual departure and created linked movement exit for ${leave.leave_code}`,
    });
  })();

  res.json({ success: true, actual_departure_at: nowIso });
});

leavesRouter.post('/:id/record-return', requirePermission('leaves', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id) as
    | {
        id: number;
        leave_code: string;
        student_id: number;
        expected_return_at: string;
        actual_departure_at: string | null;
        status: string;
      }
    | undefined;

  if (!leave) {
    res.status(404).json({ error: 'Leave request not found' });
    return;
  }
  if (leave.status !== 'approved' || !leave.actual_departure_at) {
    res.status(400).json({ error: 'Leave must be approved with departure recorded before recording return' });
    return;
  }

  const nowIso = new Date().toISOString().slice(0, 16);
  const isLate = new Date(nowIso) > new Date(leave.expected_return_at);

  db.transaction(() => {
    db.prepare(
      "UPDATE leave_requests SET actual_return_at = ?, status = 'completed', updated_at = datetime('now') WHERE id = ?",
    ).run(nowIso, id);

    const openMove = db
      .prepare("SELECT id FROM movements WHERE student_id = ? AND status = 'outside' ORDER BY id DESC LIMIT 1")
      .get(leave.student_id) as { id: number } | undefined;

    if (openMove) {
      db.prepare(
        `UPDATE movements
         SET actual_return_time = ?, status = ?, entry_remarks = ?, recorded_entry_by = ?
         WHERE id = ?`,
      ).run(
        nowIso,
        isLate ? 'late_return' : 'returned',
        `Returned from leave ${leave.leave_code}`,
        req.user!.id,
        openMove.id,
      );
    }

    logActivity({
      user: req.user,
      module: 'leaves',
      action: 'RECORD_LEAVE_RETURN',
      entityType: 'leave_request',
      entityId: leave.leave_code,
      details: `Recorded actual return for ${leave.leave_code} (${isLate ? 'late return' : 'on time'})`,
    });
  })();

  res.json({ success: true, actual_return_at: nowIso, late: isLate });
});

