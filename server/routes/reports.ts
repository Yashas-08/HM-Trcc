import { Router } from 'express';
import { getDb } from '../db/database.js';
import { authenticateJWT, requirePermission } from '../middleware/auth.js';

export const reportsRouter = Router();
reportsRouter.use(authenticateJWT);

reportsRouter.get('/', requirePermission('reports', 'view'), (req, res) => {
  const db = getDb();
  const blockId =
    typeof req.query.blockId === 'string' && req.query.blockId !== 'all' ? Number(req.query.blockId) : null;
  const fromDate =
    typeof req.query.fromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fromDate)
      ? req.query.fromDate
      : null;
  const toDate =
    typeof req.query.toDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.toDate)
      ? req.query.toDate
      : null;

  // 1. Student Report
  const studentCounts = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive
       FROM students`,
    )
    .get();

  const blockStudentDistribution = db
    .prepare(
      `SELECT
         b.id AS block_id,
         b.name AS block_name,
         COUNT(ra.id) AS student_count
       FROM blocks b
       LEFT JOIN rooms r ON r.block_id = b.id
       LEFT JOIN room_allocations ra ON ra.room_id = r.id AND ra.is_active = 1
       ${blockId ? 'WHERE b.id = ?' : ''}
       GROUP BY b.id, b.name
       ORDER BY b.name ASC`,
    )
    .all(...(blockId ? [blockId] : []));

  // 2. Room Report
  const blockOccupancy = db
    .prepare(
      `SELECT
         b.id AS block_id,
         b.name AS block_name,
         COUNT(r.id) AS total_rooms,
         COALESCE(SUM(r.capacity), 0) AS total_beds,
         COALESCE(SUM((SELECT COUNT(*) FROM room_allocations ra WHERE ra.room_id = r.id AND ra.is_active = 1)), 0) AS occupied_beds,
         SUM(CASE WHEN r.status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance_rooms
       FROM blocks b
       LEFT JOIN rooms r ON r.block_id = b.id
       ${blockId ? 'WHERE b.id = ?' : ''}
       GROUP BY b.id, b.name
       ORDER BY b.name ASC`,
    )
    .all(...(blockId ? [blockId] : []));

  // 3. Attendance Report
  const attConds: string[] = [];
  const attParams: string[] = [];
  if (fromDate) {
    attConds.push('attendance_date >= ?');
    attParams.push(fromDate);
  }
  if (toDate) {
    attConds.push('attendance_date <= ?');
    attParams.push(toDate);
  }
  const attWhere = attConds.length ? `WHERE ${attConds.join(' AND ')}` : '';
  const attendanceSummary = db
    .prepare(
      `SELECT
         COUNT(*) AS total_records,
         SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count,
         SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
         SUM(CASE WHEN status = 'on_leave' THEN 1 ELSE 0 END) AS on_leave_count
       FROM attendance_records ${attWhere}`,
    )
    .get(...attParams);

  const dailyAttendanceTrend = db
    .prepare(
      `SELECT
         attendance_date AS date,
         SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
         SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent,
         SUM(CASE WHEN status = 'on_leave' THEN 1 ELSE 0 END) AS on_leave
       FROM attendance_records ${attWhere}
       GROUP BY attendance_date
       ORDER BY attendance_date DESC
       LIMIT 14`,
    )
    .all(...attParams);

  // 4. Leave Report
  const leaveSummary = db
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

  const leaveRecords = db
    .prepare(
      `SELECT lr.leave_code, s.full_name AS student_name, COALESCE(r.room_number, '--') AS room_number,
              lr.reason, lr.departure_at, lr.expected_return_at, lr.status
       FROM leave_requests lr
       JOIN students s ON s.id = lr.student_id
       LEFT JOIN rooms r ON r.id = lr.room_id
       ORDER BY lr.id DESC LIMIT 50`,
    )
    .all();

  // 5. Complaint Report
  const complaintByCategory = db
    .prepare(
      `SELECT
         category,
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
         SUM(CASE WHEN status != 'resolved' THEN 1 ELSE 0 END) AS pending
       FROM complaints
       GROUP BY category
       ORDER BY total DESC`,
    )
    .all();

  const complaintMetrics = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
         ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at) - julianday(created_at)) * 24.0 END), 1) AS avg_resolution_hours
       FROM complaints`,
    )
    .get() as { total: number; resolved: number | null; avg_resolution_hours: number | null };

  // 6. Mess Report
  const messConds: string[] = ["booking_status = 'booked'"];
  const messParams: string[] = [];
  if (fromDate) {
    messConds.push('meal_date >= ?');
    messParams.push(fromDate);
  }
  if (toDate) {
    messConds.push('meal_date <= ?');
    messParams.push(toDate);
  }
  const messWhere = `WHERE ${messConds.join(' AND ')}`;
  const messByMeal = db
    .prepare(
      `SELECT
         meal_type,
         COUNT(*) AS total_booked,
         SUM(CASE WHEN verified_status = 'served' THEN 1 ELSE 0 END) AS served,
         SUM(CASE WHEN verified_status != 'served' THEN 1 ELSE 0 END) AS unused
       FROM meal_bookings ${messWhere}
       GROUP BY meal_type`,
    )
    .all(...messParams);

  // 7. Movement Report
  const movementSummary = db
    .prepare(
      `SELECT
         COUNT(*) AS total_exits,
         SUM(CASE WHEN actual_return_time IS NOT NULL THEN 1 ELSE 0 END) AS total_entries,
         SUM(CASE WHEN status = 'outside' THEN 1 ELSE 0 END) AS currently_outside,
         SUM(CASE WHEN status = 'late_return' THEN 1 ELSE 0 END) AS late_returns
       FROM movements`,
    )
    .get();

  const movementLogs = db
    .prepare(
      `SELECT m.id, s.full_name AS student_name, s.student_code, COALESCE(r.room_number, '--') AS room_number,
              m.exit_time, m.expected_return_time, m.actual_return_time, m.status
       FROM movements m
       JOIN students s ON s.id = m.student_id
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.is_active = 1
       LEFT JOIN rooms r ON r.id = ra.room_id
       ORDER BY m.id DESC LIMIT 50`,
    )
    .all();

  res.json({
    students: {
      counts: studentCounts,
      blockDistribution: blockStudentDistribution,
    },
    rooms: {
      blockOccupancy,
    },
    attendance: {
      summary: attendanceSummary,
      trend: dailyAttendanceTrend,
    },
    leaves: {
      summary: leaveSummary,
      records: leaveRecords,
    },
    complaints: {
      byCategory: complaintByCategory,
      metrics: {
        ...complaintMetrics,
        resolutionRatePct:
          complaintMetrics.total > 0
            ? Math.round(((complaintMetrics.resolved || 0) / complaintMetrics.total) * 100)
            : 0,
      },
    },
    mess: {
      byMeal: messByMeal,
    },
    movements: {
      summary: movementSummary,
      logs: movementLogs,
    },
  });
});

