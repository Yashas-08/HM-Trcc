import type Database from 'better-sqlite3';

export function initializeSchema(db: Database.Database): void {
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS floors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      floor_number INTEGER NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(block_id, floor_number)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      photo_url TEXT,
      designation TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('super_admin', 'warden', 'mess_staff', 'security_staff', 'maintenance_staff')),
      assigned_block_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL,
      responsibilities TEXT NOT NULL DEFAULT '',
      permissions_json TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE RESTRICT,
      floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE RESTRICT,
      room_number TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity >= 1),
      facilities_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'maintenance')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(block_id, room_number)
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      dob TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT 'Male',
      phone TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      photo_url TEXT,
      guardian_name TEXT NOT NULL,
      guardian_phone TEXT NOT NULL,
      guardian_relation TEXT NOT NULL DEFAULT 'Parent',
      emergency_contact_name TEXT NOT NULL DEFAULT '',
      emergency_contact_phone TEXT NOT NULL DEFAULT '',
      college_name TEXT NOT NULL DEFAULT '',
      course TEXT NOT NULL DEFAULT '',
      year_of_study TEXT NOT NULL DEFAULT '',
      admission_date TEXT NOT NULL,
      departure_date TEXT,
      documents_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS room_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
      bed_label TEXT NOT NULL DEFAULT 'Bed 1',
      allocated_at TEXT NOT NULL DEFAULT (datetime('now')),
      vacated_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      allocated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_room_per_student
      ON room_allocations(student_id) WHERE is_active = 1;

    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leave_code TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      destination TEXT NOT NULL DEFAULT '',
      departure_at TEXT NOT NULL,
      expected_return_at TEXT NOT NULL,
      actual_departure_at TEXT,
      actual_return_at TEXT,
      guardian_contact_verified INTEGER NOT NULL DEFAULT 0 CHECK(guardian_contact_verified IN (0, 1)),
      supporting_doc_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
      rejection_reason TEXT NOT NULL DEFAULT '',
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_code TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
      category TEXT NOT NULL CHECK(category IN ('Electrical', 'Plumbing', 'Cleaning', 'Wi-Fi', 'Food', 'Room maintenance', 'Other')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      photo_urls_json TEXT NOT NULL DEFAULT '[]',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'assigned', 'in_progress', 'resolved', 'reopened')),
      assigned_staff_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolution_notes TEXT NOT NULL DEFAULT '',
      remarks_json TEXT NOT NULL DEFAULT '[]',
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mess_menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_date TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner')),
      items_text TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 0 CHECK(is_published IN (0, 1)),
      published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(menu_date, meal_type)
    );

    CREATE TABLE IF NOT EXISTS meal_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      meal_date TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner')),
      qr_token TEXT NOT NULL UNIQUE,
      booking_status TEXT NOT NULL DEFAULT 'booked' CHECK(booking_status IN ('booked', 'cancelled')),
      verified_status TEXT NOT NULL DEFAULT 'pending' CHECK(verified_status IN ('pending', 'served', 'expired')),
      verified_at TEXT,
      verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, meal_date, meal_type)
    );

    CREATE TABLE IF NOT EXISTS meal_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qr_token_raw TEXT NOT NULL,
      booking_id INTEGER REFERENCES meal_bookings(id) ON DELETE SET NULL,
      student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      meal_type TEXT NOT NULL,
      scan_result TEXT NOT NULL CHECK(scan_result IN ('success', 'invalid', 'expired', 'duplicate')),
      message TEXT NOT NULL,
      scanned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      leave_request_id INTEGER REFERENCES leave_requests(id) ON DELETE SET NULL,
      exit_time TEXT NOT NULL,
      expected_return_time TEXT NOT NULL,
      actual_return_time TEXT,
      status TEXT NOT NULL DEFAULT 'outside' CHECK(status IN ('outside', 'returned', 'late_return')),
      exit_remarks TEXT NOT NULL DEFAULT '',
      entry_remarks TEXT NOT NULL DEFAULT '',
      recorded_exit_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      recorded_entry_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'on_leave')),
      check_in_time TEXT DEFAULT '',
      check_out_time TEXT DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '',
      marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, attendance_date)
    );

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      attachment_url TEXT,
      target_type TEXT NOT NULL DEFAULT 'all' CHECK(target_type IN ('all', 'blocks', 'groups', 'students')),
      target_ids_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'published', 'archived')),
      publish_at TEXT,
      published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hostel_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      hostel_name TEXT NOT NULL DEFAULT 'HM Trcc Hostel',
      curfew_time TEXT NOT NULL DEFAULT '21:30',
      mess_booking_open_time TEXT NOT NULL DEFAULT '06:00',
      mess_booking_close_time TEXT NOT NULL DEFAULT '19:00',
      breakfast_window TEXT NOT NULL DEFAULT '07:30 - 09:30',
      lunch_window TEXT NOT NULL DEFAULT '12:30 - 14:30',
      dinner_window TEXT NOT NULL DEFAULT '19:30 - 21:30',
      attendance_cutoff_time TEXT NOT NULL DEFAULT '22:00',
      late_return_grace_minutes INTEGER NOT NULL DEFAULT 15,
      allow_same_day_booking INTEGER NOT NULL DEFAULT 0,
      notification_prefs_json TEXT NOT NULL DEFAULT '{"leave":true,"complaint":true,"notice":true,"late_return":true}',
      security_settings_json TEXT NOT NULL DEFAULT '{"require_gate_remarks":false,"auto_flag_late_returns":true,"session_timeout_hours":12}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('leave', 'complaint', 'notice', 'late_return', 'mess')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_path TEXT NOT NULL DEFAULT '/',
      target_roles_json TEXT NOT NULL DEFAULT '["super_admin","warden"]',
      is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

