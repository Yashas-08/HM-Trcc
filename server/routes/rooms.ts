import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database.js';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { allocateStudentToRoomTx, syncRoomOccupancyStatus } from '../utils/roomSync.js';
import { logActivity } from '../utils/audit.js';

export const roomsRouter = Router();

roomsRouter.use(authenticateJWT);

roomsRouter.get('/overview', requirePermission('rooms', 'view'), (_req, res) => {
  const db = getDb();
  const blocks = db.prepare('SELECT * FROM blocks ORDER BY name ASC').all();
  const floors = db.prepare('SELECT * FROM floors ORDER BY block_id ASC, floor_number ASC').all();
  const rooms = db
    .prepare(
      `SELECT
         r.*,
         b.name AS block_name,
         b.code AS block_code,
         f.floor_number,
         f.label AS floor_label,
         (SELECT COUNT(*) FROM room_allocations ra WHERE ra.room_id = r.id AND ra.is_active = 1) AS occupied_beds
       FROM rooms r
       JOIN blocks b ON b.id = r.block_id
       JOIN floors f ON f.id = r.floor_id
       ORDER BY b.name ASC, f.floor_number ASC, r.room_number ASC`,
    )
    .all() as Array<{
    id: number;
    block_id: number;
    floor_id: number;
    room_number: string;
    capacity: number;
    facilities_json: string;
    status: string;
    notes: string;
    block_name: string;
    block_code: string;
    floor_number: number;
    floor_label: string;
    occupied_beds: number;
  }>;

  const activeAllocations = db
    .prepare(
      `SELECT
         ra.id AS allocation_id,
         ra.room_id,
         ra.student_id,
         ra.bed_label,
         ra.allocated_at,
         s.student_code,
         s.full_name,
         s.phone
       FROM room_allocations ra
       JOIN students s ON s.id = ra.student_id
       WHERE ra.is_active = 1
       ORDER BY ra.bed_label ASC`,
    )
    .all() as Array<{
    allocation_id: number;
    room_id: number;
    student_id: number;
    bed_label: string;
    allocated_at: string;
    student_code: string;
    full_name: string;
    phone: string;
  }>;

  const occupantsByRoom = new Map<number, typeof activeAllocations>();
  for (const alloc of activeAllocations) {
    const list = occupantsByRoom.get(alloc.room_id) || [];
    list.push(alloc);
    occupantsByRoom.set(alloc.room_id, list);
  }

  const enrichedRooms = rooms.map((room) => ({
    ...room,
    facilities: (() => {
      try {
        return JSON.parse(room.facilities_json) as string[];
      } catch {
        return [];
      }
    })(),
    available_beds: room.status === 'maintenance' ? 0 : Math.max(0, room.capacity - room.occupied_beds),
    occupants: occupantsByRoom.get(room.id) || [],
  }));

  const unassignedStudents = db
    .prepare(
      `SELECT s.id, s.student_code, s.full_name, s.course
       FROM students s
       WHERE s.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM room_allocations ra WHERE ra.student_id = s.id AND ra.is_active = 1)
       ORDER BY s.full_name ASC`,
    )
    .all();

  const summary = {
    totalRooms: enrichedRooms.length,
    occupiedRooms: enrichedRooms.filter((r) => r.occupied_beds > 0 && r.status !== 'maintenance').length,
    availableRooms: enrichedRooms.filter((r) => r.status !== 'maintenance' && r.occupied_beds < r.capacity).length,
    maintenanceRooms: enrichedRooms.filter((r) => r.status === 'maintenance').length,
    totalBeds: enrichedRooms.reduce((acc, r) => acc + r.capacity, 0),
    operationalBeds: enrichedRooms
      .filter((r) => r.status !== 'maintenance')
      .reduce((acc, r) => acc + r.capacity, 0),
    occupiedBeds: enrichedRooms.reduce((acc, r) => acc + r.occupied_beds, 0),
    availableBeds: enrichedRooms.reduce((acc, r) => acc + r.available_beds, 0),
  };

  res.json({ blocks, floors, rooms: enrichedRooms, unassignedStudents, summary });
});

