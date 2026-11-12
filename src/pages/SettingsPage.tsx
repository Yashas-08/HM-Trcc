import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Building2, FileUp, History, Lock, Shield, Sliders, User } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorBanner, LoadingState } from '../components/ui/States';

type SettingsTab = 'profile' | 'hostel' | 'access' | 'notifications' | 'system' | 'logs';

interface SettingsPayload {
  settings: {
    hostel_name: string;
    curfew_time: string;
    mess_booking_open_time: string;
    mess_booking_close_time: string;
    breakfast_window: string;
    lunch_window: string;
    dinner_window: string;
    attendance_cutoff_time: string;
    late_return_grace_minutes: number;
    allow_same_day_booking: number;
    notification_prefs: {
      leave: boolean;
      complaint: boolean;
      notice: boolean;
      late_return: boolean;
    };
    security_settings: {
      require_gate_remarks: boolean;
      auto_flag_late_returns: boolean;
      session_timeout_hours: number;
    };
  };
  blocks: Array<{ id: number; name: string; code: string; description: string }>;
  floors: Array<{ id: number; block_id: number; block_name: string; floor_number: number; label: string }>;
  activityLogs: Array<{
    id: number;
    user_name: string;
    user_role: string;
    module: string;
    action: string;
    details: string;
    created_at: string;
  }>;
}

