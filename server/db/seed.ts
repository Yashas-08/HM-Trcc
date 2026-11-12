import bcrypt from 'bcryptjs';
import { getDb } from './database.js';
import type Database from 'better-sqlite3';

function isoDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

function monthDate(monthsAgo: number, day = 10): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(Math.min(day, 28));
  return d.toISOString().slice(0, 10);
}

export function seedDatabase(targetDb?: Database.Database): void {
  const db = targetDb || getDb();

  const existingUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (existingUsers.count > 0) {
    return;
  }

  const runSeed = db.transaction(() => {
    // 1. Hostel Settings
    db.prepare(
      `INSERT INTO hostel_settings (
        id, hostel_name, curfew_time, mess_booking_open_time, mess_booking_close_time,
        breakfast_window, lunch_window, dinner_window, attendance_cutoff_time,
        late_return_grace_minutes, allow_same_day_booking
      ) VALUES (1, 'HM Trcc Hostel', '21:30', '06:00', '19:00', '07:30 - 09:30', '12:30 - 14:30', '19:30 - 21:30', '22:00', 15, 0)`,
    ).run();

    // 2. Blocks & Floors
    const insertBlock = db.prepare(
      'INSERT INTO blocks (name, code, description) VALUES (?, ?, ?)',
    );
    const blockAId = Number(insertBlock.run('Block A', 'BLK-A', 'North Wing Undergraduate Block').lastInsertRowid);
    const blockBId = Number(insertBlock.run('Block B', 'BLK-B', 'East Wing Senior Block').lastInsertRowid);

    const insertFloor = db.prepare(
      'INSERT INTO floors (block_id, floor_number, label) VALUES (?, ?, ?)',
    );
    const aF1 = Number(insertFloor.run(blockAId, 1, 'Floor 1').lastInsertRowid);
    const aF2 = Number(insertFloor.run(blockAId, 2, 'Floor 2').lastInsertRowid);
    const bF1 = Number(insertFloor.run(blockBId, 1, 'Floor 1').lastInsertRowid);
    const bF2 = Number(insertFloor.run(blockBId, 2, 'Floor 2').lastInsertRowid);

    // 3. Rooms (10 rooms, total capacity 30 beds)
    const insertRoom = db.prepare(
      `INSERT INTO rooms (block_id, floor_id, room_number, capacity, facilities_json, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const rooms: Record<string, number> = {};
    const roomDefs = [
      { key: '101', block: blockAId, floor: aF1, num: '101', cap: 3, fac: ['Wi-Fi', 'Study Desk', 'Ceiling Fan', 'Wardrobe'], status: 'occupied', notes: '' },
      { key: '102', block: blockAId, floor: aF1, num: '102', cap: 3, fac: ['Wi-Fi', 'Study Desk', 'Ceiling Fan', 'Attached Bath'], status: 'occupied', notes: '' },
      { key: '103', block: blockAId, floor: aF1, num: '103', cap: 3, fac: ['Wi-Fi', 'Study Desk', 'Ceiling Fan'], status: 'available', notes: '' },
      { key: '201', block: blockAId, floor: aF2, num: '201', cap: 3, fac: ['Wi-Fi', 'AC', 'Study Desk', 'Wardrobe'], status: 'available', notes: '' },
      { key: '202', block: blockAId, floor: aF2, num: '202', cap: 4, fac: ['Wi-Fi', 'Ceiling Fan', 'Study Desk'], status: 'available', notes: '' },
      { key: '203', block: blockAId, floor: aF2, num: '203', cap: 2, fac: ['Wi-Fi', 'AC', 'Attached Bath'], status: 'available', notes: '' },
      { key: '301', block: blockBId, floor: bF1, num: '301', cap: 3, fac: ['Wi-Fi', 'Study Desk', 'Wardrobe'], status: 'occupied', notes: '' },
      { key: '302', block: blockBId, floor: bF1, num: '302', cap: 3, fac: ['Wi-Fi', 'Study Desk', 'Balcony'], status: 'available', notes: '' },
      { key: '401', block: blockBId, floor: bF2, num: '401', cap: 4, fac: ['Wi-Fi', 'Study Desk', 'Ceiling Fan'], status: 'available', notes: '' },
      { key: '402', block: blockBId, floor: bF2, num: '402', cap: 2, fac: ['Wi-Fi', 'AC'], status: 'maintenance', notes: 'Scheduled plumbing pipe replacement' },
    ];
    for (const r of roomDefs) {
      rooms[r.key] = Number(
        insertRoom.run(r.block, r.floor, r.num, r.cap, JSON.stringify(r.fac), r.status, r.notes).lastInsertRowid,
      );
    }

    // 4. Staff Users (5 Roles + extra staff)
    const insertUser = db.prepare(
      `INSERT INTO users (staff_code, full_name, email, password_hash, phone, designation, role, assigned_block_id, responsibilities, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const adminPass = bcrypt.hashSync('Admin@123', 10);
    const wardenPass = bcrypt.hashSync('Warden@123', 10);
    const messPass = bcrypt.hashSync('Mess@123', 10);
    const secPass = bcrypt.hashSync('Security@123', 10);
    const maintPass = bcrypt.hashSync('Maint@123', 10);

    const adminId = Number(insertUser.run('STF-001', 'Arjun Mehta', 'admin@hmtrcc.local', adminPass, '+91 98201 11001', 'Chief Hostel Administrator', 'super_admin', null, 'Overall hostel governance, staff access control, and policy configuration', 'active').lastInsertRowid);
    const wardenId = Number(insertUser.run('STF-002', 'Priya Nair', 'warden@hmtrcc.local', wardenPass, '+91 98201 11002', 'Senior Block Warden', 'warden', blockAId, 'Student admissions, room allocations, leave approvals, and Block A discipline', 'active').lastInsertRowid);
    const messStaffId = Number(insertUser.run('STF-003', 'Ramesh Kulkarni', 'mess@hmtrcc.local', messPass, '+91 98201 11003', 'Mess Operations Supervisor', 'mess_staff', null, 'Daily meal menu publishing, booking monitoring, and QR meal verification', 'active').lastInsertRowid);
    const secStaffId = Number(insertUser.run('STF-004', 'Vikram Singh', 'security@hmtrcc.local', secPass, '+91 98201 11004', 'Chief Gate Security Officer', 'security_staff', null, 'Student entry/exit verification, gate register, and late return tracking', 'active').lastInsertRowid);
    const maintPlumbId = Number(insertUser.run('STF-005', 'Suresh Patel', 'maintenance@hmtrcc.local', maintPass, '+91 98201 11005', 'Maintenance Technician (Plumbing & Civil)', 'maintenance_staff', blockBId, 'Plumbing, carpentry, and room repair complaint resolution', 'active').lastInsertRowid);
    const maintElecId = Number(insertUser.run('STF-006', 'Deepa Verma', 'electric@hmtrcc.local', maintPass, '+91 98201 11006', 'Electrical & Network Technician', 'maintenance_staff', blockAId, 'Electrical fittings, Wi-Fi access points, and appliance servicing', 'active').lastInsertRowid);
    insertUser.run('STF-007', 'Kiran Joshi', 'kiran.former@hmtrcc.local', secPass, '+91 98201 11007', 'Night Gate Guard', 'security_staff', blockBId, 'Former night shift gate log', 'inactive');

    // 5. Students (18 active + 5 inactive historical for rich monthly chart)
    const insertStudent = db.prepare(
      `INSERT INTO students (
        student_code, full_name, dob, gender, phone, email, guardian_name, guardian_phone, guardian_relation,
        emergency_contact_name, emergency_contact_phone, college_name, course, year_of_study,
        admission_date, departure_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAlloc = db.prepare(
      `INSERT INTO room_allocations (student_id, room_id, bed_label, allocated_at, is_active, allocated_by)
       VALUES (?, ?, ?, ?, 1, ?)`,
    );

    const activeStudentSeeds = [
      { code: 'STU-2026-001', name: 'Aarav Sharma', dob: '2005-03-14', gender: 'Male', phone: '9876500101', email: 'aarav.sharma@student.edu', gName: 'Rajesh Sharma', gPhone: '9876590101', college: 'National Institute of Tech', course: 'B.Tech CSE', year: '2nd Year', adm: monthDate(7, 5), room: '101', bed: 'Bed A' },
      { code: 'STU-2026-002', name: 'Ananya Deshmukh', dob: '2005-07-22', gender: 'Female', phone: '9876500102', email: 'ananya.d@student.edu', gName: 'Sunita Deshmukh', gPhone: '9876590102', college: 'National Institute of Tech', course: 'B.Tech ECE', year: '2nd Year', adm: monthDate(7, 8), room: '101', bed: 'Bed B' },
      { code: 'STU-2026-003', name: 'Rohan Malhotra', dob: '2004-11-02', gender: 'Male', phone: '9876500103', email: 'rohan.m@student.edu', gName: 'Vivek Malhotra', gPhone: '9876590103', college: 'City Engineering College', course: 'B.Tech ME', year: '3rd Year', adm: monthDate(6, 12), room: '101', bed: 'Bed C' },
      { code: 'STU-2026-004', name: 'Ishita Banerjee', dob: '2005-01-19', gender: 'Female', phone: '9876500104', email: 'ishita.b@student.edu', gName: 'Subhash Banerjee', gPhone: '9876590104', college: 'National Institute of Tech', course: 'B.Sc Data Science', year: '2nd Year', adm: monthDate(6, 15), room: '102', bed: 'Bed A' },
      { code: 'STU-2026-005', name: 'Kabir Khanna', dob: '2004-08-30', gender: 'Male', phone: '9876500105', email: 'kabir.k@student.edu', gName: 'Meera Khanna', gPhone: '9876590105', college: 'City Engineering College', course: 'B.Tech Civil', year: '3rd Year', adm: monthDate(5, 4), room: '102', bed: 'Bed B' },
      { code: 'STU-2026-006', name: 'Meenakshi Iyer', dob: '2005-05-11', gender: 'Female', phone: '9876500106', email: 'meenakshi.i@student.edu', gName: 'Venkat Iyer', gPhone: '9876590106', college: 'National Institute of Tech', course: 'B.Tech IT', year: '2nd Year', adm: monthDate(5, 19), room: '102', bed: 'Bed C' },
      { code: 'STU-2026-007', name: 'Siddharth Nair', dob: '2006-02-09', gender: 'Male', phone: '9876500107', email: 'siddharth.n@student.edu', gName: 'Gopal Nair', gPhone: '9876590107', college: 'National Institute of Tech', course: 'B.Tech CSE', year: '1st Year', adm: monthDate(4, 6), room: '103', bed: 'Bed A' },
      { code: 'STU-2026-008', name: 'Neha Choudhary', dob: '2005-09-25', gender: 'Female', phone: '9876500108', email: 'neha.c@student.edu', gName: 'Harish Choudhary', gPhone: '9876590108', college: 'School of Design', course: 'B.Des UX', year: '2nd Year', adm: monthDate(4, 14), room: '103', bed: 'Bed B' },
      { code: 'STU-2026-009', name: 'Devansh Joshi', dob: '2004-12-17', gender: 'Male', phone: '9876500109', email: 'devansh.j@student.edu', gName: 'Alka Joshi', gPhone: '9876590109', college: 'City Engineering College', course: 'B.Tech EEE', year: '3rd Year', adm: monthDate(3, 3), room: '201', bed: 'Bed A' },
      { code: 'STU-2026-010', name: 'Pooja Krishnan', dob: '2005-06-08', gender: 'Female', phone: '9876500110', email: 'pooja.k@student.edu', gName: 'Raghav Krishnan', gPhone: '9876590110', college: 'National Institute of Tech', course: 'M.Sc CS', year: '1st Year', adm: monthDate(3, 18), room: '201', bed: 'Bed B' },
      { code: 'STU-2026-011', name: 'Yashvardhan Rao', dob: '2003-10-04', gender: 'Male', phone: '9876500111', email: 'yash.rao@student.edu', gName: 'Srinivas Rao', gPhone: '9876590111', college: 'National Institute of Tech', course: 'M.Tech AI', year: '1st Year', adm: monthDate(2, 7), room: '202', bed: 'Bed A' },
      { code: 'STU-2026-012', name: 'Ritika Sen', dob: '2004-04-28', gender: 'Female', phone: '9876500112', email: 'ritika.sen@student.edu', gName: 'Anirban Sen', gPhone: '9876590112', college: 'School of Design', course: 'B.Arch', year: '3rd Year', adm: monthDate(2, 16), room: '202', bed: 'Bed B' },
      { code: 'STU-2026-013', name: 'Aditya Kulkarni', dob: '2005-11-15', gender: 'Male', phone: '9876500113', email: 'aditya.k@student.edu', gName: 'Prakash Kulkarni', gPhone: '9876590113', college: 'City Engineering College', course: 'B.Tech CSE', year: '2nd Year', adm: monthDate(1, 5), room: '301', bed: 'Bed A' },
      { code: 'STU-2026-014', name: 'Shruti Agarwal', dob: '2004-07-07', gender: 'Female', phone: '9876500114', email: 'shruti.a@student.edu', gName: 'Nitin Agarwal', gPhone: '9876590114', college: 'National Institute of Tech', course: 'B.Tech Biotech', year: '3rd Year', adm: monthDate(1, 14), room: '301', bed: 'Bed B' },
      { code: 'STU-2026-015', name: 'Pranav Menon', dob: '2003-09-12', gender: 'Male', phone: '9876500115', email: 'pranav.m@student.edu', gName: 'Lakshmi Menon', gPhone: '9876590115', college: 'National Institute of Tech', course: 'M.Tech Robotics', year: '2nd Year', adm: monthDate(1, 22), room: '301', bed: 'Bed C' },
      { code: 'STU-2026-016', name: 'Tanya Bhatia', dob: '2005-02-27', gender: 'Female', phone: '9876500116', email: 'tanya.b@student.edu', gName: 'Sanjay Bhatia', gPhone: '9876590116', college: 'School of Design', course: 'B.Des Product', year: '2nd Year', adm: monthDate(0, 3), room: '302', bed: 'Bed A' },
      { code: 'STU-2026-017', name: 'Nikhil Varma', dob: '2004-05-19', gender: 'Male', phone: '9876500117', email: 'nikhil.v@student.edu', gName: 'Ramesh Varma', gPhone: '9876590117', college: 'City Engineering College', course: 'B.Tech IT', year: '3rd Year', adm: monthDate(0, 6), room: '401', bed: 'Bed A' },
      { code: 'STU-2026-018', name: 'Diya Kapoor', dob: '2005-08-03', gender: 'Female', phone: '9876500118', email: 'diya.k@student.edu', gName: 'Anil Kapoor', gPhone: '9876590118', college: 'National Institute of Tech', course: 'B.Tech CSE', year: '2nd Year', adm: monthDate(0, 9), room: '401', bed: 'Bed B' },
    ];

    const studentIds: number[] = [];
    for (const s of activeStudentSeeds) {
      const id = Number(
        insertStudent.run(
          s.code, s.name, s.dob, s.gender, s.phone, s.email,
          s.gName, s.gPhone, 'Parent', s.gName, s.gPhone,
          s.college, s.course, s.year, s.adm, null, 'active',
        ).lastInsertRowid,
      );
      studentIds.push(id);
      insertAlloc.run(id, rooms[s.room], s.bed, s.adm, wardenId);
    }

    // Historical departed students for Admissions vs Departures bar chart
    const departedSeeds = [
      { code: 'STU-2025-091', name: 'Karan Gill', phone: '9876500901', email: 'karan.g@student.edu', adm: monthDate(7, 2), dep: monthDate(5, 25) },
      { code: 'STU-2025-092', name: 'Sneha Paul', phone: '9876500902', email: 'sneha.p@student.edu', adm: monthDate(6, 4), dep: monthDate(4, 21) },
      { code: 'STU-2025-093', name: 'Harsh Tiwari', phone: '9876500903', email: 'harsh.t@student.edu', adm: monthDate(5, 9), dep: monthDate(2, 18) },
      { code: 'STU-2025-094', name: 'Nandini Roy', phone: '9876500904', email: 'nandini.r@student.edu', adm: monthDate(4, 11), dep: monthDate(1, 27) },
      { code: 'STU-2025-095', name: 'Varun Saxena', phone: '9876500905', email: 'varun.s@student.edu', adm: monthDate(3, 8), dep: monthDate(0, 4) },
    ];
    for (const d of departedSeeds) {
      insertStudent.run(
        d.code, d.name, '2003-06-15', 'Male', d.phone, d.email,
        'Guardian', '9876599000', 'Parent', 'Guardian', '9876599000',
        'National Institute of Tech', 'B.Tech', '4th Year', d.adm, d.dep, 'inactive',
      );
    }

    // 6. Leave Requests
    const today = isoDateOffset(0);
    const yesterday = isoDateOffset(-1);
    const tomorrow = isoDateOffset(1);

    const insertLeave = db.prepare(
      `INSERT INTO leave_requests (
        leave_code, student_id, room_id, reason, destination, departure_at, expected_return_at,
        actual_departure_at, actual_return_at, guardian_contact_verified, status, rejection_reason, reviewed_by, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const approvedLeaveId = Number(
      insertLeave.run(
        'LV-2026-101', studentIds[2], rooms['101'], 'Family wedding ceremony in Pune', 'Pune, Maharashtra',
        `${yesterday}T14:00`, `${tomorrow}T20:00`, `${yesterday}T14:20`, null,
        1, 'approved', '', wardenId, `${isoDateOffset(-2)}T11:15`,
      ).lastInsertRowid,
    );
    insertLeave.run(
      'LV-2026-102', studentIds[4], rooms['102'], 'Inter-college robotics hackathon', 'Bengaluru',
      `${today}T16:00`, `${isoDateOffset(3)}T18:00`, null, null,
      1, 'pending', '', null, null,
    );
    insertLeave.run(
      'LV-2026-103', studentIds[9], rooms['201'], 'Medical dental checkup at hometown', 'Kochi',
      `${tomorrow}T09:00`, `${isoDateOffset(2)}T21:00`, null, null,
      0, 'pending', '', null, null,
    );
    insertLeave.run(
      'LV-2026-104', studentIds[6], rooms['103'], 'Weekend trip with friends', 'Lonavala',
      `${isoDateOffset(-4)}T10:00`, `${isoDateOffset(-2)}T21:00`, null, null,
      0, 'rejected', 'Guardian confirmation not provided for overnight recreational trip.', wardenId, `${isoDateOffset(-5)}T17:40`,
    );
    insertLeave.run(
      'LV-2026-105', studentIds[12], rooms['301'], 'Home visit for passport renewal', 'Nagpur',
      `${isoDateOffset(-6)}T08:00`, `${isoDateOffset(-3)}T20:00`, `${isoDateOffset(-6)}T08:15`, `${isoDateOffset(-3)}T19:30`,
      1, 'completed', '', wardenId, `${isoDateOffset(-7)}T10:00`,
    );

    // 7. Complaints
    const insertComplaint = db.prepare(
      `INSERT INTO complaints (
        complaint_code, student_id, room_id, category, title, description, priority, status, assigned_staff_id, resolution_notes, remarks_json, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertComplaint.run(
      'CMP-1001', studentIds[0], rooms['101'], 'Wi-Fi', 'Weak Wi-Fi signal in Room 101',
      'Router on Floor 1 drops packets intermittently after 8 PM.', 'high', 'in_progress', maintElecId,
      '', JSON.stringify([{ author: 'Priya Nair', text: 'Assigned to electrical/network tech.', at: `${yesterday}T10:00` }, { author: 'Deepa Verma', text: 'Replaced corridor patch cable; monitoring signal.', at: `${today}T09:30` }]), null,
    );
    insertComplaint.run(
      'CMP-1002', studentIds[14], rooms['301'], 'Plumbing', 'Bathroom tap leaking continuously',
      'Washbasin cold water tap washer worn out, wasting water.', 'medium', 'assigned', maintPlumbId,
      '', JSON.stringify([{ author: 'Priya Nair', text: 'Assigned to Suresh Patel.', at: `${today}T08:45` }]), null,
    );
    insertComplaint.run(
      'CMP-1003', studentIds[3], rooms['102'], 'Electrical', 'Study desk tube light flickering',
      'Overhead LED batten near bed A flickers when switched on.', 'low', 'open', null,
      '', JSON.stringify([]), null,
    );
    insertComplaint.run(
      'CMP-1004', studentIds[10], rooms['202'], 'Cleaning', 'Corridor near Room 202 needs mopping',
      'Dust accumulation near stairwell landing.', 'low', 'resolved', maintPlumbId,
      'Housekeeping team cleaned and sanitized corridor.', JSON.stringify([{ author: 'Suresh Patel', text: 'Completed corridor cleaning.', at: `${yesterday}T16:20` }]), `${yesterday}T16:20`,
    );
    insertComplaint.run(
      'CMP-1005', studentIds[16], rooms['401'], 'Room maintenance', 'Window latch broken in Room 401',
      'Right side sliding window lock does not latch properly.', 'urgent', 'reopened', maintPlumbId,
      'Temporary screw tightened earlier, needs full latch replacement.', JSON.stringify([{ author: 'Warden', text: 'Reopened because latch came loose again.', at: `${today}T08:15` }]), null,
    );

    // 8. Mess Menus (Yesterday, Today, Tomorrow)
    const insertMenu = db.prepare(
      'INSERT INTO mess_menus (menu_date, meal_type, items_text, is_published, published_by) VALUES (?, ?, ?, ?, ?)',
    );
    const menus = [
      [yesterday, 'breakfast', 'Poha, Boiled Eggs, Banana, Masala Chai', 1],
      [yesterday, 'lunch', 'Jeera Rice, Dal Tadka, Aloo Gobi, Chapati, Curd', 1],
      [yesterday, 'dinner', 'Paneer Butter Masala, Veg Pulao, Roti, Gulab Jamun', 1],
      [today, 'breakfast', 'Idli Sambar, Coconut Chutney, Sprouts, Coffee/Tea', 1],
      [today, 'lunch', 'Steamed Rice, Rajma Masala, Bhindi Fry, Roti, Salad', 1],
      [today, 'dinner', 'Chole Bhature / Roti, Pulao, Boondi Raita, Ice Cream', 1],
      [tomorrow, 'breakfast', 'Aloo Paratha, Curd, Pickle, Seasonal Fruit, Tea', 1],
      [tomorrow, 'lunch', 'Lemon Rice, Dal Fry, Mix Veg Curry, Chapati, Buttermilk', 1],
      [tomorrow, 'dinner', 'Veg Biryani, Mirchi Ka Salan, Paneer Tikka, Sweet', 0],
    ] as const;
    for (const [date, meal, items, pub] of menus) {
      insertMenu.run(date, meal, items, pub, messStaffId);
    }

    // 9. Meal Bookings & QR Scans
    const insertBooking = db.prepare(
      `INSERT INTO meal_bookings (booking_code, student_id, meal_date, meal_type, qr_token, booking_status, verified_status, verified_at, verified_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertScan = db.prepare(
      `INSERT INTO meal_scans (qr_token_raw, booking_id, student_id, meal_type, scan_result, message, scanned_by, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    // Today's breakfast (mostly served), lunch (mixed served + pending), dinner (pending)
    for (let i = 0; i < 12; i++) {
      const sId = studentIds[i];
      const servedBreakfast = i < 9;
      const bId = Number(
        insertBooking.run(
          `MB-${today.replace(/-/g, '')}-B-${i + 1}`,
          sId,
          today,
          'breakfast',
          `HMTRCC-MEAL-${today}-B-${sId}`,
          'booked',
          servedBreakfast ? 'served' : 'pending',
          servedBreakfast ? `${today}T08:${10 + i}` : null,
          servedBreakfast ? messStaffId : null,
        ).lastInsertRowid,
      );
      if (servedBreakfast && i < 4) {
        insertScan.run(`HMTRCC-MEAL-${today}-B-${sId}`, bId, sId, 'breakfast', 'success', 'Breakfast verified and marked served.', messStaffId, `${today}T08:${10 + i}`);
      }

      const servedLunch = i < 5;
      insertBooking.run(
        `MB-${today.replace(/-/g, '')}-L-${i + 1}`,
        sId,
        today,
        'lunch',
        `HMTRCC-MEAL-${today}-L-${sId}`,
        'booked',
        servedLunch ? 'served' : 'pending',
        servedLunch ? `${today}T13:${10 + i}` : null,
        servedLunch ? messStaffId : null,
      );

      insertBooking.run(
        `MB-${today.replace(/-/g, '')}-D-${i + 1}`,
        sId,
        today,
        'dinner',
        `HMTRCC-MEAL-${today}-D-${sId}`,
        'booked',
        'pending',
        null,
        null,
      );
    }

    // Yesterday & Tomorrow bookings
    for (let i = 0; i < 6; i++) {
      const sId = studentIds[i];
      insertBooking.run(
        `MB-${yesterday.replace(/-/g, '')}-L-${i + 1}`,
        sId,
        yesterday,
        'lunch',
        `HMTRCC-MEAL-${yesterday}-L-${sId}`,
        'booked',
        i < 4 ? 'served' : 'expired',
        i < 4 ? `${yesterday}T13:15` : null,
        i < 4 ? messStaffId : null,
      );
      insertBooking.run(
        `MB-${tomorrow.replace(/-/g, '')}-B-${i + 1}`,
        sId,
        tomorrow,
        'breakfast',
        `HMTRCC-MEAL-${tomorrow}-B-${sId}`,
        'booked',
        'pending',
        null,
        null,
      );
    }
    insertScan.run('INVALID-QR-9981', null, null, 'lunch', 'invalid', 'QR token does not match any valid meal booking.', messStaffId, `${today}T12:45`);

    // 10. Movements & Daily Attendance
    const insertMove = db.prepare(
      `INSERT INTO movements (student_id, leave_request_id, exit_time, expected_return_time, actual_return_time, status, exit_remarks, entry_remarks, recorded_exit_by, recorded_entry_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // Student 2 (Rohan) outside on approved leave
    insertMove.run(studentIds[2], approvedLeaveId, `${yesterday}T14:20`, `${tomorrow}T20:00`, null, 'outside', 'Approved family leave', '', secStaffId, null);
    // Student 5 (Meenakshi) currently outside for campus library / evening market
    insertMove.run(studentIds[5], null, `${today}T10:15`, `${today}T18:30`, null, 'outside', 'City library study pass', '', secStaffId, null);
    // Student 0 (Aarav) returned on time today
    insertMove.run(studentIds[0], null, `${today}T08:00`, `${today}T17:00`, `${today}T16:45`, 'returned', 'College lab session', 'Returned on time', secStaffId, secStaffId);
    // Student 8 (Devansh) late return yesterday
    insertMove.run(studentIds[8], null, `${yesterday}T15:00`, `${yesterday}T21:00`, `${yesterday}T22:10`, 'late_return', 'Project group meeting', 'Returned 70 mins past expected return time', secStaffId, secStaffId);

    const insertAtt = db.prepare(
      `INSERT INTO attendance_records (student_id, attendance_date, status, check_in_time, check_out_time, remarks, marked_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (let i = 0; i < studentIds.length; i++) {
      const sId = studentIds[i];
      if (i === 2) {
        insertAtt.run(sId, today, 'on_leave', '', '02:20 PM', 'Approved leave LV-2026-101', wardenId);
      } else if (i === 5) {
        insertAtt.run(sId, today, 'absent', '', '10:15 AM', 'Checked out for library', secStaffId);
      } else if (i === 13) {
        insertAtt.run(sId, today, 'absent', '', '08:15 AM', 'Unrecorded evening roll call', secStaffId);
      } else {
        insertAtt.run(sId, today, 'present', '07:45 PM', '09:15 AM', '', secStaffId);
      }
      insertAtt.run(sId, yesterday, i === 2 ? 'on_leave' : 'present', '08:00 PM', '09:00 AM', '', secStaffId);
    }

    // 11. Notices
    const insertNotice = db.prepare(
      `INSERT INTO notices (title, description, category, target_type, target_ids_json, status, publish_at, published_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertNotice.run(
      'Water Tank Maintenance in Block B',
      'Overhead water tank cleaning for Block B will take place tomorrow between 10:00 AM and 12:30 PM. Please store water in advance.',
      'Maintenance', 'blocks', JSON.stringify([blockBId]), 'published', `${today}T08:00`, wardenId,
    );
    insertNotice.run(
      'Strict Adherence to Mess Booking Cutoff (7:00 PM)',
      'Students are reminded that meal bookings for the next day open at 6:00 AM and close strictly at 7:00 PM. Same-day meal bookings are disabled.',
      'Mess', 'all', JSON.stringify([]), 'published', `${yesterday}T09:00`, messStaffId,
    );
    insertNotice.run(
      'Annual Hostel Fire Safety Drill',
      'Mandatory evacuation and safety briefing at the central courtyard for all residents.',
      'Rules', 'all', JSON.stringify([]), 'scheduled', `${tomorrow}T17:00`, adminId,
    );
    insertNotice.run(
      'Winter Curfew Timing Review Draft',
      'Draft circular regarding updated library late-stay passes during end-semester exams.',
      'General', 'groups', JSON.stringify(['2nd Year', '3rd Year']), 'draft', null, wardenId,
    );

    // 12. Real Notifications & Activity Logs
    const insertNotif = db.prepare(
      `INSERT INTO notifications (type, title, message, link_path, target_roles_json, is_read)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertNotif.run('leave', 'New Leave Request', 'Kabir Khanna (Room 102) requested leave for Bengaluru hackathon.', '/leaves', JSON.stringify(['super_admin', 'warden']), 0);
    insertNotif.run('complaint', 'Urgent Complaint Reopened', 'CMP-1005 (Window latch in Room 401) was reopened by Warden.', '/complaints', JSON.stringify(['super_admin', 'warden', 'maintenance_staff']), 0);
    insertNotif.run('late_return', 'Late Return Recorded', 'Devansh Joshi (Room 201) returned at 22:10 past expected 21:00.', '/movements', JSON.stringify(['super_admin', 'warden', 'security_staff']), 1);

    const insertLog = db.prepare(
      `INSERT INTO activity_logs (user_id, user_name, user_role, module, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertLog.run(wardenId, 'Priya Nair', 'warden', 'leaves', 'APPROVE_LEAVE', 'leave_request', 'LV-2026-101', 'Approved family wedding leave for Rohan Malhotra');
    insertLog.run(secStaffId, 'Vikram Singh', 'security_staff', 'movements', 'RECORD_EXIT', 'movement', String(studentIds[5]), 'Recorded exit for Meenakshi Iyer (Room 102)');
    insertLog.run(messStaffId, 'Ramesh Kulkarni', 'mess_staff', 'mess', 'PUBLISH_MENU', 'mess_menu', today, 'Published today breakfast, lunch, and dinner menus');
    insertLog.run(adminId, 'Arjun Mehta', 'super_admin', 'rooms', 'MARK_MAINTENANCE', 'room', '402', 'Marked Room 402 under maintenance for plumbing work');
  });

  runSeed();
}

// Allow running directly via `npm run seed`
const isDirectRun = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server/db/seed.ts');
if (isDirectRun) {
  seedDatabase();
  console.log('HM Trcc SQLite database seeded successfully.');
}

