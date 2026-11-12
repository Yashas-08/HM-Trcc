import React, { useCallback, useEffect, useState } from 'react';
import { Edit3, Eye, FileUp, Plus, ShieldCheck, UserCheck, UserMinus, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { ModuleKey, ModulePermissions, PermissionAction, UserRole } from '../types';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, type TableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner, LoadingState } from '../components/ui/States';

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'warden', label: 'Warden' },
  { value: 'mess_staff', label: 'Mess Staff' },
  { value: 'security_staff', label: 'Security Staff' },
  { value: 'maintenance_staff', label: 'Maintenance Staff' },
];

const MODULE_LABELS: Array<{ key: ModuleKey; label: string; actions: PermissionAction[] }> = [
  { key: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { key: 'students', label: 'Students', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'rooms', label: 'Rooms', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'leaves', label: 'Leave Management', actions: ['view', 'create', 'edit', 'approve'] },
  { key: 'complaints', label: 'Complaints', actions: ['view', 'create', 'edit', 'approve'] },
  { key: 'mess', label: 'Mess Management', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'qr_scanner', label: 'QR Scanner', actions: ['view', 'create'] },
  { key: 'movements', label: 'Movement & Attendance', actions: ['view', 'create', 'edit'] },
  { key: 'notices', label: 'Notices', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'staff', label: 'Staff Management', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'reports', label: 'Reports & Analytics', actions: ['view'] },
  { key: 'settings', label: 'Settings', actions: ['view', 'edit'] },
];

interface StaffMember {
  id: number;
  staff_code: string;
  full_name: string;
  email: string;
  phone: string;
  photo_url: string | null;
  designation: string;
  role: UserRole;
  assigned_block_id: number | null;
  assigned_block_name: string | null;
  responsibilities: string;
  permissions: ModulePermissions;
  status: 'active' | 'inactive';
  assigned_complaints_count?: number;
}

interface StaffProfileData {
  member: StaffMember;
  assignedComplaints: Array<{
    id: number;
    complaint_code: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    student_name: string;
  }>;
  workHistory: Array<{ id: number; module: string; action: string; details: string; created_at: string }>;
}

export const StaffPage: React.FC = () => {
  const { user: currentUser, can } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0 });
  const [defaultPerms, setDefaultPerms] = useState<Record<UserRole, ModulePermissions> | null>(null);
  const [blocks, setBlocks] = useState<Array<{ id: number; name: string }>>([]);

  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    photo_url: null as string | null,
    designation: '',
    role: 'warden' as UserRole,
    assigned_block_id: '',
    responsibilities: '',
    permissions: {} as ModulePermissions,
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<StaffProfileData | null>(null);
  const [statusToggleTarget, setStatusToggleTarget] = useState<StaffMember | null>(null);

  const loadStaff = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const [staffRes, roomRes] = await Promise.all([
        api.get<{
          staff: StaffMember[];
          summary: { total: number; active: number; inactive: number };
          defaultRolePermissions: Record<UserRole, ModulePermissions>;
        }>(`/api/staff?${params.toString()}`),
        api.get<{ blocks: Array<{ id: number; name: string }> }>('/api/rooms/overview').catch(() => ({ blocks: [] })),
      ]);
      setStaff(staffRes.staff);
      setSummary(staffRes.summary);
      setDefaultPerms(staffRes.defaultRolePermissions);
      setBlocks(roomRes.blocks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load staff directory');
    } finally {
      setLoading(false);
    }
  }, [q, roleFilter, statusFilter]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const openAdd = () => {
    setEditingId(null);
    setForm({
      full_name: '',
      email: '',
      password: '',
      phone: '',
      photo_url: null,
      designation: '',
      role: 'warden',
      assigned_block_id: '',
      responsibilities: '',
      permissions: structuredClone(defaultPerms?.warden || {}),
    });
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (m: StaffMember) => {
    setEditingId(m.id);
    setForm({
      full_name: m.full_name,
      email: m.email,
      password: '',
      phone: m.phone,
      photo_url: m.photo_url,
      designation: m.designation,
      role: m.role,
      assigned_block_id: m.assigned_block_id ? String(m.assigned_block_id) : '',
      responsibilities: m.responsibilities,
      permissions: structuredClone(m.permissions || {}),
    });
    setFormError('');
    setFormOpen(true);
  };

  const openProfile = async (id: number) => {
    try {
      const res = await api.get<StaffProfileData>(`/api/staff/${id}`);
      setProfile(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load staff profile');
    }
  };

  const handleRoleChange = (nextRole: UserRole) => {
    setForm((prev) => ({
      ...prev,
      role: nextRole,
      permissions: structuredClone(defaultPerms?.[nextRole] || {}),
    }));
  };

  const togglePerm = (moduleKey: ModuleKey, action: PermissionAction) => {
    setForm((prev) => {
      const current = prev.permissions[moduleKey] || [];
      const next = current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action];
      return {
        ...prev,
        permissions: { ...prev.permissions, [moduleKey]: next },
      };
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await api.upload(file);
      setForm((prev) => ({ ...prev, photo_url: up.url }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Photo upload failed');
    }
  };

  const submitStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        photo_url: form.photo_url,
        designation: form.designation,
        role: form.role,
        assigned_block_id: form.assigned_block_id ? Number(form.assigned_block_id) : null,
        responsibilities: form.responsibilities,
        permissions: form.permissions,
      };
      if (form.password) {
        payload.password = form.password;
      }
      if (editingId) {
        await api.put(`/api/staff/${editingId}`, payload);
      } else {
        await api.post('/api/staff', payload);
      }
      setFormOpen(false);
      await loadStaff();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save staff member');
    } finally {
      setSaving(false);
    }
  };

  const toggleStaffStatus = async () => {
    if (!statusToggleTarget) return;
    const nextStatus = statusToggleTarget.status === 'active' ? 'inactive' : 'active';
    setSaving(true);
    try {
      await api.patch(`/api/staff/${statusToggleTarget.id}/status`, { status: nextStatus });
      setStatusToggleTarget(null);
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update staff status');
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (r: UserRole) => ROLE_OPTIONS.find((x) => x.value === r)?.label || r;

  const columns: TableColumn<StaffMember>[] = [
    {
      key: 'row_number',
      header: '#',
      width: '60px',
      render: (_r, index) => (
        <span className="text-[#777777] tabular-nums">{String(index + 1).padStart(2, '0')}</span>
      ),
    },
    {
      key: 'name',
      header: 'Staff Member',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          {r.photo_url ? (
            <img src={r.photo_url} alt={r.full_name} className="w-9 h-9 rounded-full object-cover border border-[#E9E9E9]" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#222222] text-white text-[13px] font-semibold flex items-center justify-center shrink-0">
              {r.full_name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-semibold text-[#292929]">{r.full_name}</div>
            <div className="text-[14px] leading-[1.45] text-[#777777]">{r.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Contact',
      render: (r) => <span>{r.phone || '--'}</span>,
    },
    {
      key: 'designation',
      header: 'Designation & Role',
      render: (r) => (
        <div>
          <div className="font-medium">{r.designation}</div>
          <div className="text-[14px] leading-[1.45] text-[#777777]">{roleLabel(r.role)}</div>
        </div>
      ),
    },
    {
      key: 'block',
      header: 'Assigned Block',
      render: (r) => <span>{r.assigned_block_name || 'All Blocks'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span className={`text-[14px] font-semibold leading-[1.35] ${r.status === 'active' ? 'text-[#22A06B]' : 'text-[#D9383A]'}`}>
          {r.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openProfile(r.id)}
            title="View Staff Profile"
            className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4]"
          >
            <Eye className="w-4 h-4" />
          </button>
          {can('staff', 'edit') ? (
            <button
              type="button"
              onClick={() => openEdit(r)}
              title="Edit Staff & Permissions"
              className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4]"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          ) : null}
          {can('staff', 'delete') && r.id !== currentUser?.id ? (
            <button
              type="button"
              onClick={() => setStatusToggleTarget(r)}
              title={r.status === 'active' ? 'Deactivate Staff' : 'Activate Staff'}
              className={`p-1.5 rounded-[6px] ${
                r.status === 'active'
                  ? 'text-[#777777] hover:text-[#D9383A] hover:bg-[#D9383A]/10'
                  : 'text-[#777777] hover:text-[#22A06B] hover:bg-[#22A06B]/10'
              }`}
            >
              {r.status === 'active' ? <UserMinus className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Staff Management"
        subtitle="Manage hostel staff accounts, block assignments, roles, and module permissions"
        actions={
          can('staff', 'create') ? (
            <button
              type="button"
              onClick={openAdd}
              className="h-[40px] px-4 rounded-[8px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] flex items-center gap-2 hover:bg-[#333333]"
            >
              <Plus className="w-4 h-4" />
              Add Staff Member
            </button>
          ) : null
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadStaff} /> : null}

      <div className="grid grid-cols-3 gap-5 mb-5">
        <StatCard label="Total Staff" value={summary.total || 0} icon={Users} tone="blue" />
        <StatCard label="Active Staff" value={summary.active || 0} icon={ShieldCheck} tone="lime" />
        <StatCard label="Inactive Staff" value={summary.inactive || 0} icon={UserMinus} tone="lavender" />
      </div>

      {/* Filter Bar */}
      <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-4 mb-5 flex items-center justify-between gap-4">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search staff ID, name, designation..."
          className="w-[320px] h-[40px] px-3 text-[16px] font-normal leading-[1.45] bg-[#F4F4F4] rounded-[8px] focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Filter by role"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] bg-white"
          >
            <option value="all">All Roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading staff directory..." />
      ) : staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff accounts found"
          description="Try adjusting your search or role filters."
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] overflow-hidden">
          <DataTable columns={columns} data={staff} rowKey={(r) => r.id} onRowClick={(r) => openProfile(r.id)} />
        </div>
      )}

      {/* Add / Edit Staff Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Staff & Permissions' : 'Add Staff Account'}
        maxWidth="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="staff-form"
              disabled={saving}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
            >
              {saving ? 'Saving...' : 'Save Staff Account'}
            </button>
          </>
        }
      >
        <form id="staff-form" onSubmit={submitStaff} className="space-y-4">
          {formError ? <ErrorBanner message={formError} /> : null}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Full Name *</label>
              <input
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">
                Password {editingId ? '(Leave blank to keep unchanged)' : '*'}
              </label>
              <input
                type="password"
                required={!editingId}
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min 8 characters"
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Contact Number</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Designation *</label>
              <input
                required
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                placeholder="e.g. Block Warden"
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Role *</label>
                <select
                  value={form.role}
                  onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                  className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Assigned Block</label>
                <select
                  value={form.assigned_block_id}
                  onChange={(e) => setForm({ ...form, assigned_block_id: e.target.value })}
                  className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                >
                  <option value="">All Blocks</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Assigned Responsibilities</label>
              <input
                value={form.responsibilities}
                onChange={(e) => setForm({ ...form, responsibilities: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
            <div className="pt-6">
              <label className="inline-flex items-center gap-2 px-3.5 h-[40px] text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px] cursor-pointer hover:bg-[#F4F4F4]">
                <FileUp className="w-4 h-4 text-[#777777]" />
                {form.photo_url ? 'Photo Ready' : 'Upload Photo'}
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
            </div>
          </div>

          {/* Granular Module Permissions */}
          <div className="border-t border-[#E9E9E9] pt-4">
            <h3 className="font-slab text-[15px] font-normal uppercase tracking-wide text-[#777777] mb-2.5">
              Module Permissions Matrix
            </h3>
            <div className="border border-[#E9E9E9] rounded-[8px] divide-y divide-[#E9E9E9] max-h-[220px] overflow-y-auto">
              {MODULE_LABELS.map((mod) => {
                const granted = form.permissions[mod.key] || [];
                return (
                  <div key={mod.key} className="px-3.5 py-2.5 flex items-center justify-between text-[15px]">
                    <span className="font-semibold text-[#292929]">{mod.label}</span>
                    <div className="flex items-center gap-3.5">
                      {mod.actions.map((act) => (
                        <label key={act} className="inline-flex items-center gap-1.5 text-[15px] capitalize cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={form.role === 'super_admin'}
                            checked={form.role === 'super_admin' || granted.includes(act)}
                            onChange={() => togglePerm(mod.key, act)}
                          />
                          <span className="text-[#777777]">{act}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>

      {/* Staff Profile Modal */}
      <Modal
        open={Boolean(profile)}
        onClose={() => setProfile(null)}
        title={profile ? `${profile.member.full_name} (${profile.member.staff_code})` : ''}
        subtitle={
          profile
            ? `${profile.member.designation} · ${roleLabel(profile.member.role)} · ${
                profile.member.assigned_block_name || 'All Blocks'
              }`
            : ''
        }
        maxWidth="lg"
      >
        {profile ? (
          <div className="space-y-5 text-[16px] leading-[1.5]">
            <div className="grid grid-cols-2 gap-4 bg-[#F4F4F4] rounded-[10px] p-4">
              <div><span className="text-[#777777]">Email:</span> {profile.member.email}</div>
              <div><span className="text-[#777777]">Contact:</span> {profile.member.phone || '--'}</div>
              <div className="col-span-2">
                <span className="text-[#777777]">Responsibilities:</span> {profile.member.responsibilities || '--'}
              </div>
            </div>

            <div>
              <h4 className="font-slab text-[15px] font-normal uppercase tracking-wide text-[#777777] mb-2">
                Assigned Complaints ({profile.assignedComplaints.length})
              </h4>
              {profile.assignedComplaints.length === 0 ? (
                <p className="text-[14px] text-[#777777]">No complaints currently assigned.</p>
              ) : (
                <div className="border border-[#E9E9E9] rounded-[8px] divide-y divide-[#E9E9E9]">
                  {profile.assignedComplaints.map((c) => (
                    <div key={c.id} className="px-3.5 py-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-[14px] text-[#777777] mr-2">{c.complaint_code}</span>
                        <span className="font-medium">{c.title}</span>
                      </div>
                      <span className="text-[14px] capitalize font-semibold">{c.status.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-slab text-[15px] font-normal uppercase tracking-wide text-[#777777] mb-2">
                Recent Work History
              </h4>
              {profile.workHistory.length === 0 ? (
                <p className="text-[14px] text-[#777777]">No recent activity recorded.</p>
              ) : (
                <div className="border border-[#E9E9E9] rounded-[8px] divide-y divide-[#E9E9E9] max-h-[180px] overflow-y-auto">
                  {profile.workHistory.map((w) => (
                    <div key={w.id} className="px-3.5 py-2.5 flex items-center justify-between gap-4">
                      <span>{w.details}</span>
                      <span className="text-[14px] text-[#777777] shrink-0">{w.created_at}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(statusToggleTarget)}
        onClose={() => setStatusToggleTarget(null)}
        onConfirm={toggleStaffStatus}
        loading={saving}
        danger={statusToggleTarget?.status === 'active'}
        title={statusToggleTarget?.status === 'active' ? 'Deactivate Staff Account' : 'Reactivate Staff Account'}
        message={`Change status of ${statusToggleTarget?.full_name} to ${
          statusToggleTarget?.status === 'active' ? 'inactive' : 'active'
        }?`}
        confirmLabel={statusToggleTarget?.status === 'active' ? 'Deactivate' : 'Activate'}
      />
    </div>
  );
};