export const SettingsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === 'super_admin';

  const [tab, setTab] = useState<SettingsTab>('profile');
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    photo_url: user?.photo_url || null as string | null,
  });

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [systemForm, setSystemForm] = useState<SettingsPayload['settings'] | null>(null);
  const [floorForm, setFloorForm] = useState({ block_id: '', floor_number: 3, label: 'Floor 3' });
  const [logSearch, setLogSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setError('');
    try {
      const res = await api.get<SettingsPayload>('/api/settings');
      setData(res);
      setSystemForm(res.settings);
      if (res.blocks[0]) {
        setFloorForm((prev) => ({ ...prev, block_id: prev.block_id || String(res.blocks[0].id) }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name,
        email: user.email,
        phone: user.phone || '',
        photo_url: user.photo_url,
      });
    }
  }, [user]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSaving(true);
    try {
      await api.put('/api/auth/profile', profileForm);
      await refreshUser();
      setSuccessMsg('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.put('/api/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSuccessMsg('Password changed successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await api.upload(file);
      setProfileForm((prev) => ({ ...prev, photo_url: up.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed');
    }
  };

  const saveSystemSettings = async () => {
    if (!systemForm) return;
    setError('');
    setSuccessMsg('');
    setSaving(true);
    try {
      await api.put('/api/settings', {
        hostel_name: systemForm.hostel_name,
        curfew_time: systemForm.curfew_time,
        mess_booking_open_time: systemForm.mess_booking_open_time,
        mess_booking_close_time: systemForm.mess_booking_close_time,
        breakfast_window: systemForm.breakfast_window,
        lunch_window: systemForm.lunch_window,
        dinner_window: systemForm.dinner_window,
        attendance_cutoff_time: systemForm.attendance_cutoff_time,
        late_return_grace_minutes: Number(systemForm.late_return_grace_minutes),
        allow_same_day_booking: Boolean(systemForm.allow_same_day_booking),
        notification_prefs: systemForm.notification_prefs,
        security_settings: systemForm.security_settings,
      });
      setSuccessMsg('System settings saved.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings');
    } finally {
      setSaving(false);
    }
  };

  const addFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSaving(true);
    try {
      await api.post('/api/rooms/floors', {
        block_id: Number(floorForm.block_id),
        floor_number: Number(floorForm.floor_number),
        label: floorForm.label,
      });
      setSuccessMsg('Floor added to block.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add floor');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <LoadingState label="Loading settings..." />;
  if (!data || !systemForm) return <ErrorBanner message={error || 'Unable to load settings'} onRetry={loadSettings} />;

  const navItems: Array<{ key: SettingsTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { key: 'profile', label: 'Admin Profile', icon: User },
    { key: 'hostel', label: 'Hostel Configuration', icon: Building2 },
    { key: 'access', label: 'User & Access Control', icon: Shield },
    { key: 'notifications', label: 'Notification Settings', icon: Bell },
    { key: 'system', label: 'System & Security', icon: Sliders },
    { key: 'logs', label: 'Activity Logs', icon: History },
  ];

  const filteredLogs = data.activityLogs.filter((l) => {
    if (!logSearch.trim()) return true;
    const s = logSearch.toLowerCase();
    return (
      l.user_name.toLowerCase().includes(s) ||
      l.action.toLowerCase().includes(s) ||
      l.details.toLowerCase().includes(s) ||
      l.module.toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, hostel structure, system timings, notifications, and audit logs"
      />

      {error ? <ErrorBanner message={error} /> : null}
      {successMsg ? (
        <div className="mb-4 px-4 py-3 rounded-[10px] bg-[#22A06B]/10 border border-[#22A06B]/30 text-[#22A06B] text-[15px] font-semibold">
          {successMsg}
        </div>
      ) : null}

      <div className="flex gap-5 items-start">
        {/* Left Sub-navigation */}
        <div className="w-[260px] shrink-0 bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-2.5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setTab(item.key);
                  setError('');
                  setSuccessMsg('');
                }}
                className={`w-full px-3.5 py-2.5 rounded-[8px] text-[15px] font-semibold leading-[1.35] flex items-center gap-2.5 text-left transition-colors ${
                  active ? 'bg-[#222222] text-white' : 'text-[#292929] hover:bg-[#F4F4F4]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Right Panel */}
        <div className="flex-1 bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-6">
          {tab === 'profile' ? (
            <div className="space-y-6">
              <form onSubmit={handleProfileSave} className="space-y-4">
                <h2 className="font-slab text-[22px] font-bold leading-[1.3]">Profile Details</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Full Name *</label>
                    <input
                      required
                      value={profileForm.full_name}
                      onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                      className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={profileForm.email}
                      onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                      className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Phone</label>
                    <input
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                    />
                  </div>
                  <div className="pt-6">
                    <label className="inline-flex items-center gap-2 px-3.5 h-[40px] text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px] cursor-pointer hover:bg-[#F4F4F4]">
                      <FileUp className="w-4 h-4 text-[#777777]" />
                      {profileForm.photo_url ? 'Change Profile Photo' : 'Upload Profile Photo'}
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 h-[40px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px]"
                >
                  Save Profile
                </button>
              </form>

              <form onSubmit={handlePasswordSave} className="space-y-4 pt-6 border-t border-[#E9E9E9]">
                <h2 className="font-slab text-[22px] font-bold leading-[1.3] flex items-center gap-2">
                  <Lock className="w-5 h-5" />
                  Password Management
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Current Password *</label>
                    <input
                      type="password"
                      required
                      value={pwForm.currentPassword}
                      onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                      className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[15px] font-semibold leading-[1.4] mb-1">New Password *</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={pwForm.newPassword}
                      onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                      className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Confirm New Password *</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={pwForm.confirmPassword}
                      onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                      className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 h-[40px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px]"
                >
                  Update Password
                </button>
              </form>
            </div>
          ) : null}

          {tab === 'hostel' ? (
            <div className="space-y-6">
              <div>
                <h2 className="font-slab text-[22px] font-bold leading-[1.3] mb-3">Hostel Identity & Blocks</h2>
                <div className="flex gap-3 items-end mb-4">
                  <div className="flex-1">
                    <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Hostel Name</label>
                    <input
                      disabled={!isSuperAdmin}
                      value={systemForm.hostel_name}
                      onChange={(e) => setSystemForm({ ...systemForm, hostel_name: e.target.value })}
                      className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] disabled:bg-[#F9F9F9]"
                    />
                  </div>
                  {isSuperAdmin ? (
                    <button
                      type="button"
                      onClick={saveSystemSettings}
                      disabled={saving}
                      className="h-[40px] px-4 bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px]"
                    >
                      Save Name
                    </button>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {data.blocks.map((b) => (
                    <div key={b.id} className="border border-[#E9E9E9] rounded-[10px] p-4">
                      <div className="font-slab text-[18px] font-semibold leading-[1.35] text-[#292929]">{b.name} ({b.code})</div>
                      <div className="text-[14px] leading-[1.45] text-[#777777] mt-0.5">{b.description}</div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {data.floors
                          .filter((f) => f.block_id === b.id)
                          .map((f) => (
                            <span key={f.id} className="px-2.5 py-0.5 text-[14px] bg-[#F4F4F4] rounded">
                              {f.label}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {isSuperAdmin ? (
                <form onSubmit={addFloor} className="pt-5 border-t border-[#E9E9E9] space-y-3">
                  <h3 className="font-slab text-[18px] font-semibold leading-[1.35]">Add Floor to Block</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <select
                      value={floorForm.block_id}
                      onChange={(e) => setFloorForm({ ...floorForm, block_id: e.target.value })}
                      className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                    >
                      {data.blocks.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={floorForm.floor_number}
                      onChange={(e) => setFloorForm({ ...floorForm, floor_number: Number(e.target.value) })}
                      placeholder="Floor #"
                      className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                    />
                    <input
                      required
                      value={floorForm.label}
                      onChange={(e) => setFloorForm({ ...floorForm, label: e.target.value })}
                      placeholder="Label (e.g. Floor 3)"
                      className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="h-[40px] px-4 bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px]"
                  >
                    Add Floor
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {tab === 'access' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-slab text-[22px] font-bold leading-[1.3]">User & Access Management</h2>
                  <p className="text-[14px] leading-[1.45] text-[#777777] mt-0.5">
                    Staff accounts, role assignments, and granular module permissions are managed centrally.
                  </p>
                </div>
                {isSuperAdmin ? (
                  <button
                    type="button"
                    onClick={() => navigate('/staff')}
                    className="h-[40px] px-4 bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px] shrink-0"
                  >
                    Manage Staff & Permissions
                  </button>
                ) : null}
              </div>
              <div className="border border-[#E9E9E9] rounded-[10px] divide-y divide-[#E9E9E9] text-[16px] leading-[1.5]">
                <div className="px-4 py-3 flex justify-between gap-4">
                  <span className="font-semibold">Super Admin</span>
                  <span className="text-[14px] text-[#777777] text-right">Full system access, staff accounts, roles & system configuration</span>
                </div>
                <div className="px-4 py-3 flex justify-between gap-4">
                  <span className="font-semibold">Warden</span>
                  <span className="text-[14px] text-[#777777] text-right">Students, rooms, leave approvals, complaints, notices & reports</span>
                </div>
                <div className="px-4 py-3 flex justify-between gap-4">
                  <span className="font-semibold">Mess Staff</span>
                  <span className="text-[14px] text-[#777777] text-right">Daily menus, meal bookings & QR meal verification</span>
                </div>
                <div className="px-4 py-3 flex justify-between gap-4">
                  <span className="font-semibold">Security Staff</span>
                  <span className="text-[14px] text-[#777777] text-right">Gate check-in/check-out, movement register & daily attendance</span>
                </div>
                <div className="px-4 py-3 flex justify-between gap-4">
                  <span className="font-semibold">Maintenance Staff</span>
                  <span className="text-[14px] text-[#777777] text-right">Assigned complaint resolution, progress updates & remarks</span>
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'notifications' ? (
            <div className="space-y-4">
              <h2 className="font-slab text-[22px] font-bold leading-[1.3]">Notification Settings</h2>
              <div className="divide-y divide-[#E9E9E9] border border-[#E9E9E9] rounded-[10px]">
                {(
                  [
                    ['leave', 'Leave Notifications', 'Alert wardens when new leave requests are submitted'],
                    ['complaint', 'Complaint Notifications', 'Alert administrators and technicians on new or assigned tickets'],
                    ['notice', 'Notice Notifications', 'Notify staff when new announcements are published'],
                    ['late_return', 'Return Alerts', 'Flag late student returns past expected return time'],
                  ] as const
                ).map(([key, title, desc]) => (
                  <label key={key} className="px-4 py-3.5 flex items-center justify-between cursor-pointer">
                    <div>
                      <div className="text-[16px] font-semibold">{title}</div>
                      <div className="text-[14px] leading-[1.45] text-[#777777]">{desc}</div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!isSuperAdmin}
                      checked={Boolean(systemForm.notification_prefs?.[key])}
                      onChange={(e) =>
                        setSystemForm({
                          ...systemForm,
                          notification_prefs: {
                            ...systemForm.notification_prefs,
                            [key]: e.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              {isSuperAdmin ? (
                <button
                  type="button"
                  onClick={saveSystemSettings}
                  disabled={saving}
                  className="px-4 h-[40px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px]"
                >
                  Save Notification Preferences
                </button>
              ) : null}
            </div>
          ) : null}

          {tab === 'system' ? (
            <div className="space-y-5">
              <h2 className="font-slab text-[22px] font-bold leading-[1.3]">Hostel Timings, Mess & Security Settings</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Hostel Curfew Time</label>
                  <input
                    type="time"
                    disabled={!isSuperAdmin}
                    value={systemForm.curfew_time}
                    onChange={(e) => setSystemForm({ ...systemForm, curfew_time: e.target.value })}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Attendance Cutoff Time</label>
                  <input
                    type="time"
                    disabled={!isSuperAdmin}
                    value={systemForm.attendance_cutoff_time}
                    onChange={(e) => setSystemForm({ ...systemForm, attendance_cutoff_time: e.target.value })}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Late Return Grace (Minutes)</label>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    disabled={!isSuperAdmin}
                    value={systemForm.late_return_grace_minutes}
                    onChange={(e) =>
                      setSystemForm({ ...systemForm, late_return_grace_minutes: Number(e.target.value) })
                    }
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Mess Booking Opens</label>
                  <input
                    type="time"
                    disabled={!isSuperAdmin}
                    value={systemForm.mess_booking_open_time}
                    onChange={(e) => setSystemForm({ ...systemForm, mess_booking_open_time: e.target.value })}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Mess Booking Closes</label>
                  <input
                    type="time"
                    disabled={!isSuperAdmin}
                    value={systemForm.mess_booking_close_time}
                    onChange={(e) => setSystemForm({ ...systemForm, mess_booking_close_time: e.target.value })}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Session Timeout (Hours)</label>
                  <input
                    type="number"
                    min={1}
                    max={72}
                    disabled={!isSuperAdmin}
                    value={systemForm.security_settings.session_timeout_hours}
                    onChange={(e) =>
                      setSystemForm({
                        ...systemForm,
                        security_settings: {
                          ...systemForm.security_settings,
                          session_timeout_hours: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Breakfast Window</label>
                  <input
                    disabled={!isSuperAdmin}
                    value={systemForm.breakfast_window}
                    onChange={(e) => setSystemForm({ ...systemForm, breakfast_window: e.target.value })}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Lunch Window</label>
                  <input
                    disabled={!isSuperAdmin}
                    value={systemForm.lunch_window}
                    onChange={(e) => setSystemForm({ ...systemForm, lunch_window: e.target.value })}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Dinner Window</label>
                  <input
                    disabled={!isSuperAdmin}
                    value={systemForm.dinner_window}
                    onChange={(e) => setSystemForm({ ...systemForm, dinner_window: e.target.value })}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                <label className="flex items-center gap-2 text-[16px] leading-[1.5]">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={Boolean(systemForm.allow_same_day_booking)}
                    onChange={(e) =>
                      setSystemForm({ ...systemForm, allow_same_day_booking: e.target.checked ? 1 : 0 })
                    }
                  />
                  Allow same-day meal bookings (disable for strict advance-only booking)
                </label>
                <label className="flex items-center gap-2 text-[16px] leading-[1.5]">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={Boolean(systemForm.security_settings.auto_flag_late_returns)}
                    onChange={(e) =>
                      setSystemForm({
                        ...systemForm,
                        security_settings: {
                          ...systemForm.security_settings,
                          auto_flag_late_returns: e.target.checked,
                        },
                      })
                    }
                  />
                  Automatically flag late returns past expected return time + grace period
                </label>
              </div>

              {isSuperAdmin ? (
                <button
                  type="button"
                  onClick={saveSystemSettings}
                  disabled={saving}
                  className="px-4 h-[40px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px]"
                >
                  Save System Settings
                </button>
              ) : null}
            </div>
          ) : null}

          {tab === 'logs' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-slab text-[22px] font-bold leading-[1.3]">Audit & Activity Logs</h2>
                <input
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Filter by user, module, action..."
                  className="w-[300px] h-[40px] px-3 text-[16px] font-normal leading-[1.45] bg-[#F4F4F4] rounded-[8px] focus:outline-none"
                />
              </div>
              <div className="border border-[#E9E9E9] rounded-[10px] divide-y divide-[#E9E9E9] max-h-[460px] overflow-y-auto text-[16px] leading-[1.5]">
                {filteredLogs.map((l) => (
                  <div key={l.id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div>
                      <span className="font-semibold text-[#292929]">{l.user_name}</span>
                      <span className="text-[#777777] mx-2">·</span>
                      <span className="font-mono text-[13px] uppercase text-[#777777]">{l.module}</span>
                      <div className="text-[#292929] mt-0.5">{l.details || l.action}</div>
                    </div>
                    <span className="text-[14px] text-[#777777] shrink-0">{l.created_at}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

