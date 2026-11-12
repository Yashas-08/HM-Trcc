import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database.js';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { createNotification, logActivity } from '../utils/audit.js';

export const noticesRouter = Router();
noticesRouter.use(authenticateJWT);

noticesRouter.get('/', requirePermission('notices', 'view'), (req, res) => {
  const db = getDb();
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  // Auto-promote scheduled notices whose publish_at has arrived
  const nowIso = new Date().toISOString().slice(0, 16);
  db.prepare(
    "UPDATE notices SET status = 'published', updated_at = datetime('now') WHERE status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= ?",
  ).run(nowIso);

  const conds: string[] = [];
  const params: Array<string | number> = [];
  if (status !== 'all') {
    conds.push('n.status = ?');
    params.push(status);
  }
  if (q) {
    const like = `%${q}%`;
    conds.push('(n.title LIKE ? OR n.description LIKE ? OR n.category LIKE ?)');
    params.push(like, like, like);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT n.*, u.full_name AS author_name
       FROM notices n
       LEFT JOIN users u ON u.id = n.published_by
       ${where}
       ORDER BY n.id DESC`,
    )
    .all(...params) as Array<Record<string, unknown>>;

  const notices = rows.map((row) => ({
    ...row,
    target_ids: (() => {
      try {
        return JSON.parse(String(row.target_ids_json || '[]'));
      } catch {
        return [];
      }
    })(),
  }));

  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
         SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
         SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
         SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived
       FROM notices`,
    )
    .get();

  res.json({ notices, summary });
});

const noticeSchema = z.object({
  title: z.string().min(3, 'Notice title is required').max(180),
  description: z.string().min(5, 'Notice description is required').max(2500),
  category: z.string().min(2).max(50).default('General'),
  attachment_url: z.string().nullable().optional(),
  target_type: z.enum(['all', 'blocks', 'groups', 'students']).default('all'),
  target_ids: z.array(z.union([z.number(), z.string()])).optional().default([]),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).default('draft'),
  publish_at: z.string().nullable().optional(),
});

noticesRouter.post('/', requirePermission('notices', 'create'), (req: AuthenticatedRequest, res) => {
  const parsed = noticeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid notice input' });
    return;
  }

  const d = parsed.data;
  if (d.status === 'scheduled' && !d.publish_at) {
    res.status(400).json({ error: 'Publication date/time is required for scheduled notices' });
    return;
  }

  const publishAt =
    d.status === 'published' ? d.publish_at || new Date().toISOString().slice(0, 16) : d.publish_at || null;

  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO notices (
        title, description, category, attachment_url, target_type, target_ids_json, status, publish_at, published_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      d.title.trim(),
      d.description.trim(),
      d.category,
      d.attachment_url || null,
      d.target_type,
      JSON.stringify(d.target_ids),
      d.status,
      publishAt,
      req.user!.id,
    );

  const id = Number(result.lastInsertRowid);
  if (d.status === 'published') {
    createNotification({
      type: 'notice',
      title: 'Notice Published',
      message: `${d.title.trim()} (${d.category}) published to ${d.target_type}.`,
      linkPath: '/notices',
      targetRoles: ['super_admin', 'warden', 'mess_staff', 'security_staff', 'maintenance_staff'],
    });
  }

  logActivity({
    user: req.user,
    module: 'notices',
    action: `NOTICE_${d.status.toUpperCase()}`,
    entityType: 'notice',
    entityId: id,
    details: `${d.status === 'published' ? 'Published' : 'Saved'} notice "${d.title.trim()}"`,
  });

  res.status(201).json({ id });
});

noticesRouter.put('/:id', requirePermission('notices', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = noticeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM notices WHERE id = ?').get(id) as
    | { id: number; title: string; status: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Notice not found' });
    return;
  }

  const d = parsed.data;
  if (d.status === 'scheduled' && !d.publish_at) {
    res.status(400).json({ error: 'Publication date/time is required for scheduled notices' });
    return;
  }

  const nextPublishAt =
    d.status === 'published'
      ? d.publish_at || new Date().toISOString().slice(0, 16)
      : d.publish_at === undefined
        ? null
        : d.publish_at;

  db.prepare(
    `UPDATE notices SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       category = COALESCE(?, category),
       attachment_url = COALESCE(?, attachment_url),
       target_type = COALESCE(?, target_type),
       target_ids_json = COALESCE(?, target_ids_json),
       status = COALESCE(?, status),
       publish_at = COALESCE(?, publish_at),
       updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    d.title?.trim() ?? null,
    d.description?.trim() ?? null,
    d.category ?? null,
    d.attachment_url === undefined ? null : d.attachment_url,
    d.target_type ?? null,
    d.target_ids ? JSON.stringify(d.target_ids) : null,
    d.status ?? null,
    nextPublishAt,
    id,
  );

  if (d.status === 'published' && existing.status !== 'published') {
    createNotification({
      type: 'notice',
      title: 'Notice Published',
      message: `${d.title?.trim() || existing.title} is now live.`,
      linkPath: '/notices',
      targetRoles: ['super_admin', 'warden', 'mess_staff', 'security_staff', 'maintenance_staff'],
    });
  }

  logActivity({
    user: req.user,
    module: 'notices',
    action: 'UPDATE_NOTICE',
    entityType: 'notice',
    entityId: id,
    details: `Updated notice "${d.title?.trim() || existing.title}"`,
  });

  res.json({ success: true });
});

noticesRouter.delete('/:id', requirePermission('notices', 'delete'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare('SELECT id, title FROM notices WHERE id = ?').get(id) as
    | { id: number; title: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Notice not found' });
    return;
  }

  db.prepare('DELETE FROM notices WHERE id = ?').run(id);
  logActivity({
    user: req.user,
    module: 'notices',
    action: 'DELETE_NOTICE',
    entityType: 'notice',
    entityId: id,
    details: `Deleted notice "${existing.title}"`,
  });
  res.json({ success: true });
});

