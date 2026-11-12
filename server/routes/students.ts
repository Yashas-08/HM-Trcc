import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database.js';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { allocateStudentToRoomTx, syncRoomOccupancyStatus } from '../utils/roomSync.js';
import { logActivity } from '../utils/audit.js';

export const studentsRouter = Router();

studentsRouter.use(authenticateJWT);

const studentSchema = z.object({
  full_name: z.string().min(2, 'Full name is required').max(120),
  dob: z.string().optional().default(''),
  gender: z.enum(['Male', 'Female', 'Other']).optional().default('Male'),
  phone: z.string().min(7, 'Valid phone number is required').max(20),
  email: z.string().email('Valid email is required'),
  photo_url: z.string().nullable().optional(),
  guardian_name: z.string().min(2, 'Guardian name is required').max(120),
  guardian_phone: z.string().min(7, 'Guardian phone is required').max(20),
  guardian_relation: z.string().optional().default('Parent'),
  emergency_contact_name: z.string().optional().default(''),
  emergency_contact_phone: z.string().optional().default(''),
  college_name: z.string().optional().default(''),
  course: z.string().optional().default(''),
  year_of_study: z.string().optional().default(''),
  admission_date: z.string().min(4, 'Admission date is required'),
  documents: z.array(z.object({ name: z.string(), url: z.string() })).optional().default([]),
  room_id: z.number().int().positive().nullable().optional(),
  bed_label: z.string().optional(),
});

