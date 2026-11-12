import type Database from 'better-sqlite3';

/**
 * Recalculates and updates a room's status between 'available' and 'occupied'
 * unless it is currently marked 'maintenance'.
 */
export function syncRoomOccupancyStatus(db: Database.Database, roomId: number): void {
  const room = db
    .prepare('SELECT id, capacity, status FROM rooms WHERE id = ?')
    .get(roomId) as { id: number; capacity: number; status: string } | undefined;

  if (!room || room.status === 'maintenance') return;

  const { count } = db
    .prepare('SELECT COUNT(*) AS count FROM room_allocations WHERE room_id = ? AND is_active = 1')
    .get(roomId) as { count: number };

  const nextStatus = count >= room.capacity ? 'occupied' : 'available';
  if (nextStatus !== room.status) {
    db.prepare("UPDATE rooms SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      nextStatus,
      roomId,
    );
  }
}

/**
 * Allocates or transfers a student into targetRoomId inside the caller's transaction.
 * Enforces capacity limits, maintenance lock, and single active room per student.
 */
export function allocateStudentToRoomTx(
  db: Database.Database,
  params: {
    studentId: number;
    targetRoomId: number;
    bedLabel?: string;
    allocatedBy: number;
  },
): { previousRoomId: number | null } {
  const student = db
    .prepare('SELECT id, status, full_name FROM students WHERE id = ?')
    .get(params.studentId) as { id: number; status: string; full_name: string } | undefined;

  if (!student) {
    throw new Error('Student not found');
  }
  if (student.status !== 'active') {
    throw new Error('Cannot allocate a room to an inactive student');
  }

  const targetRoom = db
    .prepare('SELECT id, room_number, capacity, status FROM rooms WHERE id = ?')
    .get(params.targetRoomId) as
    | { id: number; room_number: string; capacity: number; status: string }
    | undefined;

  if (!targetRoom) {
    throw new Error('Target room not found');
  }
  if (targetRoom.status === 'maintenance') {
    throw new Error(`Room ${targetRoom.room_number} is under maintenance and cannot receive allocations`);
  }

  const existingAlloc = db
    .prepare('SELECT id, room_id FROM room_allocations WHERE student_id = ? AND is_active = 1')
    .get(params.studentId) as { id: number; room_id: number } | undefined;

  if (existingAlloc && existingAlloc.room_id === params.targetRoomId) {
    throw new Error(`Student is already allocated to Room ${targetRoom.room_number}`);
  }

  const { occupied } = db
    .prepare('SELECT COUNT(*) AS occupied FROM room_allocations WHERE room_id = ? AND is_active = 1')
    .get(params.targetRoomId) as { occupied: number };

  if (occupied >= targetRoom.capacity) {
    throw new Error(`Room ${targetRoom.room_number} is already at full capacity (${targetRoom.capacity})`);
  }

  let previousRoomId: number | null = null;
  if (existingAlloc) {
    previousRoomId = existingAlloc.room_id;
    db.prepare("UPDATE room_allocations SET is_active = 0, vacated_at = datetime('now') WHERE id = ?").run(
      existingAlloc.id,
    );
    syncRoomOccupancyStatus(db, previousRoomId);
  }

  const bedLabel = params.bedLabel?.trim() || `Bed ${occupied + 1}`;
  db.prepare(
    `INSERT INTO room_allocations (student_id, room_id, bed_label, is_active, allocated_by)
     VALUES (?, ?, ?, 1, ?)`,
  ).run(params.studentId, params.targetRoomId, bedLabel, params.allocatedBy);

  syncRoomOccupancyStatus(db, params.targetRoomId);
  return { previousRoomId };
}

