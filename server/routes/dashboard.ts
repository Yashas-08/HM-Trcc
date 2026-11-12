import { Router } from 'express';
import { getDb } from '../db/database.js';
import { authenticateJWT, type AuthenticatedRequest } from '../middleware/auth.js';
import { hasModulePermission } from '../utils/permissions.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticateJWT);

dashboardRouter.get('/', (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const attendanceDate =
    typeof req.query.attendanceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.attendanceDate)
      ? req.query.attendanceDate
      : today;

  const studentCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_students,
         COUNT(*) AS total_students
       FROM students`,
    )
    .get() as { active_students: number | null; total_students: number };

  const roomStats = db
    .prepare(
      `SELECT
         COUNT(*) AS total_rooms,
         COALESCE(SUM(capacity), 0) AS total_beds,
         COALESCE(SUM(CASE WHEN status != 'maintenance' THEN capacity ELSE 0 END), 0) AS operational_beds,
         SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance_rooms
       FROM rooms`,
    )
    .get() as {
      total_rooms: number;
      total_beds: number;
      operational_beds: number;
      maintenance_rooms: number | null;
    };

  const occupiedRow = db
    .prepare('SELECT COUNT(*) AS occupied_beds FROM room_allocations WHERE is_active = 1')
    .get() as { occupied_beds: number };

  const occupiedRoomsRow = db
    .prepare('SELECT COUNT(DISTINCT room_id) AS occupied_rooms FROM room_allocations WHERE is_active = 1')
    .get() as { occupied_rooms: number };

  const complaintStats = db
    .prepare(
      `SELECT
         COUNT(*) AS total_complaints,
         SUM(CASE WHEN status IN ('open', 'assigned', 'in_progress', 'reopened') THEN 1 ELSE 0 END) AS open_complaints
       FROM complaints`,
    )
    .get() as { total_complaints: number; open_complaints: number | null };

  const leaveStats = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_leaves
       FROM leave_requests`,
    )
    .get() as { pending_leaves: number | null };

  const messStats = db
    .prepare(
      `SELECT
         COUNT(*) AS total_bookings,
         SUM(CASE WHEN verified_status = 'served' THEN 1 ELSE 0 END) AS served_count,
         SUM(CASE WHEN verified_status != 'served' THEN 1 ELSE 0 END) AS remaining_count
       FROM meal_bookings
       WHERE meal_date = ? AND booking_status = 'booked'`,
    )
    .get(today) as {
      total_bookings: number;
      served_count: number | null;
      remaining_count: number | null;
    };

  // Trailing 8 months Student Admissions vs Departures
  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
  const admissionsVsDepartures: Array<{ monthKey: string; label: string; admissions: number; departures: number }> = [];
  const now = new Date();
  for (let offset = 7; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const monthKey = `${yyyy}-${mm}`;
    const adm = db
      .prepare("SELECT COUNT(*) AS c FROM students WHERE substr(admission_date, 1, 7) = ?")
      .get(monthKey) as { c: number };
    const dep = db
      .prepare("SELECT COUNT(*) AS c FROM students WHERE departure_date IS NOT NULL AND substr(departure_date, 1, 7) = ?")
      .get(monthKey) as { c: number };
    admissionsVsDepartures.push({
      monthKey,
      label: monthFormatter.format(d),
      admissions: adm.c,
      departures: dep.c,
    });
  }

  // Attendance table rows for requested date
  const attendanceRows = db
    .prepare(
      `SELECT
         s.id AS student_id,
         s.student_code,
         s.full_name,
         COALESCE(r.room_number, '--') AS room_number,
         COALESCE(NULLIF(a.check_in_time, ''), '--') AS check_in_time,
         COALESCE(NULLIF(a.check_out_time, ''), '--') AS check_out_time,
         COALESCE(a.status, 'absent') AS status
       FROM students s
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
       LEFT JOIN rooms r ON r.id = ra.room_id
       LEFT JOIN attendance_records a ON a.student_id = s.id AND a.attendance_date = ?
       WHERE s.status = 'active'
       ORDER BY
         CASE WHEN a.status IS NULL THEN 1 ELSE 0 END,
         s.full_name ASC
       LIMIT 6`,
    )
    .all(attendanceDate);

  const occupiedBeds = occupiedRow.occupied_beds;
  const availableBeds = Math.max(0, roomStats.operational_beds - occupiedBeds);
  const occDenom = occupiedBeds + availableBeds || 1;
  const occupiedPct = Math.round((occupiedBeds / occDenom) * 100);
  const availablePct = 100 - occupiedPct;

  const messTotal = messStats.total_bookings;
  const messServed = messStats.served_count || 0;
  const messRemaining = messStats.remaining_count || 0;
  const servedPct = messTotal > 0 ? Math.round((messServed / messTotal) * 100) : 0;
  const remainingPct = messTotal > 0 ? 100 - servedPct : 0;

  const recentActivities = db
    .prepare(
      `SELECT id, user_name, user_role, module, action, details, created_at
       FROM activity_logs
       ORDER BY id DESC
       LIMIT 6`,
    )
    .all();

  res.json({
    stats: {
      availableBeds,
      totalBeds: roomStats.total_beds,
      operationalBeds: roomStats.operational_beds,
      occupiedBeds,
      totalRooms: roomStats.total_rooms,
      occupiedRooms: occupiedRoomsRow.occupied_rooms,
      maintenanceRooms: roomStats.maintenance_rooms || 0,
      openComplaints: complaintStats.open_complaints || 0,
      totalComplaints: complaintStats.total_complaints,
      activeStudents: studentCounts.active_students || 0,
      totalStudents: studentCounts.total_students,
      pendingLeaves: leaveStats.pending_leaves || 0,
      todayMessBookings: messTotal,
      todayMessServed: messServed,
    },
    admissionsVsDepartures,
    roomOccupancy: {
      occupiedBeds,
      availableBeds,
      occupiedPct,
      availablePct,
    },
    messOverview: {
      totalBookings: messTotal,
      servedCount: messServed,
      remainingCount: messRemaining,
      servedPct,
      remainingPct,
    },
    attendanceDate,
    attendanceRows,
    recentActivities,
  });
});