studentsRouter.get('/', requirePermission('students', 'view'), (req, res) => {
  const db = getDb();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const blockId = typeof req.query.blockId === 'string' && req.query.blockId !== 'all' ? Number(req.query.blockId) : null;

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (q) {
    conditions.push('(s.full_name LIKE ? OR s.student_code LIKE ? OR s.email LIKE ? OR s.phone LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (status !== 'all') {
    conditions.push('s.status = ?');
    params.push(status);
  }
  if (blockId) {
    conditions.push('r.block_id = ?');
    params.push(blockId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT
         s.*,
         r.id AS room_id,
         r.room_number,
         b.id AS block_id,
         b.name AS block_name,
         ra.bed_label
       FROM students s
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
       LEFT JOIN rooms r ON r.id = ra.room_id
       LEFT JOIN blocks b ON b.id = r.block_id
       ${where}
       ORDER BY s.id DESC`,
    )
    .all(...params);

  res.json({ students: rows });
});

studentsRouter.get('/:id', requirePermission('students', 'view'), (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  const student = db
    .prepare(
      `SELECT
         s.*,
         r.id AS room_id,
         r.room_number,
         b.id AS block_id,
         b.name AS block_name,
         f.label AS floor_label,
         ra.bed_label,
         ra.allocated_at
       FROM students s
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
       LEFT JOIN rooms r ON r.id = ra.room_id
       LEFT JOIN blocks b ON b.id = r.block_id
       LEFT JOIN floors f ON f.id = r.floor_id
       WHERE s.id = ?`,
    )
    .get(id);

  if (!student) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  const attendanceHistory = db
    .prepare(
      `SELECT * FROM attendance_records WHERE student_id = ? ORDER BY attendance_date DESC LIMIT 30`,
    )
    .all(id);

  const leaveHistory = db
    .prepare(
      `SELECT lr.*, u.full_name AS reviewed_by_name
       FROM leave_requests lr
       LEFT JOIN users u ON u.id = lr.reviewed_by
       WHERE lr.student_id = ? ORDER BY lr.id DESC`,
    )
    .all(id);

  const complaintHistory = db
    .prepare(
      `SELECT c.*, u.full_name AS assigned_staff_name
       FROM complaints c
       LEFT JOIN users u ON u.id = c.assigned_staff_id
       WHERE c.student_id = ? ORDER BY c.id DESC`,
    )
    .all(id);

  const mealHistory = db
    .prepare(
      `SELECT * FROM meal_bookings WHERE student_id = ? ORDER BY meal_date DESC, id DESC LIMIT 30`,
    )
    .all(id);

  const movementHistory = db
    .prepare(`SELECT * FROM movements WHERE student_id = ? ORDER BY id DESC LIMIT 20`)
    .all(id);

  res.json({
    student,
    attendanceHistory,
    leaveHistory,
    complaintHistory,
    mealHistory,
    movementHistory,
  });
});

studentsRouter.post('/', requirePermission('students', 'create'), (req: AuthenticatedRequest, res) => {
  const parsed = studentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation failed' });
    return;
  }

  const db = getDb();
  const data = parsed.data;
  const dupEmail = db
    .prepare('SELECT id FROM students WHERE lower(email) = lower(?)')
    .get(data.email.trim());
  if (dupEmail) {
    res.status(409).json({ error: 'A student with this email already exists' });
    return;
  }

  try {
    const newId = db.transaction(() => {
      const countRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next_num FROM students').get() as {
        next_num: number;
      };
      const studentCode = `STU-${new Date().getFullYear()}-${String(countRow.next_num).padStart(3, '0')}`;

      const result = db
        .prepare(
          `INSERT INTO students (
            student_code, full_name, dob, gender, phone, email, photo_url,
            guardian_name, guardian_phone, guardian_relation,
            emergency_contact_name, emergency_contact_phone,
            college_name, course, year_of_study, admission_date, documents_json, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        )
        .run(
          studentCode,
          data.full_name.trim(),
          data.dob,
          data.gender,
          data.phone.trim(),
          data.email.trim(),
          data.photo_url || null,
          data.guardian_name.trim(),
          data.guardian_phone.trim(),
          data.guardian_relation.trim(),
          data.emergency_contact_name.trim(),
          data.emergency_contact_phone.trim(),
          data.college_name.trim(),
          data.course.trim(),
          data.year_of_study.trim(),
          data.admission_date,
          JSON.stringify(data.documents || []),
        );

      const createdId = Number(result.lastInsertRowid);
      if (data.room_id) {
        allocateStudentToRoomTx(db, {
          studentId: createdId,
          targetRoomId: data.room_id,
          bedLabel: data.bed_label,
          allocatedBy: req.user!.id,
        });
      }

      logActivity({
        user: req.user,
        module: 'students',
        action: 'CREATE_STUDENT',
        entityType: 'student',
        entityId: createdId,
        details: `Admitted student ${data.full_name.trim()} (${studentCode})`,
      });

      return createdId;
    })();

    res.status(201).json({ id: newId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to create student' });
  }
});

studentsRouter.put('/:id', requirePermission('students', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = studentSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update data' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  const d = parsed.data;
  if (d.email) {
    const dup = db
      .prepare('SELECT id FROM students WHERE lower(email) = lower(?) AND id != ?')
      .get(d.email.trim(), id);
    if (dup) {
      res.status(409).json({ error: 'Another student already uses this email' });
      return;
    }
  }

  db.prepare(
    `UPDATE students SET
      full_name = COALESCE(?, full_name),
      dob = COALESCE(?, dob),
      gender = COALESCE(?, gender),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      photo_url = COALESCE(?, photo_url),
      guardian_name = COALESCE(?, guardian_name),
      guardian_phone = COALESCE(?, guardian_phone),
      guardian_relation = COALESCE(?, guardian_relation),
      emergency_contact_name = COALESCE(?, emergency_contact_name),
      emergency_contact_phone = COALESCE(?, emergency_contact_phone),
      college_name = COALESCE(?, college_name),
      course = COALESCE(?, course),
      year_of_study = COALESCE(?, year_of_study),
      admission_date = COALESCE(?, admission_date),
      documents_json = COALESCE(?, documents_json),
      updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    d.full_name?.trim() ?? null,
    d.dob ?? null,
    d.gender ?? null,
    d.phone?.trim() ?? null,
    d.email?.trim() ?? null,
    d.photo_url === undefined ? null : d.photo_url,
    d.guardian_name?.trim() ?? null,
    d.guardian_phone?.trim() ?? null,
    d.guardian_relation?.trim() ?? null,
    d.emergency_contact_name?.trim() ?? null,
    d.emergency_contact_phone?.trim() ?? null,
    d.college_name?.trim() ?? null,
    d.course?.trim() ?? null,
    d.year_of_study?.trim() ?? null,
    d.admission_date ?? null,
    d.documents ? JSON.stringify(d.documents) : null,
    id,
  );

  logActivity({
    user: req.user,
    module: 'students',
    action: 'UPDATE_STUDENT',
    entityType: 'student',
    entityId: id,
    details: `Updated profile for student #${id}`,
  });

  res.json({ success: true });
});

studentsRouter.post('/:id/allocate-room', requirePermission('students', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const schema = z.object({
    room_id: z.number().int().positive(),
    bed_label: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid room_id is required' });
    return;
  }

  const db = getDb();
  try {
    const result = db.transaction(() => {
      const outcome = allocateStudentToRoomTx(db, {
        studentId: id,
        targetRoomId: parsed.data.room_id,
        bedLabel: parsed.data.bed_label,
        allocatedBy: req.user!.id,
      });

      logActivity({
        user: req.user,
        module: 'rooms',
        action: outcome.previousRoomId ? 'TRANSFER_ROOM' : 'ALLOCATE_ROOM',
        entityType: 'student',
        entityId: id,
        details: outcome.previousRoomId
          ? `Transferred student #${id} from room #${outcome.previousRoomId} to room #${parsed.data.room_id}`
          : `Allocated student #${id} to room #${parsed.data.room_id}`,
      });
      return outcome;
    })();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Room allocation failed' });
  }
});

studentsRouter.post('/:id/deactivate', requirePermission('students', 'delete'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const student = db.prepare('SELECT id, full_name, status FROM students WHERE id = ?').get(id) as
    | { id: number; full_name: string; status: string }
    | undefined;

  if (!student) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  db.transaction(() => {
    const activeAlloc = db
      .prepare('SELECT id, room_id FROM room_allocations WHERE student_id = ? AND is_active = 1')
      .get(id) as { id: number; room_id: number } | undefined;

    if (activeAlloc) {
      db.prepare("UPDATE room_allocations SET is_active = 0, vacated_at = datetime('now') WHERE id = ?").run(
        activeAlloc.id,
      );
      syncRoomOccupancyStatus(db, activeAlloc.room_id);
    }

    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      "UPDATE students SET status = 'inactive', departure_date = COALESCE(departure_date, ?), updated_at = datetime('now') WHERE id = ?",
    ).run(today, id);

    logActivity({
      user: req.user,
      module: 'students',
      action: 'DEACTIVATE_STUDENT',
      entityType: 'student',
      entityId: id,
      details: `Deactivated student ${student.full_name} and released bed allocation`,
    });
  })();

  res.json({ success: true });
});

studentsRouter.post('/:id/reactivate', requirePermission('students', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const student = db.prepare('SELECT id, full_name FROM students WHERE id = ?').get(id) as
    | { id: number; full_name: string }
    | undefined;
  if (!student) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }
  db.prepare(
    "UPDATE students SET status = 'active', departure_date = NULL, updated_at = datetime('now') WHERE id = ?",
  ).run(id);
  logActivity({
    user: req.user,
    module: 'students',
    action: 'REACTIVATE_STUDENT',
    entityType: 'student',
    entityId: id,
    details: `Reactivated student ${student.full_name}`,
  });
  res.json({ success: true });
});

