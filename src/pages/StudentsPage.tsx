import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BedDouble,
  Edit3,
  Eye,
  FileUp,
  Plus,
  Search,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { DataTable, type TableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner, LoadingState } from '../components/ui/States';

interface StudentRow {
  id: number;
  student_code: string;
  full_name: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  phone: string;
  email: string;
  photo_url: string | null;
  guardian_name: string;
  guardian_phone: string;
  guardian_relation: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  college_name: string;
  course: string;
  year_of_study: string;
  admission_date: string;
  departure_date: string | null;
  documents_json: string;
  status: 'active' | 'inactive';
  room_id: number | null;
  room_number: string | null;
  block_id: number | null;
  block_name: string | null;
  bed_label: string | null;
}

interface RoomOption {
  id: number;
  room_number: string;
  block_name: string;
  capacity: number;
  occupied_beds: number;
  available_beds: number;
  status: string;
}

interface BlockOption {
  id: number;
  name: string;
}

interface StudentProfileDetail {
  student: StudentRow & { floor_label?: string; allocated_at?: string };
  attendanceHistory: Array<{ id: number; attendance_date: string; status: string; check_in_time: string; check_out_time: string }>;
  leaveHistory: Array<{ id: number; leave_code: string; reason: string; departure_at: string; expected_return_at: string; status: string }>;
  complaintHistory: Array<{ id: number; complaint_code: string; category: string; title: string; priority: string; status: string }>;
  mealHistory: Array<{ id: number; booking_code: string; meal_date: string; meal_type: string; booking_status: string; verified_status: string }>;
}

const emptyForm = {
  full_name: '',
  dob: '',
  gender: 'Male' as 'Male' | 'Female' | 'Other',
  phone: '',
  email: '',
  photo_url: '' as string | null,
  guardian_name: '',
  guardian_phone: '',
  guardian_relation: 'Parent',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  college_name: '',
  course: '',
  year_of_study: '',
  admission_date: new Date().toISOString().slice(0, 10),
  documents: [] as Array<{ name: string; url: string }>,
  room_id: '' as string,
};