roomsRouter.post('/blocks', requirePermission('rooms', 'create'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    name: z.string().min(1, 'Block name is required').max(60),
    code: z.string().min(1, 'Block code is required').max(20),
    description: z.string().optional().default(''),
    floorCount: z.number().int().min(1).max(20).optional().default(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid block data' });
    return;
  }

  const db = getDb();
  const exists = db
    .prepare('SELECT id FROM blocks WHERE lower(name) = lower(?) OR lower(code) = lower(?)')
    .get(parsed.data.name.trim(), parsed.data.code.trim());
  if (exists) {
    res.status(409).json({ error: 'Block name or code already exists' });
    return;
  }

  const blockId = db.transaction(() => {
    const r = db
      .prepare('INSERT INTO blocks (name, code, description) VALUES (?, ?, ?)')
      .run(parsed.data.name.trim(), parsed.data.code.trim().toUpperCase(), parsed.data.description.trim());
    const id = Number(r.lastInsertRowid);
    const insFloor = db.prepare('INSERT INTO floors (block_id, floor_number, label) VALUES (?, ?, ?)');
    for (let i = 1; i <= parsed.data.floorCount; i++) {
      insFloor.run(id, i, `Floor ${i}`);
    }
    logActivity({
      user: req.user,
      module: 'rooms',
      action: 'CREATE_BLOCK',
      entityType: 'block',
      entityId: id,
      details: `Created ${parsed.data.name.trim()} with ${parsed.data.floorCount} floor(s)`,
    });
    return id;
  })();

  res.status(201).json({ id: blockId });
});

roomsRouter.post('/floors', requirePermission('rooms', 'create'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    block_id: z.number().int().positive(),
    floor_number: z.number().int().min(0).max(50),
    label: z.string().min(1).max(40),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid block_id, floor_number, and label are required' });
    return;
  }

  const db = getDb();
  const dup = db
    .prepare('SELECT id FROM floors WHERE block_id = ? AND floor_number = ?')
    .get(parsed.data.block_id, parsed.data.floor_number);
  if (dup) {
    res.status(409).json({ error: 'This floor number already exists in the selected block' });
    return;
  }

  const result = db
    .prepare('INSERT INTO floors (block_id, floor_number, label) VALUES (?, ?, ?)')
    .run(parsed.data.block_id, parsed.data.floor_number, parsed.data.label.trim());

  logActivity({
    user: req.user,
    module: 'rooms',
    action: 'CREATE_FLOOR',
    entityType: 'floor',
    entityId: Number(result.lastInsertRowid),
    details: `Added ${parsed.data.label.trim()} to block #${parsed.data.block_id}`,
  });

  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

const roomSchema = z.object({
  block_id: z.number().int().positive(),
  floor_id: z.number().int().positive(),
  room_number: z.string().min(1, 'Room number is required').max(20),
  capacity: z.number().int().min(1).max(20),
  facilities: z.array(z.string()).optional().default([]),
  notes: z.string().optional().default(''),
});

roomsRouter.post('/', requirePermission('rooms', 'create'), (req: AuthenticatedRequest, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid room data' });
    return;
  }

  const db = getDb();
  const dup = db
    .prepare('SELECT id FROM rooms WHERE block_id = ? AND lower(room_number) = lower(?)')
    .get(parsed.data.block_id, parsed.data.room_number.trim());
  if (dup) {
    res.status(409).json({ error: 'Room number already exists in this block' });
    return;
  }

  const result = db
    .prepare(
      `INSERT INTO rooms (block_id, floor_id, room_number, capacity, facilities_json, status, notes)
       VALUES (?, ?, ?, ?, ?, 'available', ?)`,
    )
    .run(
      parsed.data.block_id,
      parsed.data.floor_id,
      parsed.data.room_number.trim(),
      parsed.data.capacity,
      JSON.stringify(parsed.data.facilities),
      parsed.data.notes.trim(),
    );

  const id = Number(result.lastInsertRowid);
  logActivity({
    user: req.user,
    module: 'rooms',
    action: 'CREATE_ROOM',
    entityType: 'room',
    entityId: id,
    details: `Created Room ${parsed.data.room_number.trim()} (Capacity ${parsed.data.capacity})`,
  });

  res.status(201).json({ id });
});

roomsRouter.put('/:id', requirePermission('rooms', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid room data' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM rooms WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  const { occupied } = db
    .prepare('SELECT COUNT(*) AS occupied FROM room_allocations WHERE room_id = ? AND is_active = 1')
    .get(id) as { occupied: number };

  if (parsed.data.capacity < occupied) {
    res.status(400).json({
      error: `Capacity cannot be less than currently occupied beds (${occupied})`,
    });
    return;
  }

  const dup = db
    .prepare('SELECT id FROM rooms WHERE block_id = ? AND lower(room_number) = lower(?) AND id != ?')
    .get(parsed.data.block_id, parsed.data.room_number.trim(), id);
  if (dup) {
    res.status(409).json({ error: 'Room number already exists in this block' });
    return;
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE rooms
       SET block_id = ?, floor_id = ?, room_number = ?, capacity = ?, facilities_json = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      parsed.data.block_id,
      parsed.data.floor_id,
      parsed.data.room_number.trim(),
      parsed.data.capacity,
      JSON.stringify(parsed.data.facilities),
      parsed.data.notes.trim(),
      id,
    );
    syncRoomOccupancyStatus(db, id);
    logActivity({
      user: req.user,
      module: 'rooms',
      action: 'UPDATE_ROOM',
      entityType: 'room',
      entityId: id,
      details: `Updated Room ${parsed.data.room_number.trim()}`,
    });
  })();

  res.json({ success: true });
});

