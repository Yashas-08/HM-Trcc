import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database.js';
import { authenticateJWT, requirePermission, requireRoles, type AuthenticatedRequest } from '../middleware/auth.js';
import { logActivity } from '../utils/audit.js';

export const settingsRouter = Router();
settingsRouter.use(authenticateJWT);

settingsRouter.get('/', requirePermission('settings', 'view'), (_req, res) => {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM hostel_settings WHERE id = 1').get() as Record<string, unknown>;
  const blocks = db.prepare('SELECT * FROM blocks ORDER BY name ASC').all();
  const floors = db
    .prepare(
      `SELECT f.*, b.name AS block_name
       FROM floors f JOIN blocks b ON b.id = f.block_id
       ORDER BY b.name ASC, f.floor_number ASC`,
    )
    .all();

  const activityLogs = db
    .prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 100')
    .all();

  res.json({
    settings: {
      ...settings,
      notification_prefs: (() => {
        try {
          return JSON.parse(String(settings?.notification_prefs_json || '{}'));
        } catch {
          return {};
        }
      })(),
      security_settings: (() => {
        try {
          return JSON.parse(String(settings?.security_settings_json || '{}'));
        } catch {
          return {};
        }
      })(),
    },
    blocks,
    floors,
    activityLogs,
  });
});

const updateSettingsSchema = z.object({
  hostel_name: z.string().min(2).max(120).optional(),
  curfew_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  mess_booking_open_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  mess_booking_close_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakfast_window: z.string().max(40).optional(),
  lunch_window: z.string().max(40).optional(),
  dinner_window: z.string().max(40).optional(),
  attendance_cutoff_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  late_return_grace_minutes: z.number().int().min(0).max(180).optional(),
  allow_same_day_booking: z.boolean().optional(),
  notification_prefs: z
    .object({
      leave: z.boolean(),
      complaint: z.boolean(),
      notice: z.boolean(),
      late_return: z.boolean(),
    })
    .optional(),
  security_settings: z
    .object({
      require_gate_remarks: z.boolean(),
      auto_flag_late_returns: z.boolean(),
      session_timeout_hours: z.number().int().min(1).max(72),
    })
    .optional(),
});

settingsRouter.put('/', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid settings data' });
    return;
  }

  const d = parsed.data;
  const db = getDb();

  db.prepare(
    `UPDATE hostel_settings SET
       hostel_name = COALESCE(?, hostel_name),
       curfew_time = COALESCE(?, curfew_time),
       mess_booking_open_time = COALESCE(?, mess_booking_open_time),
       mess_booking_close_time = COALESCE(?, mess_booking_close_time),
       breakfast_window = COALESCE(?, breakfast_window),
       lunch_window = COALESCE(?, lunch_window),
       dinner_window = COALESCE(?, dinner_window),
       attendance_cutoff_time = COALESCE(?, attendance_cutoff_time),
       late_return_grace_minutes = COALESCE(?, late_return_grace_minutes),
       allow_same_day_booking = COALESCE(?, allow_same_day_booking),
       notification_prefs_json = COALESCE(?, notification_prefs_json),
       security_settings_json = COALESCE(?, security_settings_json),
       updated_at = datetime('now')
     WHERE id = 1`,
  ).run(
    d.hostel_name?.trim() ?? null,
    d.curfew_time ?? null,
    d.mess_booking_open_time ?? null,
    d.mess_booking_close_time ?? null,
    d.breakfast_window ?? null,
    d.lunch_window ?? null,
    d.dinner_window ?? null,
    d.attendance_cutoff_time ?? null,
    d.late_return_grace_minutes ?? null,
    d.allow_same_day_booking === undefined ? null : d.allow_same_day_booking ? 1 : 0,
    d.notification_prefs ? JSON.stringify(d.notification_prefs) : null,
    d.security_settings ? JSON.stringify(d.security_settings) : null,
  );

  logActivity({
    user: req.user,
    module: 'settings',
    action: 'UPDATE_SETTINGS',
    entityType: 'hostel_settings',
    entityId: 1,
    details: 'Updated hostel configuration and system settings',
  });

  res.json({ success: true });
});

settingsRouter.get('/activity-logs', requireRoles('super_admin', 'warden'), (req, res) => {
  const db = getDb();
  const moduleFilter = typeof req.query.module === 'string' ? req.query.module : 'all';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const conds: string[] = [];
  const params: string[] = [];
  if (moduleFilter !== 'all') {
    conds.push('module = ?');
    params.push(moduleFilter);
  }
  if (q) {
    const like = `%${q}%`;
    conds.push('(user_name LIKE ? OR action LIKE ? OR details LIKE ?)');
    params.push(like, like, like);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const logs = db
    .prepare(`SELECT * FROM activity_logs ${where} ORDER BY id DESC LIMIT 200`)
    .all(...params);

  res.json({ logs });
});

