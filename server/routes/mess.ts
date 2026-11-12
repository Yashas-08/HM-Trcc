import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb } from '../db/database.js';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { logActivity } from '../utils/audit.js';

export const messRouter = Router();
messRouter.use(authenticateJWT);

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

messRouter.get('/overview', requirePermission('mess', 'view'), (req, res) => {
  const db = getDb();
  const yesterday = dateStr(-1);
  const today = dateStr(0);
  const tomorrow = dateStr(1);

  const dateCategory =
    req.query.dateCategory === 'yesterday'
      ? yesterday
      : req.query.dateCategory === 'tomorrow'
        ? tomorrow
        : today;

  const mealTypeFilter = typeof req.query.mealType === 'string' ? req.query.mealType : 'all';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const settings = db
    .prepare(
      `SELECT mess_booking_open_time, mess_booking_close_time, breakfast_window, lunch_window, dinner_window, allow_same_day_booking
       FROM hostel_settings WHERE id = 1`,
    )
    .get();

  const menus = db
    .prepare('SELECT * FROM mess_menus WHERE menu_date IN (?, ?, ?) ORDER BY menu_date ASC')
    .all(yesterday, today, tomorrow);

  const conds = ['mb.meal_date = ?'];
  const params: Array<string | number> = [dateCategory];
  if (mealTypeFilter !== 'all') {
    conds.push('mb.meal_type = ?');
    params.push(mealTypeFilter);
  }
  if (q) {
    const like = `%${q}%`;
    conds.push('(s.full_name LIKE ? OR s.student_code LIKE ? OR mb.booking_code LIKE ?)');
    params.push(like, like, like);
  }

  const bookings = db
    .prepare(
      `SELECT
         mb.*,
         s.student_code,
         s.full_name AS student_name,
         COALESCE(r.room_number, '--') AS room_number
       FROM meal_bookings mb
       JOIN students s ON s.id = mb.student_id
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
       LEFT JOIN rooms r ON r.id = ra.room_id
       WHERE ${conds.join(' AND ')}
       ORDER BY mb.id DESC`,
    )
    .all(...params);

  const summary = db
    .prepare(
      `SELECT
         SUM(CASE WHEN meal_type = 'breakfast' AND booking_status = 'booked' THEN 1 ELSE 0 END) AS breakfast_bookings,
         SUM(CASE WHEN meal_type = 'lunch' AND booking_status = 'booked' THEN 1 ELSE 0 END) AS lunch_bookings,
         SUM(CASE WHEN meal_type = 'dinner' AND booking_status = 'booked' THEN 1 ELSE 0 END) AS dinner_bookings,
         SUM(CASE WHEN booking_status = 'booked' THEN 1 ELSE 0 END) AS total_bookings,
         SUM(CASE WHEN verified_status = 'served' THEN 1 ELSE 0 END) AS served_count,
         SUM(CASE WHEN booking_status = 'booked' AND verified_status != 'served' THEN 1 ELSE 0 END) AS unused_count
       FROM meal_bookings
       WHERE meal_date = ?`,
    )
    .get(dateCategory);

  res.json({
    dates: { yesterday, today, tomorrow },
    selectedDate: dateCategory,
    settings,
    menus,
    bookings,
    summary,
  });
});

messRouter.put('/menus', requirePermission('mess', 'edit'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    menu_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    meal_type: z.enum(['breakfast', 'lunch', 'dinner']),
    items_text: z.string().min(3, 'Menu items cannot be empty').max(600),
    is_published: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid menu input' });
    return;
  }

  const db = getDb();
  const d = parsed.data;
  db.prepare(
    `INSERT INTO mess_menus (menu_date, meal_type, items_text, is_published, published_by, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(menu_date, meal_type) DO UPDATE SET
       items_text = excluded.items_text,
       is_published = excluded.is_published,
       published_by = excluded.published_by,
       updated_at = datetime('now')`,
  ).run(d.menu_date, d.meal_type, d.items_text.trim(), d.is_published ? 1 : 0, req.user!.id);

  logActivity({
    user: req.user,
    module: 'mess',
    action: d.is_published ? 'PUBLISH_MENU' : 'SAVE_MENU',
    entityType: 'mess_menu',
    entityId: `${d.menu_date}:${d.meal_type}`,
    details: `${d.is_published ? 'Published' : 'Saved'} ${d.meal_type} menu for ${d.menu_date}`,
  });

  res.json({ success: true });
});

