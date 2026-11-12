import { getDb } from '../db/database.js';
import type { AuthUser, UserRole } from '../types.js';

export function logActivity(params: {
  user?: Pick<AuthUser, 'id' | 'full_name' | 'role'> | null;
  module: string;
  action: string;
  entityType?: string;
  entityId?: string | number;
  details?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO activity_logs (user_id, user_name, user_role, module, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.user?.id ?? null,
    params.user?.full_name ?? 'System',
    params.user?.role ?? 'system',
    params.module,
    params.action,
    params.entityType ?? '',
    params.entityId !== undefined ? String(params.entityId) : '',
    params.details ?? '',
  );
}

export function createNotification(params: {
  type: 'leave' | 'complaint' | 'notice' | 'late_return' | 'mess';
  title: string;
  message: string;
  linkPath: string;
  targetRoles?: UserRole[];
}): void {
  const db = getDb();
  const settingsRow = db
    .prepare('SELECT notification_prefs_json FROM hostel_settings WHERE id = 1')
    .get() as { notification_prefs_json?: string } | undefined;

  if (settingsRow?.notification_prefs_json) {
    try {
      const prefs = JSON.parse(settingsRow.notification_prefs_json) as Record<string, boolean>;
      if (prefs[params.type] === false) {
        return;
      }
    } catch {
      // proceed with default
    }
  }

  db.prepare(
    `INSERT INTO notifications (type, title, message, link_path, target_roles_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    params.type,
    params.title,
    params.message,
    params.linkPath,
    JSON.stringify(params.targetRoles ?? ['super_admin', 'warden']),
  );
}

