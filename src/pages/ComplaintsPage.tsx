import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  FileUp,
  MessageSquareWarning,
  Plus,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, type TableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { EmptyState, ErrorBanner, LoadingState } from '../components/ui/States';

const CATEGORIES = [
  'Electrical',
  'Plumbing',
  'Cleaning',
  'Wi-Fi',
  'Food',
  'Room maintenance',
  'Other',
] as const;

interface ComplaintRow {
  id: number;
  complaint_code: string;
  student_id: number;
  student_name: string;
  student_code: string;
  room_number: string;
  block_name: string | null;
  category: string;
  title: string;
  description: string;
  photo_urls: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'reopened';
  assigned_staff_id: number | null;
  assigned_staff_name: string | null;
  resolution_notes: string;
  remarks: Array<{ author: string; text: string; at: string }>;
  created_at: string;
}

interface StaffOption {
  id: number;
  staff_code: string;
  full_name: string;
  designation: string;
  role: string;
}

export const ComplaintsPage: React.FC = () => {
  const { user, can } = useAuth();
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, open: 0, in_progress: 0, resolved: 0 });
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [students, setStudents] = useState<Array<{ id: number; student_code: string; full_name: string }>>([]);

  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<ComplaintRow | null>(null);
  const [remarkInput, setRemarkInput] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [assignStaffId, setAssignStaffId] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    student_id: '',
    category: 'Electrical',
    title: '',
    description: '',
    priority: 'medium',
    photo_urls: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  const loadComplaints = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (q.trim()) params.set('q', q.trim());

      const res = await api.get<{
        complaints: ComplaintRow[];
        summary: { total: number; open: number; in_progress: number; resolved: number };
        staffOptions: StaffOption[];
      }>(`/api/complaints?${params.toString()}`);
      setComplaints(res.complaints);
      setSummary(res.summary);
      setStaffOptions(res.staffOptions);
      setSelected((prev) => {
        if (!prev) return null;
        const found = res.complaints.find((c) => c.id === prev.id) || null;
        if (found) {
          setAssignStaffId(found.assigned_staff_id ? String(found.assigned_staff_id) : '');
          setResolutionNotes(found.resolution_notes || '');
        }
        return found;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load complaints');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, priorityFilter, q]);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  useEffect(() => {
    if (can('complaints', 'create')) {
      api
        .get<{ students: Array<{ id: number; student_code: string; full_name: string }> }>(
          '/api/students?status=active',
        )
        .then((res) => setStudents(res.students))
        .catch(() => {});
    }
  }, [can]);

  const openDetail = (c: ComplaintRow) => {
    setSelected(c);
    setAssignStaffId(c.assigned_staff_id ? String(c.assigned_staff_id) : '');
    setResolutionNotes(c.resolution_notes || '');
    setRemarkInput('');
  };

  const assignStaff = async () => {
    if (!selected || !assignStaffId) return;
    setSaving(true);
    try {
      await api.post(`/api/complaints/${selected.id}/assign`, { staff_id: Number(assignStaffId) });
      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign staff');
    } finally {
      setSaving(false);
    }
  };

  const changePriority = async (priority: string) => {
    if (!selected) return;
    try {
      await api.patch(`/api/complaints/${selected.id}/priority`, { priority });
      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change priority');
    }
  };

  const updateStatus = async (status: 'in_progress' | 'resolved' | 'reopened') => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.patch(`/api/complaints/${selected.id}/status`, {
        status,
        resolution_notes: status === 'resolved' ? resolutionNotes : undefined,
      });
      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const addRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !remarkInput.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/complaints/${selected.id}/remarks`, { text: remarkInput.trim() });
      setRemarkInput('');
      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add remark');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await api.upload(file);
      setCreateForm((prev) => ({ ...prev, photo_urls: [...prev.photo_urls, up.url] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed');
    }
  };

  const submitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/complaints', {
        ...createForm,
        student_id: Number(createForm.student_id),
      });
      setCreateOpen(false);
      setCreateForm({
        student_id: '',
        category: 'Electrical',
        title: '',
        description: '',
        priority: 'medium',
        photo_urls: [],
      });
      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit complaint');
    } finally {
      setSaving(false);
    }
  };

  const priorityColor = (p: string) => {
    if (p === 'urgent') return 'text-[#D9383A] font-bold';
    if (p === 'high') return 'text-[#C97A16] font-semibold';
    if (p === 'medium') return 'text-[#292929] font-medium';
    return 'text-[#777777]';
  };

  const statusColor = (s: string) => {
    if (s === 'resolved') return 'text-[#22A06B]';
    if (s === 'open' || s === 'reopened') return 'text-[#D9383A]';
    return 'text-[#C97A16]';
  };

  const columns: TableColumn<ComplaintRow>[] = [
    {
      key: 'code',
      header: 'Ticket ID',
      render: (r) => <span className="font-mono text-[14px] text-[#777777]">{r.complaint_code}</span>,
    },
    {
      key: 'title',
      header: 'Issue & Category',
      render: (r) => (
        <div>
          <div className="font-semibold text-[#292929]">{r.title}</div>
          <div className="text-[14px] leading-[1.45] text-[#777777]">{r.category}</div>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student & Room',
      render: (r) => (
        <div>
          <div className="text-[#292929]">{r.student_name}</div>
          <div className="text-[14px] leading-[1.45] text-[#777777]">Room {r.room_number}</div>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (r) => <span className={`text-[14px] leading-[1.35] capitalize ${priorityColor(r.priority)}`}>{r.priority}</span>,
    },
    {
      key: 'staff',
      header: 'Assigned Staff',
      render: (r) => <span className="text-[#777777]">{r.assigned_staff_name || 'Unassigned'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (r) => (
        <span className={`text-[14px] font-semibold leading-[1.35] capitalize ${statusColor(r.status)}`}>
          {r.status.replace('_', ' ')}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Complaints Management"
        subtitle="Track maintenance issues, assign staff, monitor progress, and record resolutions"
        actions={
          can('complaints', 'create') ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="h-[40px] px-4 rounded-[8px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] flex items-center gap-2 hover:bg-[#333333]"
            >
              <Plus className="w-4 h-4" />
              Log Complaint
            </button>
          ) : null
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadComplaints} /> : null}

      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Complaints" value={summary.total || 0} icon={MessageSquareWarning} tone="neutral" />
        <StatCard label="Open / Reopened" value={summary.open || 0} icon={MessageSquareWarning} tone="lime" />
        <StatCard label="Assigned / In Progress" value={summary.in_progress || 0} icon={Wrench} tone="blue" />
        <StatCard label="Resolved" value={summary.resolved || 0} icon={CheckCircle2} tone="lavender" />
      </div>

      {/* Filters */}
      <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-4 mb-5 flex items-center justify-between gap-4">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ticket ID, issue, student, room..."
          className="w-[320px] h-[40px] px-3 text-[16px] font-normal leading-[1.45] bg-[#F4F4F4] rounded-[8px] border border-transparent focus:border-[#E9E9E9] focus:bg-white focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] bg-white"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter by priority"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] bg-white"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="reopened">Reopened</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading complaints..." />
      ) : complaints.length === 0 ? (
        <EmptyState
          icon={MessageSquareWarning}
          title="No complaints found"
          description="No tickets match the selected filters."
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] overflow-hidden">
          <DataTable
            columns={columns}
            data={complaints}
            rowKey={(r) => r.id}
            onRowClick={openDetail}
          />
        </div>
      )}

      {/* Ticket Detail Modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.complaint_code} — ${selected.title}` : ''}
        subtitle={
          selected
            ? `${selected.category} · ${selected.student_name} (Room ${selected.room_number}) · Submitted ${selected.created_at.slice(0, 10)}`
            : ''
        }
        maxWidth="lg"
      >
        {selected ? (
          <div className="space-y-5 text-[16px] leading-[1.5]">
            <div className="p-4 bg-[#F4F4F4] rounded-[10px]">
              <p className="text-[#292929] leading-[1.5]">{selected.description}</p>
              {selected.photo_urls.length > 0 ? (
                <div className="flex gap-3 mt-3">
                  {selected.photo_urls.map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt="Complaint attachment"
                        className="w-20 h-20 object-cover rounded-[8px] border border-[#E9E9E9]"
                      />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Staff Assignment & Priority Controls */}
            {can('complaints', 'approve') ? (
              <div className="grid grid-cols-2 gap-4 border border-[#E9E9E9] rounded-[10px] p-4">
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] mb-1.5">Assign Maintenance Staff</label>
                  <div className="flex gap-2">
                    <select
                      value={assignStaffId}
                      onChange={(e) => setAssignStaffId(e.target.value)}
                      className="flex-1 h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                    >
                      <option value="">Select staff...</option>
                      {staffOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({s.designation})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={assignStaff}
                      disabled={!assignStaffId || saving}
                      className="px-4 h-[40px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px] disabled:opacity-50"
                    >
                      Assign
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[15px] font-semibold leading-[1.4] mb-1.5">Priority</label>
                  <select
                    value={selected.priority}
                    onChange={(e) => changePriority(e.target.value)}
                    className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
            ) : null}

            {/* Resolution Notes & Status Actions */}
            {can('complaints', 'edit') ? (
              <div className="border border-[#E9E9E9] rounded-[10px] p-4 space-y-3">
                <label className="block text-[15px] font-semibold leading-[1.4]">Resolution Notes</label>
                <textarea
                  rows={2}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Enter resolution summary before marking resolved..."
                  className="w-full p-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                />
                <div className="flex items-center gap-2">
                  {selected.status !== 'in_progress' && selected.status !== 'resolved' ? (
                    <button
                      type="button"
                      onClick={() => updateStatus('in_progress')}
                      disabled={saving}
                      className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px] hover:bg-[#F4F4F4]"
                    >
                      Mark In Progress
                    </button>
                  ) : null}
                  {selected.status !== 'resolved' ? (
                    <button
                      type="button"
                      onClick={() => updateStatus('resolved')}
                      disabled={saving}
                      className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#22A06B] text-white rounded-[8px]"
                    >
                      Resolve Complaint
                    </button>
                  ) : null}
                  {selected.status === 'resolved' && user?.role !== 'maintenance_staff' ? (
                    <button
                      type="button"
                      onClick={() => updateStatus('reopened')}
                      disabled={saving}
                      className="px-4 py-2 text-[15px] font-semibold leading-[1.3] text-[#D9383A] border border-[#D9383A]/30 rounded-[8px] inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reopen Complaint
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Remarks Log */}
            <div>
              <h3 className="font-slab text-[15px] font-normal uppercase tracking-wide text-[#777777] mb-2">Progress & Remarks</h3>
              <div className="space-y-2 max-h-[180px] overflow-y-auto mb-3">
                {selected.remarks.length === 0 ? (
                  <p className="text-[#777777] text-[14px] leading-[1.45]">No remarks added yet.</p>
                ) : (
                  selected.remarks.map((r, i) => (
                    <div key={i} className="p-3 bg-[#F9F9F9] border border-[#E9E9E9] rounded-[8px]">
                      <div className="flex items-center justify-between text-[14px] leading-[1.4] text-[#777777]">
                        <strong className="text-[#292929] font-semibold">{r.author}</strong>
                        <span>{r.at.replace('T', ' ')}</span>
                      </div>
                      <p className="text-[16px] leading-[1.45] mt-1">{r.text}</p>
                    </div>
                  ))
                )}
              </div>
              {can('complaints', 'edit') ? (
                <form onSubmit={addRemark} className="flex gap-2">
                  <input
                    value={remarkInput}
                    onChange={(e) => setRemarkInput(e.target.value)}
                    placeholder="Add progress remark..."
                    className="flex-1 h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                  <button
                    type="submit"
                    disabled={saving || !remarkInput.trim()}
                    className="px-4 h-[40px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px] disabled:opacity-50"
                  >
                    Add Remark
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Log Complaint Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Log Hostel Complaint"
        maxWidth="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="complaint-form"
              disabled={saving}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
            >
              {saving ? 'Submitting...' : 'Submit Complaint'}
            </button>
          </>
        }
      >
        <form id="complaint-form" onSubmit={submitComplaint} className="space-y-4">
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Student *</label>
            <select
              required
              value={createForm.student_id}
              onChange={(e) => setCreateForm({ ...createForm, student_id: e.target.value })}
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            >
              <option value="">Select student...</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.student_code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Category *</label>
              <select
                value={createForm.category}
                onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Priority *</label>
              <select
                value={createForm.priority}
                onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Title *</label>
            <input
              required
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              placeholder="Brief issue summary"
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Description *</label>
            <textarea
              required
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              className="w-full p-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>
          <div>
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px] cursor-pointer hover:bg-[#F4F4F4]">
              <FileUp className="w-4 h-4 text-[#777777]" />
              Attach Photo ({createForm.photo_urls.length})
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
};