messRouter.post('/bookings', requirePermission('mess', 'create'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    student_id: z.number().int().positive(),
    meal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    meal_type: z.enum(['breakfast', 'lunch', 'dinner']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid student_id, meal_date, and meal_type are required' });
    return;
  }

  const db = getDb();
  const d = parsed.data;
  const today = dateStr(0);
  const settings = db
    .prepare('SELECT mess_booking_open_time, mess_booking_close_time, allow_same_day_booking FROM hostel_settings WHERE id = 1')
    .get() as
    | { mess_booking_open_time: string; mess_booking_close_time: string; allow_same_day_booking: number }
    | undefined;

  if (d.meal_date < today) {
    res.status(400).json({ error: 'Cannot book meals for a past date' });
    return;
  }
  if (d.meal_date === today && (!settings || settings.allow_same_day_booking === 0)) {
    res.status(400).json({ error: "Students cannot book today's meal on the same day. Please book for tomorrow or later." });
    return;
  }

  // Enforce booking time window for next-day advance booking when date == tomorrow
  if (d.meal_date === dateStr(1) && settings) {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (hhmm < settings.mess_booking_open_time || hhmm > settings.mess_booking_close_time) {
      res.status(400).json({
        error: `Advance meal booking window is ${settings.mess_booking_open_time} to ${settings.mess_booking_close_time}.`,
      });
      return;
    }
  }

  const student = db
    .prepare("SELECT id, full_name FROM students WHERE id = ? AND status = 'active'")
    .get(d.student_id) as { id: number; full_name: string } | undefined;
  if (!student) {
    res.status(404).json({ error: 'Active student not found' });
    return;
  }

  const existing = db
    .prepare('SELECT id, booking_status FROM meal_bookings WHERE student_id = ? AND meal_date = ? AND meal_type = ?')
    .get(d.student_id, d.meal_date, d.meal_type) as { id: number; booking_status: string } | undefined;
  if (existing && existing.booking_status === 'booked') {
    res.status(409).json({ error: 'Meal already booked for this student on the selected date' });
    return;
  }

  const mealChar = d.meal_type[0].toUpperCase();
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const bookingCode = `MB-${d.meal_date.replace(/-/g, '')}-${mealChar}-${d.student_id}`;
  const qrToken = `HMTRCC-MEAL-${d.meal_date}-${mealChar}-${d.student_id}-${suffix}`;

  if (existing) {
    db.prepare(
      "UPDATE meal_bookings SET booking_status = 'booked', verified_status = 'pending', qr_token = ?, verified_at = NULL WHERE id = ?",
    ).run(qrToken, existing.id);
  } else {
    db.prepare(
      `INSERT INTO meal_bookings (booking_code, student_id, meal_date, meal_type, qr_token, booking_status, verified_status)
       VALUES (?, ?, ?, ?, ?, 'booked', 'pending')`,
    ).run(bookingCode, d.student_id, d.meal_date, d.meal_type, qrToken);
  }

  logActivity({
    user: req.user,
    module: 'mess',
    action: 'CREATE_BOOKING',
    entityType: 'meal_booking',
    entityId: bookingCode,
    details: `Booked ${d.meal_type} on ${d.meal_date} for ${student.full_name}`,
  });

  res.status(201).json({ booking_code: bookingCode, qr_token: qrToken });
});

messRouter.patch('/bookings/:id/cancel', requirePermission('mess', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const booking = db.prepare('SELECT id, booking_code, verified_status FROM meal_bookings WHERE id = ?').get(id) as
    | { id: number; booking_code: string; verified_status: string }
    | undefined;

  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }
  if (booking.verified_status === 'served') {
    res.status(400).json({ error: 'Cannot cancel a meal that has already been served' });
    return;
  }

  db.prepare("UPDATE meal_bookings SET booking_status = 'cancelled' WHERE id = ?").run(id);
  logActivity({
    user: req.user,
    module: 'mess',
    action: 'CANCEL_BOOKING',
    entityType: 'meal_booking',
    entityId: booking.booking_code,
    details: `Cancelled meal booking ${booking.booking_code}`,
  });

  res.json({ success: true });
});