dashboardRouter.get('/search', (req: AuthenticatedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) {
    res.json({ results: [] });
    return;
  }

  const db = getDb();
  const like = `%${q}%`;
  const results: Array<{ category: string; id: number; title: string; subtitle: string; path: string }> = [];

  if (hasModulePermission(req.user!, 'students', 'view')) {
    const students = db
      .prepare(
        `SELECT s.id, s.full_name, s.student_code, COALESCE(r.room_number, 'Unassigned') AS room_number
         FROM students s
         LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
         LEFT JOIN rooms r ON r.id = ra.room_id
         WHERE s.full_name LIKE ? OR s.student_code LIKE ? OR s.phone LIKE ?
         LIMIT 5`,
      )
      .all(like, like, like) as Array<{ id: number; full_name: string; student_code: string; room_number: string }>;
    for (const s of students) {
      results.push({
        category: 'Student',
        id: s.id,
        title: s.full_name,
        subtitle: `${s.student_code} · Room ${s.room_number}`,
        path: `/students?highlight=${s.id}`,
      });
    }
  }

  if (hasModulePermission(req.user!, 'rooms', 'view')) {
    const rooms = db
      .prepare(
        `SELECT r.id, r.room_number, b.name AS block_name, r.status
         FROM rooms r JOIN blocks b ON b.id = r.block_id
         WHERE r.room_number LIKE ? OR b.name LIKE ?
         LIMIT 4`,
      )
      .all(like, like) as Array<{ id: number; room_number: string; block_name: string; status: string }>;
    for (const r of rooms) {
      results.push({
        category: 'Room',
        id: r.id,
        title: `Room ${r.room_number}`,
        subtitle: `${r.block_name} · ${r.status}`,
        path: `/rooms?room=${r.id}`,
      });
    }
  }

  if (hasModulePermission(req.user!, 'complaints', 'view')) {
    const complaints = db
      .prepare(
        `SELECT id, complaint_code, title, status
         FROM complaints
         WHERE complaint_code LIKE ? OR title LIKE ? OR category LIKE ?
         LIMIT 4`,
      )
      .all(like, like, like) as Array<{ id: number; complaint_code: string; title: string; status: string }>;
    for (const c of complaints) {
      results.push({
        category: 'Complaint',
        id: c.id,
        title: `${c.complaint_code}: ${c.title}`,
        subtitle: `Status: ${c.status}`,
        path: `/complaints?id=${c.id}`,
      });
    }
  }

  if (hasModulePermission(req.user!, 'notices', 'view')) {
    const notices = db
      .prepare('SELECT id, title, category, status FROM notices WHERE title LIKE ? LIMIT 3')
      .all(like) as Array<{ id: number; title: string; category: string; status: string }>;
    for (const n of notices) {
      results.push({
        category: 'Notice',
        id: n.id,
        title: n.title,
        subtitle: `${n.category} · ${n.status}`,
        path: `/notices?id=${n.id}`,
      });
    }
  }

  if (hasModulePermission(req.user!, 'staff', 'view')) {
    const staff = db
      .prepare('SELECT id, full_name, staff_code, designation FROM users WHERE full_name LIKE ? OR staff_code LIKE ? LIMIT 3')
      .all(like, like) as Array<{ id: number; full_name: string; staff_code: string; designation: string }>;
    for (const st of staff) {
      results.push({
        category: 'Staff',
        id: st.id,
        title: st.full_name,
        subtitle: `${st.staff_code} · ${st.designation}`,
        path: `/staff?id=${st.id}`,
      });
    }
  }

  res.json({ results });
});

dashboardRouter.get('/notifications', (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 20')
    .all() as Array<{
    id: number;
    type: string;
    title: string;
    message: string;
    link_path: string;
    target_roles_json: string;
    is_read: number;
    created_at: string;
  }>;

  const filtered = rows.filter((n) => {
    if (req.user!.role === 'super_admin') return true;
    try {
      const roles = JSON.parse(n.target_roles_json) as string[];
      return roles.includes(req.user!.role);
    } catch {
      return false;
    }
  });

  const unreadCount = filtered.filter((n) => n.is_read === 0).length;
  res.json({ notifications: filtered, unreadCount });
});

dashboardRouter.patch('/notifications/:id/read', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

dashboardRouter.patch('/notifications/read-all', (_req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run();
  res.json({ success: true });
});