export const StudentsPage: React.FC = () => {
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [blocks, setBlocks] = useState<BlockOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [blockFilter, setBlockFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [profileDetail, setProfileDetail] = useState<StudentProfileDetail | null>(null);
  const [profileTab, setProfileTab] = useState<'overview' | 'attendance' | 'leaves' | 'complaints' | 'meals'>('overview');

  const [allocModalStudent, setAllocModalStudent] = useState<StudentRow | null>(null);
  const [allocRoomId, setAllocRoomId] = useState('');
  const [allocBedLabel, setAllocBedLabel] = useState('');
  const [allocError, setAllocError] = useState('');

  const [confirmDeactivate, setConfirmDeactivate] = useState<StudentRow | null>(null);

  const fetchStudents = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (blockFilter !== 'all') params.set('blockId', blockFilter);

      const [studRes, roomRes] = await Promise.all([
        api.get<{ students: StudentRow[] }>(`/api/students?${params.toString()}`),
        api.get<{ blocks: BlockOption[]; rooms: RoomOption[] }>('/api/rooms/overview'),
      ]);
      setStudents(studRes.students);
      setBlocks(roomRes.blocks);
      setRooms(roomRes.rooms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, blockFilter]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const openProfile = useCallback(async (id: number) => {
    try {
      const res = await api.get<StudentProfileDetail>(`/api/students/${id}`);
      setProfileDetail(res);
      setProfileTab('overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student profile');
    }
  }, []);

  useEffect(() => {
    const highlight = searchParams.get('highlight');
    if (highlight) {
      openProfile(Number(highlight));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, openProfile]);

  const openAddModal = () => {
    setEditingId(null);
    setForm({ ...emptyForm, admission_date: new Date().toISOString().slice(0, 10) });
    setFormError('');
    setFormOpen(true);
  };

  const openEditModal = (s: StudentRow) => {
    setEditingId(s.id);
    let docs: Array<{ name: string; url: string }> = [];
    try {
      docs = JSON.parse(s.documents_json || '[]');
    } catch {
      docs = [];
    }
    setForm({
      full_name: s.full_name,
      dob: s.dob || '',
      gender: s.gender || 'Male',
      phone: s.phone,
      email: s.email,
      photo_url: s.photo_url,
      guardian_name: s.guardian_name,
      guardian_phone: s.guardian_phone,
      guardian_relation: s.guardian_relation || 'Parent',
      emergency_contact_name: s.emergency_contact_name || '',
      emergency_contact_phone: s.emergency_contact_phone || '',
      college_name: s.college_name || '',
      course: s.course || '',
      year_of_study: s.year_of_study || '',
      admission_date: s.admission_date,
      documents: docs,
      room_id: s.room_id ? String(s.room_id) : '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await api.upload(file);
      setForm((prev) => ({ ...prev, photo_url: uploaded.url }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await api.upload(file);
      setForm((prev) => ({
        ...prev,
        documents: [...prev.documents, { name: uploaded.originalName, url: uploaded.url }],
      }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Document upload failed');
    } finally {
      setUploading(false);
    }
  };

  const submitStudentForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        photo_url: form.photo_url || null,
        room_id: !editingId && form.room_id ? Number(form.room_id) : null,
      };
      if (editingId) {
        await api.put(`/api/students/${editingId}`, payload);
      } else {
        await api.post('/api/students', payload);
      }
      setFormOpen(false);
      await fetchStudents();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save student');
    } finally {
      setSaving(false);
    }
  };

  const submitRoomAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocModalStudent || !allocRoomId) return;
    setAllocError('');
    setSaving(true);
    try {
      await api.post(`/api/students/${allocModalStudent.id}/allocate-room`, {
        room_id: Number(allocRoomId),
        bed_label: allocBedLabel.trim() || undefined,
      });
      setAllocModalStudent(null);
      await fetchStudents();
    } catch (err) {
      setAllocError(err instanceof Error ? err.message : 'Room allocation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivate) return;
    setSaving(true);
    try {
      await api.post(`/api/students/${confirmDeactivate.id}/deactivate`);
      setConfirmDeactivate(null);
      await fetchStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate student');
    } finally {
      setSaving(false);
    }
  };

  const handleReactivate = async (student: StudentRow) => {
    try {
      await api.post(`/api/students/${student.id}/reactivate`);
      await fetchStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate student');
    }
  };

  const availableRoomOptions = rooms.filter((r) => r.status !== 'maintenance' && r.available_beds > 0);

  const columns: TableColumn<StudentRow>[] = [
    {
      key: 'row_number',
      header: '#',
      width: '60px',
      render: (_r, index) => (
        <span className="text-[#777777] tabular-nums">{String(index + 1).padStart(2, '0')}</span>
      ),
    },
    {
      key: 'full_name',
      header: 'Student Name',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          {r.photo_url ? (
            <img src={r.photo_url} alt={r.full_name} className="w-9 h-9 rounded-full object-cover border border-[#E9E9E9]" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#CEB5EF]/45 text-[#292929] text-[13px] font-semibold flex items-center justify-center shrink-0">
              {r.full_name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-semibold text-[#292929]">{r.full_name}</div>
            <div className="text-[14px] leading-[1.45] text-[#777777]">{r.course || 'Resident'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (r) => <span className="text-[#292929]">{r.phone}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      render: (r) => <span className="text-[#777777]">{r.email}</span>,
    },
    {
      key: 'block_name',
      header: 'Block',
      render: (r) => <span>{r.block_name || '--'}</span>,
    },
    {
      key: 'room_number',
      header: 'Room No',
      render: (r) => (
        <span className="font-medium">
          {r.room_number ? `${r.room_number}${r.bed_label ? ` (${r.bed_label})` : ''}` : 'Unassigned'}
        </span>
      ),
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
            title="View Profile"
            className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4]"
          >
            <Eye className="w-4 h-4" />
          </button>
          {can('students', 'edit') ? (
            <>
              <button
                type="button"
                onClick={() => openEditModal(r)}
                title="Edit Student"
                className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4]"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              {r.status === 'active' ? (
                <button
                  type="button"
                  onClick={() => {
                    setAllocModalStudent(r);
                    setAllocRoomId(r.room_id ? String(r.room_id) : '');
                    setAllocBedLabel('');
                    setAllocError('');
                  }}
                  title={r.room_id ? 'Transfer Room' : 'Allocate Room'}
                  className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4]"
                >
                  <BedDouble className="w-4 h-4" />
                </button>
              ) : null}
            </>
          ) : null}
          {r.status === 'active' && can('students', 'delete') ? (
            <button
              type="button"
              onClick={() => setConfirmDeactivate(r)}
              title="Deactivate Student"
              className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#D9383A] hover:bg-[#D9383A]/10"
            >
              <UserMinus className="w-4 h-4" />
            </button>
          ) : null}
          {r.status === 'inactive' && can('students', 'edit') ? (
            <button
              type="button"
              onClick={() => handleReactivate(r)}
              title="Reactivate Student"
              className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#22A06B] hover:bg-[#22A06B]/10"
            >
              <UserCheck className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Student Management"
        subtitle="Manage student directory, admissions, documents, and room allocations"
        actions={
          can('students', 'create') ? (
            <button
              type="button"
              onClick={openAddModal}
              className="h-[40px] px-4 rounded-[8px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] flex items-center gap-2 hover:bg-[#333333]"
            >
              <Plus className="w-4 h-4" />
              Add Student
            </button>
          ) : null
        }
      />

      {error ? <ErrorBanner message={error} onRetry={fetchStudents} /> : null}

      {/* Filter Bar */}
      <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-4 mb-5 flex items-center justify-between gap-4">
        <div className="relative w-[360px]">
          <Search className="w-4 h-4 text-[#777777] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, ID, email, or phone..."
            className="w-full h-[40px] pl-9 pr-3 text-[16px] font-normal leading-[1.45] bg-[#F4F4F4] rounded-[8px] border border-transparent focus:border-[#E9E9E9] focus:bg-white focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <select
            value={blockFilter}
            onChange={(e) => setBlockFilter(e.target.value)}
            aria-label="Filter by block"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] bg-[#FFFFFF] border border-[#E9E9E9] rounded-[8px] text-[#292929] focus:outline-none"
          >
            <option value="all">All Blocks</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] bg-[#FFFFFF] border border-[#E9E9E9] rounded-[8px] text-[#292929] focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading student directory..." />
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students match your filters"
          description="Try clearing search filters or add a new student record to begin."
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <DataTable
            columns={columns}
            data={students}
            rowKey={(r) => r.id}
            onRowClick={(r) => openProfile(r.id)}
          />
        </div>
      )}

      {/* Add / Edit Student Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Student Record' : 'Admit New Student'}
        subtitle="All fields persist directly to the hostel student directory."
        maxWidth="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px] bg-white hover:bg-[#F4F4F4]"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="student-form"
              disabled={saving || uploading}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px] hover:bg-[#333333] disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Student'}
            </button>
          </>
        }
      >
        <form id="student-form" onSubmit={submitStudentForm} className="space-y-5">
          {formError ? <ErrorBanner message={formError} /> : null}

          <div>
            <h3 className="font-slab text-[15px] font-normal uppercase tracking-wider text-[#777777] mb-3">
              Personal & Contact Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Full Name *</label>
                <input
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                />
              </div>
              <div>
                <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                />
              </div>
              <div>
                <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Phone Number *</label>
                <input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: e.target.value })}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value as 'Male' | 'Female' | 'Other' })}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-slab text-[15px] font-normal uppercase tracking-wider text-[#777777] mb-3">
              Guardian & Emergency Contacts
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Guardian Name *</label>
                <input
                  required
                  value={form.guardian_name}
                  onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                  className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                />
              </div>
              <div>
                <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Guardian Phone *</label>
                <input
                  required
                  value={form.guardian_phone}
                  onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
                  className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                />
              </div>
              <div>
                <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Emergency Contact Name</label>
                <input
                  value={form.emergency_contact_name}
                  onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })}
                  className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                />
              </div>
              <div>
                <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Emergency Contact Phone</label>
                <input
                  value={form.emergency_contact_phone}
                  onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })}
                  className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-slab text-[15px] font-normal uppercase tracking-wider text-[#777777] mb-3">
              Academic & Admission Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">College / Institution</label>
                <input
                  value={form.college_name}
                  onChange={(e) => setForm({ ...form, college_name: e.target.value })}
                  className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Course</label>
                  <input
                    value={form.course}
                    onChange={(e) => setForm({ ...form, course: e.target.value })}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Year</label>
                  <input
                    value={form.year_of_study}
                    onChange={(e) => setForm({ ...form, year_of_study: e.target.value })}
                    placeholder="e.g. 2nd Year"
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">Admission Date *</label>
                <input
                  type="date"
                  required
                  value={form.admission_date}
                  onChange={(e) => setForm({ ...form, admission_date: e.target.value })}
                  className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                />
              </div>
              {!editingId ? (
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">
                    Initial Room Allocation (Optional)
                  </label>
                  <select
                    value={form.room_id}
                    onChange={(e) => setForm({ ...form, room_id: e.target.value })}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  >
                    <option value="">Leave Unassigned</option>
                    {availableRoomOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.block_name} — Room {r.room_number} ({r.available_beds} bed(s) free)
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>

          {/* Photo & Document Uploads */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#E9E9E9]">
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1.5">Profile Photograph</label>
              <label className="inline-flex items-center gap-2 px-3.5 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px] cursor-pointer hover:bg-[#F4F4F4]">
                <FileUp className="w-4 h-4 text-[#777777]" />
                {uploading ? 'Uploading...' : 'Upload Photo'}
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
              {form.photo_url ? (
                <span className="ml-3 text-[14px] text-[#22A06B] font-medium">Photo attached</span>
              ) : null}
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1.5">Supporting Documents</label>
              <label className="inline-flex items-center gap-2 px-3.5 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px] cursor-pointer hover:bg-[#F4F4F4]">
                <FileUp className="w-4 h-4 text-[#777777]" />
                Attach Document
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={handleDocUpload} className="hidden" />
              </label>
              {form.documents.length > 0 ? (
                <div className="mt-1.5 text-[14px] text-[#777777]">
                  {form.documents.map((d, i) => (
                    <span key={i} className="mr-2 underline">{d.name}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </form>
      </Modal>

      {/* Student Profile Modal */}
      <Modal
        open={Boolean(profileDetail)}
        onClose={() => setProfileDetail(null)}
        title={profileDetail ? `${profileDetail.student.full_name} (${profileDetail.student.student_code})` : ''}
        subtitle={
          profileDetail
            ? `${profileDetail.student.course || 'Resident'} · ${
                profileDetail.student.room_number
                  ? `${profileDetail.student.block_name} / Room ${profileDetail.student.room_number}`
                  : 'Unassigned'
              }`
            : ''
        }
        maxWidth="xl"
      >
        {profileDetail ? (
          <div>
            <div className="flex items-center gap-2 border-b border-[#E9E9E9] mb-4">
              {(
                [
                  ['overview', 'Profile & Room'],
                  ['attendance', `Attendance (${profileDetail.attendanceHistory.length})`],
                  ['leaves', `Leaves (${profileDetail.leaveHistory.length})`],
                  ['complaints', `Complaints (${profileDetail.complaintHistory.length})`],
                  ['meals', `Meal Bookings (${profileDetail.mealHistory.length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setProfileTab(key)}
                  className={`px-3.5 py-2 text-[15px] font-semibold leading-[1.3] border-b-2 transition-colors ${
                    profileTab === key
                      ? 'border-[#222222] text-[#292929]'
                      : 'border-transparent text-[#777777] hover:text-[#292929]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {profileTab === 'overview' ? (
              <div className="grid grid-cols-2 gap-5 text-[16px] leading-[1.5]">
                <div className="border border-[#E9E9E9] rounded-[10px] p-4 space-y-2">
                  <div className="font-slab text-[15px] font-normal uppercase tracking-wide text-[#777777]">Personal & Academic</div>
                  <div><span className="text-[#777777]">Phone:</span> {profileDetail.student.phone}</div>
                  <div><span className="text-[#777777]">Email:</span> {profileDetail.student.email}</div>
                  <div><span className="text-[#777777]">DOB / Gender:</span> {profileDetail.student.dob || '--'} / {profileDetail.student.gender}</div>
                  <div><span className="text-[#777777]">College:</span> {profileDetail.student.college_name || '--'}</div>
                  <div><span className="text-[#777777]">Course & Year:</span> {profileDetail.student.course || '--'} ({profileDetail.student.year_of_study || '--'})</div>
                  <div><span className="text-[#777777]">Admitted:</span> {profileDetail.student.admission_date}</div>
                </div>
                <div className="border border-[#E9E9E9] rounded-[10px] p-4 space-y-2">
                  <div className="font-slab text-[15px] font-normal uppercase tracking-wide text-[#777777]">Guardian & Room Allocation</div>
                  <div><span className="text-[#777777]">Guardian:</span> {profileDetail.student.guardian_name} ({profileDetail.student.guardian_relation})</div>
                  <div><span className="text-[#777777]">Guardian Phone:</span> {profileDetail.student.guardian_phone}</div>
                  <div><span className="text-[#777777]">Emergency Contact:</span> {profileDetail.student.emergency_contact_name || '--'} ({profileDetail.student.emergency_contact_phone || '--'})</div>
                  <div className="pt-2 border-t border-[#E9E9E9]">
                    <span className="text-[#777777]">Room Assignment:</span>{' '}
                    <span className="font-semibold">
                      {profileDetail.student.room_number
                        ? `${profileDetail.student.block_name} · ${profileDetail.student.floor_label} · Room ${profileDetail.student.room_number} (${profileDetail.student.bed_label})`
                        : 'Unassigned'}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {profileTab === 'attendance' ? (
              <div className="max-h-[340px] overflow-y-auto divide-y divide-[#E9E9E9] text-[16px] leading-[1.5]">
                {profileDetail.attendanceHistory.length === 0 ? (
                  <p className="py-6 text-center text-[14px] text-[#777777]">No attendance records found.</p>
                ) : (
                  profileDetail.attendanceHistory.map((a) => (
                    <div key={a.id} className="py-2.5 flex items-center justify-between">
                      <span>{a.attendance_date}</span>
                      <span className="text-[14px] text-[#777777]">In: {a.check_in_time || '--'} · Out: {a.check_out_time || '--'}</span>
                      <span className="text-[14px] font-semibold capitalize">{a.status.replace('_', ' ')}</span>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {profileTab === 'leaves' ? (
              <div className="max-h-[340px] overflow-y-auto divide-y divide-[#E9E9E9] text-[16px] leading-[1.5]">
                {profileDetail.leaveHistory.length === 0 ? (
                  <p className="py-6 text-center text-[14px] text-[#777777]">No leave requests recorded.</p>
                ) : (
                  profileDetail.leaveHistory.map((l) => (
                    <div key={l.id} className="py-2.5 flex items-center justify-between gap-4">
                      <div>
                        <span className="font-mono text-[14px] text-[#777777] mr-2">{l.leave_code}</span>
                        <span className="font-medium">{l.reason}</span>
                      </div>
                      <span className="text-[14px] text-[#777777]">{l.departure_at} → {l.expected_return_at}</span>
                      <span className="text-[14px] font-semibold capitalize">{l.status}</span>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {profileTab === 'complaints' ? (
              <div className="max-h-[340px] overflow-y-auto divide-y divide-[#E9E9E9] text-[16px] leading-[1.5]">
                {profileDetail.complaintHistory.length === 0 ? (
                  <p className="py-6 text-center text-[14px] text-[#777777]">No complaints submitted.</p>
                ) : (
                  profileDetail.complaintHistory.map((c) => (
                    <div key={c.id} className="py-2.5 flex items-center justify-between gap-4">
                      <div>
                        <span className="font-mono text-[14px] text-[#777777] mr-2">{c.complaint_code}</span>
                        <span className="font-medium">{c.title}</span>
                      </div>
                      <span className="text-[14px] text-[#777777]">{c.category}</span>
                      <span className="text-[14px] font-semibold capitalize">{c.status.replace('_', ' ')}</span>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {profileTab === 'meals' ? (
              <div className="max-h-[340px] overflow-y-auto divide-y divide-[#E9E9E9] text-[16px] leading-[1.5]">
                {profileDetail.mealHistory.length === 0 ? (
                  <p className="py-6 text-center text-[14px] text-[#777777]">No meal bookings found.</p>
                ) : (
                  profileDetail.mealHistory.map((m) => (
                    <div key={m.id} className="py-2.5 flex items-center justify-between">
                      <span>{m.meal_date} · <strong className="capitalize">{m.meal_type}</strong></span>
                      <span className="font-mono text-[14px] text-[#777777]">{m.booking_code}</span>
                      <span className="text-[14px] font-semibold capitalize">{m.verified_status}</span>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* Allocate / Transfer Room Modal */}
      <Modal
        open={Boolean(allocModalStudent)}
        onClose={() => setAllocModalStudent(null)}
        title={allocModalStudent?.room_id ? 'Transfer Student Room' : 'Allocate Room'}
        subtitle={
          allocModalStudent
            ? `${allocModalStudent.full_name} (${allocModalStudent.student_code})`
            : ''
        }
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAllocModalStudent(null)}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="alloc-room-form"
              disabled={saving}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
            >
              {saving ? 'Assigning...' : 'Confirm Allocation'}
            </button>
          </>
        }
      >
        <form id="alloc-room-form" onSubmit={submitRoomAllocation} className="space-y-4">
          {allocError ? <ErrorBanner message={allocError} /> : null}
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">
              Select Available Room *
            </label>
            <select
              required
              value={allocRoomId}
              onChange={(e) => setAllocRoomId(e.target.value)}
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            >
              <option value="">Choose a room...</option>
              {availableRoomOptions
                .filter((r) => r.id !== allocModalStudent?.room_id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.block_name} — Room {r.room_number} ({r.available_beds}/{r.capacity} beds free)
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929] mb-1">
              Bed Label (Optional)
            </label>
            <input
              value={allocBedLabel}
              onChange={(e) => setAllocBedLabel(e.target.value)}
              placeholder="e.g. Bed B"
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDeactivate)}
        onClose={() => setConfirmDeactivate(null)}
        onConfirm={handleDeactivate}
        loading={saving}
        title="Deactivate Student"
        message={`Are you sure you want to deactivate ${confirmDeactivate?.full_name}? Their active room bed allocation will be released automatically.`}
        confirmLabel="Deactivate"
      />
    </div>
  );
};

