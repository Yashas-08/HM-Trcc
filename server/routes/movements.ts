import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database.js';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { createNotification, logActivity } from '../utils/audit.js';

export const movementsRouter = Router();
movementsRouter.use(authenticateJWT);

movementsRouter.get('/overview', requirePermission('movements', 'view'), (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const attendanceDate =
    typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : today;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const moveConds: string[] = [];
  const moveParams: Array<string | number> = [];
  if (q) {
    const like = `%${q}%`;
    moveConds.push('(s.full_name LIKE ? OR s.student_code LIKE ? OR r.room_number LIKE ?)');
    moveParams.push(like, like, like);
  }
  const moveWhere = moveConds.length ? `WHERE ${moveConds.join(' AND ')}` : '';

  const movements = db
    .prepare(
      `SELECT
         m.*,
         s.student_code,
         s.full_name AS student_name,
         s.phone AS student_phone,
         COALESCE(r.room_number, '--') AS room_number,
         lr.leave_code
       FROM movements m
       JOIN students s ON s.id = m.student_id
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
       LEFT JOIN rooms r ON r.id = ra.room_id
       LEFT JOIN leave_requests lr ON lr.id = m.leave_request_id
       ${moveWhere}
       ORDER BY
         CASE WHEN m.status = 'outside' THEN 0 ELSE 1 END,
         m.id DESC`,
    )
    .all(...moveParams);

  const activeStudents = db
    .prepare(
      `SELECT
         s.id,
         s.student_code,
         s.full_name,
         COALESCE(r.room_number, '--') AS room_number,
         EXISTS(SELECT 1 FROM movements m WHERE m.student_id = s.id AND m.status = 'outside') AS is_outside,
         (SELECT lr.id FROM leave_requests lr WHERE lr.student_id = s.id AND lr.status = 'approved' ORDER BY lr.id DESC LIMIT 1) AS active_approved_leave_id
       FROM students s
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
       LEFT JOIN rooms r ON r.id = ra.room_id
       WHERE s.status = 'active'
       ORDER BY s.full_name ASC`,
    )
    .all() as Array<{
    id: number;
    student_code: string;
    full_name: string;
    room_number: string;
    is_outside: number;
    active_approved_leave_id: number | null;
  }>;

  const attendanceRows = db
    .prepare(
      `SELECT
         s.id AS student_id,
         s.student_code,
         s.full_name,
         COALESCE(r.room_number, '--') AS room_number,
         COALESCE(a.status, 'present') AS status,
         COALESCE(a.check_in_time, '') AS check_in_time,
         COALESCE(a.check_out_time, '') AS check_out_time,
         COALESCE(a.remarks, '') AS remarks
       FROM students s
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
       LEFT JOIN rooms r ON r.id = ra.room_id
       LEFT JOIN attendance_records a ON a.student_id = s.id AND a.attendance_date = ?
       WHERE s.status = 'active'
       ORDER BY s.full_name ASC`,
    )
    .all(attendanceDate);

  const outsideCount = activeStudents.filter((s) => s.is_outside === 1).length;
  const insideCount = activeStudents.length - outsideCount;
  const expectedReturnsCount = db
    .prepare("SELECT COUNT(*) AS c FROM movements WHERE status = 'outside' AND substr(expected_return_time, 1, 10) = ?")
    .get(today) as { c: number };
  const lateReturnsCount = db
    .prepare("SELECT COUNT(*) AS c FROM movements WHERE status = 'late_return'")
    .get() as { c: number };

  res.json({
    summary: {
      insideCount,
      outsideCount,
      expectedReturnsToday: expectedReturnsCount.c,
      lateReturnsCount: lateReturnsCount.c,
    },
    movements,
    students: activeStudents,
    attendanceDate,
    attendanceRows,
  });
});

