export type UserRole =
  | 'super_admin'
  | 'warden'
  | 'mess_staff'
  | 'security_staff'
  | 'maintenance_staff';

export type ModuleKey =
  | 'dashboard'
  | 'students'
  | 'rooms'
  | 'leaves'
  | 'complaints'
  | 'mess'
  | 'qr_scanner'
  | 'movements'
  | 'notices'
  | 'staff'
  | 'reports'
  | 'settings';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve';

export type ModulePermissions = Partial<Record<ModuleKey, PermissionAction[]>>;

export interface AuthUser {
  id: number;
  staff_code: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  designation: string;
  photo_url: string | null;
  assigned_block_id: number | null;
  permissions: ModulePermissions;
}

export interface DashboardData {
  stats: {
    availableBeds: number;
    totalBeds: number;
    operationalBeds: number;
    occupiedBeds: number;
    totalRooms: number;
    occupiedRooms: number;
    maintenanceRooms: number;
    openComplaints: number;
    totalComplaints: number;
    activeStudents: number;
    totalStudents: number;
    pendingLeaves: number;
    todayMessBookings: number;
    todayMessServed: number;
  };
  admissionsVsDepartures: Array<{
    monthKey: string;
    label: string;
    admissions: number;
    departures: number;
  }>;
  roomOccupancy: {
    occupiedBeds: number;
    availableBeds: number;
    occupiedPct: number;
    availablePct: number;
  };
  messOverview: {
    totalBookings: number;
    servedCount: number;
    remainingCount: number;
    servedPct: number;
    remainingPct: number;
  };
  attendanceDate: string;
  attendanceRows: Array<{
    student_id: number;
    student_code: string;
    full_name: string;
    room_number: string;
    check_in_time: string;
    check_out_time: string;
    status: 'present' | 'absent' | 'on_leave';
  }>;
  recentActivities: Array<{
    id: number;
    user_name: string;
    user_role: string;
    module: string;
    action: string;
    details: string;
    created_at: string;
  }>;
}

export interface SearchResult {
  category: string;
  id: number;
  title: string;
  subtitle: string;
  path: string;
}

export interface AppNotification {
  id: number;
  type: 'leave' | 'complaint' | 'notice' | 'late_return' | 'mess';
  title: string;
  message: string;
  link_path: string;
  is_read: number;
  created_at: string;
}