roomsRouter.delete('/:id', requirePermission('rooms', 'delete'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const room = db.prepare('SELECT id, room_number FROM rooms WHERE id = ?').get(id) as
    | { id: number; room_number: string }
    | undefined;

  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  const { occupied } = db
    .prepare('SELECT COUNT(*) AS occupied FROM room_allocations WHERE room_id = ? AND is_active = 1')
    .get(id) as { occupied: number };

  if (occupied > 0) {
    res.status(400).json({ error: 'Cannot delete an occupied room. Vacate or transfer students first.' });
    return;
  }

  db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  logActivity({
    user: req.user,
    module: 'rooms',
    action: 'DELETE_ROOM',
    entityType: 'room',
    entityId: id,
    details: `Deleted unoccupied Room ${room.room_number}`,
  });
  res.json({ success: true });
});

roomsRouter.post('/:id/maintenance', requirePermission('rooms', 'edit'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const schema = z.object({
    underMaintenance: z.boolean(),
    notes: z.string().optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid maintenance payload' });
    return;
  }

  const db = getDb();
  const room = db.prepare('SELECT id, room_number, capacity FROM rooms WHERE id = ?').get(id) as
    | { id: number; room_number: string; capacity: number }
    | undefined;
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  const { occupied } = db
    .prepare('SELECT COUNT(*) AS occupied FROM room_allocations WHERE room_id = ? AND is_active = 1')
    .get(id) as { occupied: number };

  if (parsed.data.underMaintenance && occupied > 0) {
    res.status(400).json({ error: 'Transfer or vacate assigned students before putting room under maintenance.' });
    return;
  }

  const nextStatus = parsed.data.underMaintenance
    ? 'maintenance'
    : occupied >= room.capacity
      ? 'occupied'
      : 'available';

  db.prepare(
    "UPDATE rooms SET status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(nextStatus, parsed.data.notes.trim(), id);

  logActivity({
    user: req.user,
    module: 'rooms',
    action: parsed.data.underMaintenance ? 'MARK_MAINTENANCE' : 'CLEAR_MAINTENANCE',
    entityType: 'room',
    entityId: id,
    details: `Room ${room.room_number} status set to ${nextStatus}`,
  });

  res.json({ success: true, status: nextStatus });
});

roomsRouter.post('/allocate', requirePermission('rooms', 'edit'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    student_id: z.number().int().positive(),
    room_id: z.number().int().positive(),
    bed_label: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'student_id and room_id are required' });
    return;
  }

  const db = getDb();
  try {
    const result = db.transaction(() => {
      const outcome = allocateStudentToRoomTx(db, {
        studentId: parsed.data.student_id,
        targetRoomId: parsed.data.room_id,
        bedLabel: parsed.data.bed_label,
        allocatedBy: req.user!.id,
      });
      logActivity({
        user: req.user,
        module: 'rooms',
        action: outcome.previousRoomId ? 'TRANSFER_ROOM' : 'ALLOCATE_ROOM',
        entityType: 'room',
        entityId: parsed.data.room_id,
        details: `Assigned student #${parsed.data.student_id} to room #${parsed.data.room_id}`,
      });
      return outcome;
    })();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Allocation failed' });
  }
});

roomsRouter.post('/vacate', requirePermission('rooms', 'edit'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({ student_id: z.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'student_id is required' });
    return;
  }

  const db = getDb();
  const activeAlloc = db
    .prepare('SELECT id, room_id FROM room_allocations WHERE student_id = ? AND is_active = 1')
    .get(parsed.data.student_id) as { id: number; room_id: number } | undefined;

  if (!activeAlloc) {
    res.status(400).json({ error: 'Student has no active room allocation' });
    return;
  }

  db.transaction(() => {
    db.prepare("UPDATE room_allocations SET is_active = 0, vacated_at = datetime('now') WHERE id = ?").run(
      activeAlloc.id,
    );
    syncRoomOccupancyStatus(db, activeAlloc.room_id);
    logActivity({
      user: req.user,
      module: 'rooms',
      action: 'VACATE_BED',
      entityType: 'room',
      entityId: activeAlloc.room_id,
      details: `Vacated bed for student #${parsed.data.student_id} in room #${activeAlloc.room_id}`,
    });
  })();

  res.json({ success: true });
});