movementsRouter.post('/checkout', requirePermission('movements', 'create'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    student_id: z.number().int().positive(),
    expected_return_time: z.string().min(8, 'Expected return time is required'),
    exit_remarks: z.string().max(300).optional().default(''),
    leave_request_id: z.number().int().positive().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid checkout data' });
    return;
  }

  const db = getDb();
  const d = parsed.data;
  const student = db
    .prepare("SELECT id, full_name FROM students WHERE id = ? AND status = 'active'")
    .get(d.student_id) as { id: number; full_name: string } | undefined;
  if (!student) {
    res.status(404).json({ error: 'Active student not found' });
    return;
  }

  const alreadyOutside = db
    .prepare("SELECT id FROM movements WHERE student_id = ? AND status = 'outside'")
    .get(d.student_id);
  if (alreadyOutside) {
    res.status(400).json({ error: `${student.full_name} is already marked outside and cannot be checked out again.` });
    return;
  }

  // Auto-link approved leave if not explicitly passed
  let leaveId = d.leave_request_id ?? null;
  if (!leaveId) {
    const approvedLeave = db
      .prepare("SELECT id FROM leave_requests WHERE student_id = ? AND status = 'approved' AND actual_departure_at IS NULL ORDER BY id DESC LIMIT 1")
      .get(d.student_id) as { id: number } | undefined;
    leaveId = approvedLeave?.id ?? null;
  }

  const nowIso = new Date().toISOString().slice(0, 16);
  const newId = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO movements (student_id, leave_request_id, exit_time, expected_return_time, status, exit_remarks, recorded_exit_by)
         VALUES (?, ?, ?, ?, 'outside', ?, ?)`,
      )
      .run(d.student_id, leaveId, nowIso, d.expected_return_time, d.exit_remarks.trim(), req.user!.id);

    if (leaveId) {
      db.prepare("UPDATE leave_requests SET actual_departure_at = ?, updated_at = datetime('now') WHERE id = ?").run(
        nowIso,
        leaveId,
      );
    }

    logActivity({
      user: req.user,
      module: 'movements',
      action: 'RECORD_EXIT',
      entityType: 'movement',
      entityId: Number(r.lastInsertRowid),
      details: `Checked out ${student.full_name} (expected return ${d.expected_return_time})`,
    });
    return Number(r.lastInsertRowid);
  })();

  res.status(201).json({ id: newId });
});

movementsRouter.post('/checkin', requirePermission('movements', 'edit'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    movement_id: z.number().int().positive(),
    entry_remarks: z.string().max(300).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid movement_id is required' });
    return;
  }

  const db = getDb();
  const move = db
    .prepare(
      `SELECT m.*, s.full_name AS student_name
       FROM movements m JOIN students s ON s.id = m.student_id
       WHERE m.id = ?`,
    )
    .get(parsed.data.movement_id) as
    | {
        id: number;
        student_id: number;
        leave_request_id: number | null;
        expected_return_time: string;
        status: string;
        student_name: string;
      }
    | undefined;

  if (!move) {
    res.status(404).json({ error: 'Movement record not found' });
    return;
  }
  if (move.status !== 'outside') {
    res.status(400).json({ error: 'Entry has already been recorded for this movement record' });
    return;
  }

  const settings = db
    .prepare('SELECT late_return_grace_minutes FROM hostel_settings WHERE id = 1')
    .get() as { late_return_grace_minutes: number } | undefined;
  const graceMs = (settings?.late_return_grace_minutes ?? 15) * 60 * 1000;

  const now = new Date();
  const nowIso = now.toISOString().slice(0, 16);
  const expectedDate = new Date(move.expected_return_time);
  const isLate = !Number.isNaN(expectedDate.getTime()) && now.getTime() > expectedDate.getTime() + graceMs;
  const nextStatus = isLate ? 'late_return' : 'returned';

  db.transaction(() => {
    db.prepare(
      `UPDATE movements
       SET actual_return_time = ?, status = ?, entry_remarks = ?, recorded_entry_by = ?
       WHERE id = ?`,
    ).run(nowIso, nextStatus, parsed.data.entry_remarks.trim(), req.user!.id, move.id);

    if (move.leave_request_id) {
      db.prepare(
        "UPDATE leave_requests SET actual_return_at = ?, status = 'completed', updated_at = datetime('now') WHERE id = ?",
      ).run(nowIso, move.leave_request_id);
    }

    if (isLate) {
      createNotification({
        type: 'late_return',
        title: 'Late Return Recorded',
        message: `${move.student_name} returned late at ${nowIso} (expected ${move.expected_return_time}).`,
        linkPath: '/movements',
        targetRoles: ['super_admin', 'warden', 'security_staff'],
      });
    }

    logActivity({
      user: req.user,
      module: 'movements',
      action: 'RECORD_ENTRY',
      entityType: 'movement',
      entityId: move.id,
      details: `Checked in ${move.student_name} (${nextStatus})`,
    });
  })();

  res.json({ success: true, status: nextStatus, actual_return_time: nowIso });
});

movementsRouter.post('/attendance', requirePermission('movements', 'edit'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    attendance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    records: z
      .array(
        z.object({
          student_id: z.number().int().positive(),
          status: z.enum(['present', 'absent', 'on_leave']),
          check_in_time: z.string().optional().default(''),
          check_out_time: z.string().optional().default(''),
          remarks: z.string().optional().default(''),
        }),
      )
      .min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid attendance_date and records are required' });
    return;
  }

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO attendance_records (student_id, attendance_date, status, check_in_time, check_out_time, remarks, marked_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(student_id, attendance_date) DO UPDATE SET
       status = excluded.status,
       check_in_time = excluded.check_in_time,
       check_out_time = excluded.check_out_time,
       remarks = excluded.remarks,
       marked_by = excluded.marked_by,
       updated_at = datetime('now')`,
  );

  db.transaction(() => {
    for (const r of parsed.data.records) {
      upsert.run(
        r.student_id,
        parsed.data.attendance_date,
        r.status,
        r.check_in_time,
        r.check_out_time,
        r.remarks.trim(),
        req.user!.id,
      );
    }
    logActivity({
      user: req.user,
      module: 'movements',
      action: 'MARK_ATTENDANCE',
      entityType: 'attendance',
      entityId: parsed.data.attendance_date,
      details: `Updated attendance for ${parsed.data.records.length} student(s) on ${parsed.data.attendance_date}`,
    });
  })();

  res.json({ success: true });
});