// QR Scanner Verification (Module 4.7)
messRouter.post('/qr/verify', requirePermission('qr_scanner', 'create'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    qr_token: z.string().optional(),
    student_lookup: z.string().optional(),
    meal_type: z.enum(['breakfast', 'lunch', 'dinner']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.qr_token && !parsed.data.student_lookup)) {
    res.status(400).json({ error: 'Provide either a QR code token or Student ID / name lookup' });
    return;
  }

  const db = getDb();
  const today = dateStr(0);
  const { qr_token, student_lookup, meal_type } = parsed.data;
  const rawInput = (qr_token || student_lookup || '').trim();

  type BookingLookupRow = {
    id: number;
    booking_code: string;
    student_id: number;
    meal_date: string;
    meal_type: string;
    qr_token: string;
    booking_status: string;
    verified_status: string;
    verified_at: string | null;
    student_code: string;
    student_name: string;
    room_number: string;
  };

  let booking: BookingLookupRow | undefined;
  if (qr_token) {
    booking = db
      .prepare(
        `SELECT
           mb.*, s.student_code, s.full_name AS student_name,
           COALESCE(r.room_number, '--') AS room_number
         FROM meal_bookings mb
         JOIN students s ON s.id = mb.student_id
         LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
         LEFT JOIN rooms r ON r.id = ra.room_id
         WHERE mb.qr_token = ?`,
      )
      .get(rawInput) as BookingLookupRow | undefined;
  } else if (student_lookup) {
    const clean = student_lookup.trim();
    booking = db
      .prepare(
        `SELECT
           mb.*, s.student_code, s.full_name AS student_name,
           COALESCE(r.room_number, '--') AS room_number
         FROM meal_bookings mb
         JOIN students s ON s.id = mb.student_id
         LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
         LEFT JOIN rooms r ON r.id = ra.room_id
         WHERE mb.meal_date = ? AND mb.meal_type = ?
           AND (lower(s.student_code) = lower(?) OR lower(mb.booking_code) = lower(?) OR lower(s.full_name) = lower(?))`,
      )
      .get(today, meal_type, clean, clean, clean) as BookingLookupRow | undefined;
  }

  const recordScan = (
    result: 'success' | 'invalid' | 'expired' | 'duplicate',
    message: string,
    b?: BookingLookupRow,
  ) => {
    db.prepare(
      `INSERT INTO meal_scans (qr_token_raw, booking_id, student_id, meal_type, scan_result, message, scanned_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(rawInput, b?.id ?? null, b?.student_id ?? null, b?.meal_type ?? meal_type, result, message, req.user!.id);
  };

  if (!booking || booking.booking_status === 'cancelled') {
    const msg = 'No active meal booking matched this QR code or Student ID.';
    recordScan('invalid', msg);
    res.status(404).json({
      result: 'invalid',
      message: msg,
      verification: null,
    });
    return;
  }

  if (booking.meal_type !== meal_type) {
    const msg = `Booking is for ${booking.meal_type.toUpperCase()}, not the active ${meal_type.toUpperCase()} session.`;
    recordScan('invalid', msg, booking);
    res.status(400).json({
      result: 'invalid',
      message: msg,
      verification: booking,
    });
    return;
  }

  if (booking.meal_date < today || booking.verified_status === 'expired') {
    const msg = `Booking ${booking.booking_code} expired (${booking.meal_date}).`;
    recordScan('expired', msg, booking);
    res.status(400).json({
      result: 'expired',
      message: msg,
      verification: booking,
    });
    return;
  }

  if (booking.meal_date > today) {
    const msg = `Booking is scheduled for ${booking.meal_date} and cannot be served today.`;
    recordScan('invalid', msg, booking);
    res.status(400).json({
      result: 'invalid',
      message: msg,
      verification: booking,
    });
    return;
  }

  if (booking.verified_status === 'served') {
    const msg = `Duplicate scan rejected: ${booking.student_name} already collected ${booking.meal_type} at ${booking.verified_at}.`;
    recordScan('duplicate', msg, booking);
    res.status(409).json({
      result: 'duplicate',
      message: msg,
      verification: booking,
    });
    return;
  }

  const nowTs = new Date().toISOString().slice(0, 16);
  db.transaction(() => {
    db.prepare(
      "UPDATE meal_bookings SET verified_status = 'served', verified_at = ?, verified_by = ? WHERE id = ?",
    ).run(nowTs, req.user!.id, booking!.id);

    const msg = `${booking!.meal_type.toUpperCase()} verified and marked as served for ${booking!.student_name}.`;
    recordScan('success', msg, booking);
    logActivity({
      user: req.user,
      module: 'qr_scanner',
      action: 'VERIFY_MEAL_QR',
      entityType: 'meal_booking',
      entityId: booking!.booking_code,
      details: msg,
    });
  })();

  res.json({
    result: 'success',
    message: `${booking.meal_type.toUpperCase()} verified and marked as served.`,
    verification: {
      ...booking,
      verified_status: 'served',
      verified_at: nowTs,
    },
  });
});

messRouter.get('/qr/scans', requirePermission('qr_scanner', 'view'), (req, res) => {
  const db = getDb();
  const resultFilter = typeof req.query.result === 'string' ? req.query.result : 'all';
  const where = resultFilter !== 'all' ? 'WHERE ms.scan_result = ?' : '';
  const params = resultFilter !== 'all' ? [resultFilter] : [];

  const scans = db
    .prepare(
      `SELECT
         ms.*,
         s.student_code,
         s.full_name AS student_name,
         COALESCE(r.room_number, '--') AS room_number,
         u.full_name AS scanned_by_name
       FROM meal_scans ms
       LEFT JOIN students s ON s.id = ms.student_id
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
       LEFT JOIN rooms r ON r.id = ra.room_id
       LEFT JOIN users u ON u.id = ms.scanned_by
       ${where}
       ORDER BY ms.id DESC
       LIMIT 100`,
    )
    .all(...params);

  res.json({ scans });
});

