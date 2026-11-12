import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Check, Eye, FileUp, Plus, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, type TableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { EmptyState, ErrorBanner, LoadingState } from '../components/ui/States';

interface LeaveRow {
  id: number;
  leave_code: string;
  student_id: number;
  student_code: string;
  student_name: string;
  student_phone: string;
  guardian_name: string;
  guardian_phone: string;
  room_number: string;
  block_name: string | null;
  reason: string;
  destination: string;
  departure_at: string;
  expected_return_at: string;
  actual_departure_at: string | null;
  actual_return_at: string | null;
  guardian_contact_verified: number;
  supporting_doc_url: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  rejection_reason: string;
  reviewed_by_name: string | null;
}

interface LeaveSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  completed: number;
}

export const LeavesPage: React.FC = () => {
  const { can } = useAuth();
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [summary, setSummary] = useState<LeaveSummary>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    completed: 0,
  });
  const [students, setStudents] = useState<Array<{ id: number; student_code: string; full_name: string }>>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedLeave, setSelectedLeave] = useState<LeaveRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LeaveRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    student_id: '',
    reason: '',
    destination: '',
    departure_at: '',
    expected_return_at: '',
    guardian_contact_verified: true,
    supporting_doc_url: null as string | null,
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadLeaves = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (q.trim()) params.set('q', q.trim());

      const res = await api.get<{ leaves: LeaveRow[]; summary: LeaveSummary }>(
        `/api/leaves?${params.toString()}`,
      );
      setLeaves(res.leaves);
      setSummary(res.summary);
      setSelectedLeave((prev) => (prev ? res.leaves.find((l) => l.id === prev.id) || null : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leave applications');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, q]);

  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  useEffect(() => {
    if (can('leaves', 'create')) {
      api
        .get<{ students: Array<{ id: number; student_code: string; full_name: string }> }>(
          '/api/students?status=active',
        )
        .then((res) => setStudents(res.students))
        .catch(() => {});
    }
  }, [can]);

  const handleApprove = async (leave: LeaveRow) => {
    try {
      await api.post(`/api/leaves/${leave.id}/approve`);
      await loadLeaves();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve leave');
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setSaving(true);
    try {
      await api.post(`/api/leaves/${rejectTarget.id}/reject`, {
        rejection_reason: rejectionReason,
      });
      setRejectTarget(null);
      setRejectionReason('');
      await loadLeaves();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject leave');
    } finally {
      setSaving(false);
    }
  };

  const handleDeparture = async (leave: LeaveRow) => {
    try {
      await api.post(`/api/leaves/${leave.id}/record-departure`);
      await loadLeaves();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record departure');
    }
  };

  const handleReturn = async (leave: LeaveRow) => {
    try {
      await api.post(`/api/leaves/${leave.id}/record-return`);
      await loadLeaves();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record return');
    }
  };

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await api.upload(file);
      setForm((prev) => ({ ...prev, supporting_doc_url: res.url }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const submitNewLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await api.post('/api/leaves', {
        ...form,
        student_id: Number(form.student_id),
      });
      setCreateOpen(false);
      setForm({
        student_id: '',
        reason: '',
        destination: '',
        departure_at: '',
        expected_return_at: '',
        guardian_contact_verified: true,
        supporting_doc_url: null,
      });
      await loadLeaves();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create leave request');
    } finally {
      setSaving(false);
    }
  };

  const statusTextClass = (status: LeaveRow['status']) => {
    if (status === 'approved') return 'text-[#22A06B]';
    if (status === 'rejected') return 'text-[#D9383A]';
    if (status === 'completed') return 'text-[#292929]';
    return 'text-[#C97A16]';
  };

  const columns: TableColumn<LeaveRow>[] = [
    {
      key: 'leave_code',
      header: 'Leave ID',
      render: (r) => <span className="font-mono text-[14px] text-[#777777]">{r.leave_code}</span>,
    },
    {
      key: 'student',
      header: 'Student & Room',
      render: (r) => (
        <div>
          <div className="font-semibold text-[#292929]">{r.student_name}</div>
          <div className="text-[14px] leading-[1.45] text-[#777777]">
            {r.student_code} · Room {r.room_number}
          </div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason & Destination',
      render: (r) => (
        <div className="max-w-[260px]">
          <div className="truncate font-medium text-[#292929]">{r.reason}</div>
          <div className="text-[14px] leading-[1.45] text-[#777777] truncate">{r.destination || 'Local / Unspecified'}</div>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Schedule',
      render: (r) => (
        <div className="text-[14px] leading-[1.45]">
          <div>Out: {r.departure_at.replace('T', ' ')}</div>
          <div className="text-[#777777]">Exp: {r.expected_return_at.replace('T', ' ')}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span className={`text-[14px] font-semibold leading-[1.35] capitalize ${statusTextClass(r.status)}`}>{r.status}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setSelectedLeave(r)}
            className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4]"
            title="View Application"
          >
            <Eye className="w-4 h-4" />
          </button>
          {r.status === 'pending' && can('leaves', 'approve') ? (
            <>
              <button
                type="button"
                onClick={() => handleApprove(r)}
                title="Approve Leave"
                className="p-1.5 rounded-[6px] text-[#22A06B] hover:bg-[#22A06B]/10"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(r);
                  setRejectionReason('');
                }}
                title="Reject Leave"
                className="p-1.5 rounded-[6px] text-[#D9383A] hover:bg-[#D9383A]/10"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : null}
          {r.status === 'approved' && !r.actual_departure_at && can('leaves', 'edit') ? (
            <button
              type="button"
              onClick={() => handleDeparture(r)}
              className="px-3 py-1.5 text-[15px] font-semibold leading-[1.3] bg-[#F4F4F4] text-[#292929] rounded-[6px] hover:bg-[#E9E9E9]"
            >
              Record Exit
            </button>
          ) : null}
          {r.status === 'approved' && r.actual_departure_at && !r.actual_return_at && can('leaves', 'edit') ? (
            <button
              type="button"
              onClick={() => handleReturn(r)}
              className="px-3 py-1.5 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[6px] hover:bg-[#333333]"
            >
              Record Return
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Leave Management"
        subtitle="Review student leave applications, approve or reject requests, and link gate departures"
        actions={
          can('leaves', 'create') ? (
            <button
              type="button"
              onClick={() => {
                setFormError('');
                setCreateOpen(true);
              }}
              className="h-[40px] px-4 rounded-[8px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] flex items-center gap-2 hover:bg-[#333333]"
            >
              <Plus className="w-4 h-4" />
              New Leave Request
            </button>
          ) : null
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadLeaves} /> : null}

      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Requests" value={summary.total || 0} icon={CalendarClock} tone="neutral" />
        <StatCard label="Pending Requests" value={summary.pending || 0} icon={CalendarClock} tone="blue" />
        <StatCard label="Approved" value={summary.approved || 0} icon={Check} tone="lime" />
        <StatCard label="Rejected" value={summary.rejected || 0} icon={X} tone="lavender" />
      </div>

      {/* Filters */}
      <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-4 mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {(['all', 'pending', 'approved', 'rejected', 'completed'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-2 rounded-[8px] text-[15px] font-semibold leading-[1.3] capitalize ${
                statusFilter === st
                  ? 'bg-[#222222] text-white'
                  : 'bg-[#F4F4F4] text-[#292929] hover:bg-[#E9E9E9]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search leave ID, student, reason..."
          className="w-[310px] h-[40px] px-3 text-[16px] font-normal leading-[1.45] bg-[#F4F4F4] rounded-[8px] border border-transparent focus:border-[#E9E9E9] focus:bg-white focus:outline-none"
        />
      </div>

      {loading ? (
        <LoadingState label="Loading leave queue..." />
      ) : leaves.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No leave requests"
          description="There are no leave requests matching the selected filter."
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] overflow-hidden">
          <DataTable
            columns={columns}
            data={leaves}
            rowKey={(r) => r.id}
            onRowClick={(r) => setSelectedLeave(r)}
          />
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        open={Boolean(selectedLeave)}
        onClose={() => setSelectedLeave(null)}
        title={selectedLeave ? `Leave Application ${selectedLeave.leave_code}` : ''}
        subtitle={
          selectedLeave
            ? `${selectedLeave.student_name} (${selectedLeave.student_code}) · Room ${selectedLeave.room_number}`
            : ''
        }
        maxWidth="md"
      >
        {selectedLeave ? (
          <div className="space-y-4 text-[16px] leading-[1.5]">
            <div className="grid grid-cols-2 gap-4 bg-[#F4F4F4] rounded-[10px] p-4">
              <div>
                <div className="text-[13px] font-semibold uppercase tracking-wide text-[#777777]">Status</div>
                <div className={`text-[14px] font-semibold capitalize mt-0.5 ${statusTextClass(selectedLeave.status)}`}>
                  {selectedLeave.status}
                </div>
              </div>
              <div>
                <div className="text-[13px] font-semibold uppercase tracking-wide text-[#777777]">Guardian Info</div>
                <div className="font-medium text-[#292929] mt-0.5">
                  {selectedLeave.guardian_name} ({selectedLeave.guardian_phone})
                </div>
              </div>
              <div>
                <div className="text-[13px] font-semibold uppercase tracking-wide text-[#777777]">Planned Departure</div>
                <div className="mt-0.5">{selectedLeave.departure_at.replace('T', ' ')}</div>
              </div>
              <div>
                <div className="text-[13px] font-semibold uppercase tracking-wide text-[#777777]">Expected Return</div>
                <div className="mt-0.5">{selectedLeave.expected_return_at.replace('T', ' ')}</div>
              </div>
              <div>
                <div className="text-[13px] font-semibold uppercase tracking-wide text-[#777777]">Actual Departure</div>
                <div className="mt-0.5">{selectedLeave.actual_departure_at?.replace('T', ' ') || 'Not recorded'}</div>
              </div>
              <div>
                <div className="text-[13px] font-semibold uppercase tracking-wide text-[#777777]">Actual Return</div>
                <div className="mt-0.5">{selectedLeave.actual_return_at?.replace('T', ' ') || 'Not recorded'}</div>
              </div>
            </div>

            <div>
              <div className="font-slab text-[15px] font-normal uppercase tracking-wide text-[#777777] mb-1">Reason & Destination</div>
              <p className="text-[#292929]">{selectedLeave.reason}</p>
              {selectedLeave.destination ? (
                <p className="text-[14px] text-[#777777] mt-1">Destination: {selectedLeave.destination}</p>
              ) : null}
            </div>

            {selectedLeave.supporting_doc_url ? (
              <div>
                <a
                  href={selectedLeave.supporting_doc_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[15px] font-semibold underline text-[#292929]"
                >
                  View Supporting Document
                </a>
              </div>
            ) : null}

            {selectedLeave.rejection_reason ? (
              <div className="p-3 bg-[#D9383A]/10 border border-[#D9383A]/25 rounded-[8px] text-[#D9383A]">
                <strong>Rejection Reason:</strong> {selectedLeave.rejection_reason}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E9E9E9]">
              {selectedLeave.status === 'pending' && can('leaves', 'approve') ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectTarget(selectedLeave);
                      setRejectionReason('');
                    }}
                    className="px-4 py-2 text-[15px] font-semibold leading-[1.3] text-[#D9383A] border border-[#D9383A]/30 rounded-[8px] hover:bg-[#D9383A]/10"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(selectedLeave)}
                    className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px] hover:bg-[#333333]"
                  >
                    Approve Leave
                  </button>
                </>
              ) : null}
              {selectedLeave.status === 'approved' && !selectedLeave.actual_departure_at && can('leaves', 'edit') ? (
                <button
                  type="button"
                  onClick={() => handleDeparture(selectedLeave)}
                  className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
                >
                  Record Actual Departure
                </button>
              ) : null}
              {selectedLeave.status === 'approved' &&
              selectedLeave.actual_departure_at &&
              !selectedLeave.actual_return_at &&
              can('leaves', 'edit') ? (
                <button
                  type="button"
                  onClick={() => handleReturn(selectedLeave)}
                  className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
                >
                  Record Actual Return
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Reject Reason Modal */}
      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title={`Reject Leave ${rejectTarget?.leave_code || ''}`}
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="reject-leave-form"
              disabled={saving}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#D9383A] text-white rounded-[8px]"
            >
              Confirm Rejection
            </button>
          </>
        }
      >
        <form id="reject-leave-form" onSubmit={handleReject} className="space-y-3">
          <label className="block text-[15px] font-semibold leading-[1.4] text-[#292929]">
            Rejection Reason *
          </label>
          <textarea
            required
            rows={3}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="State clear reason for rejecting this leave application..."
            className="w-full p-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
          />
        </form>
      </Modal>

      {/* Create Leave Request Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Leave Application"
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
              form="create-leave-form"
              disabled={saving}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
            >
              {saving ? 'Submitting...' : 'Submit Application'}
            </button>
          </>
        }
      >
        <form id="create-leave-form" onSubmit={submitNewLeave} className="space-y-4">
          {formError ? <ErrorBanner message={formError} /> : null}
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Student *</label>
            <select
              required
              value={form.student_id}
              onChange={(e) => setForm({ ...form, student_id: e.target.value })}
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            >
              <option value="">Select active student...</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.student_code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Departure Date & Time *</label>
              <input
                type="datetime-local"
                required
                value={form.departure_at}
                onChange={(e) => setForm({ ...form, departure_at: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Expected Return Date & Time *</label>
              <input
                type="datetime-local"
                required
                value={form.expected_return_at}
                onChange={(e) => setForm({ ...form, expected_return_at: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Destination</label>
            <input
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
              placeholder="City / hometown"
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Leave Reason *</label>
            <textarea
              required
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full p-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <label className="inline-flex items-center gap-2 text-[15px] font-semibold text-[#292929]">
              <input
                type="checkbox"
                checked={form.guardian_contact_verified}
                onChange={(e) => setForm({ ...form, guardian_contact_verified: e.target.checked })}
              />
              Guardian Informed / Verified
            </label>
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px] cursor-pointer hover:bg-[#F4F4F4]">
              <FileUp className="w-4 h-4 text-[#777777]" />
              {form.supporting_doc_url ? 'Document Attached' : 'Supporting Document'}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleUploadDoc} className="hidden" />
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
};

