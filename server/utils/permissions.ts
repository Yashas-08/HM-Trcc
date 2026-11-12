import type { AuthUser, ModuleKey, ModulePermissions, PermissionAction, UserRole } from '../types.js';

export const ALL_MODULE_KEYS: ModuleKey[] = [
  'dashboard',
  'students',
  'rooms',
  'leaves',
  'complaints',
  'mess',
  'qr_scanner',
  'movements',
  'notices',
  'staff',
  'reports',
  'settings',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  warden: 'Warden',
  mess_staff: 'Mess Staff',
  security_staff: 'Security Staff',
  maintenance_staff: 'Maintenance Staff',
};

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, ModulePermissions> = {
  super_admin: {
    dashboard: ['view'],
    students: ['view', 'create', 'edit', 'delete'],
    rooms: ['view', 'create', 'edit', 'delete'],
    leaves: ['view', 'create', 'edit', 'delete', 'approve'],
    complaints: ['view', 'create', 'edit', 'delete', 'approve'],
    mess: ['view', 'create', 'edit', 'delete'],
    qr_scanner: ['view', 'create'],
    movements: ['view', 'create', 'edit', 'delete'],
    notices: ['view', 'create', 'edit', 'delete'],
    staff: ['view', 'create', 'edit', 'delete'],
    reports: ['view'],
    settings: ['view', 'edit'],
  },
  warden: {
    dashboard: ['view'],
    students: ['view', 'create', 'edit', 'delete'],
    rooms: ['view', 'create', 'edit', 'delete'],
    leaves: ['view', 'create', 'edit', 'approve'],
    complaints: ['view', 'create', 'edit', 'approve'],
    mess: ['view', 'create', 'edit'],
    qr_scanner: ['view', 'create'],
    movements: ['view', 'create', 'edit'],
    notices: ['view', 'create', 'edit', 'delete'],
    reports: ['view'],
    settings: ['view'],
  },
  mess_staff: {
    dashboard: ['view'],
    mess: ['view', 'create', 'edit'],
    qr_scanner: ['view', 'create'],
    reports: ['view'],
    settings: ['view'],
  },
  security_staff: {
    dashboard: ['view'],
    leaves: ['view', 'edit'],
    movements: ['view', 'create', 'edit'],
    settings: ['view'],
  },
  maintenance_staff: {
    dashboard: ['view'],
    complaints: ['view', 'edit'],
    settings: ['view'],
  },
};

export function resolvePermissions(
  role: UserRole,
  customPermissionsJson?: string | null,
): ModulePermissions {
  const base = structuredClone(DEFAULT_ROLE_PERMISSIONS[role] || {});
  if (!customPermissionsJson) return base;
  try {
    const parsed = JSON.parse(customPermissionsJson) as ModulePermissions;
    if (parsed && typeof parsed === 'object') {
      for (const [mod, actions] of Object.entries(parsed)) {
        if (ALL_MODULE_KEYS.includes(mod as ModuleKey) && Array.isArray(actions)) {
          base[mod as ModuleKey] = actions as PermissionAction[];
        }
      }
    }
  } catch {
    // Ignore malformed overrides and fall back to default role permissions
  }
  return base;
}

export function hasModulePermission(
  user: Pick<AuthUser, 'role' | 'permissions'>,
  moduleKey: ModuleKey,
  action: PermissionAction = 'view',
): boolean {
  if (user.role === 'super_admin') return true;
  const allowed = user.permissions?.[moduleKey] || [];
  return allowed.includes(action);
}

