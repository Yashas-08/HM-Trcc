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
  role: UserRole;
  designation: string;
  photo_url: string | null;
  assigned_block_id: number | null;
  permissions: ModulePermissions;
}

