import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, type TableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { EmptyState, ErrorBanner, LoadingState } from '../components/ui/States';

interface MovementRow {
  id: number;
  student_id: number;
  student_code: string;
  student_name: string;
  room_number: string;
  leave_code: string | null;
  exit_time: string;
  expected_return_time: string;
  actual_return_time: string | null;
  status: 'outside' | 'returned' | 'late_return';
  exit_remarks: string;
  entry_remarks: string;
}

interface ActiveStudentState {
  id: number;
  student_code: string;
  full_name: string;
  room_number: string;
  is_outside: number;
  active_approved_leave_id: number | null;
}

interface AttendanceRecordRow {
  student_id: number;
  student_code: string;
  full_name: string;
  room_number: string;
  status: 'present' | 'absent' | 'on_leave';
  check_in_time: string;
  check_out_time: string;
  remarks: string;
}

interface MovementOverview {
  summary: {
    insideCount: number;
    outsideCount: number;
    expectedReturnsToday: number;
    lateReturnsCount: number;
  };
  movements: MovementRow[];
  students: ActiveStudentState[];
  attendanceDate: string;
  attendanceRows: AttendanceRecordRow[];
}

export const MovementsPage: React.FC = () => {
  const { can } = useAuth();
  const [tab, setTab] = useState<'movements' | 'attendance'>('movements');
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState('');
  const [data, setData] = useState<MovementOverview | null>(null);
  const [draftAttendance, setDraftAttendance] = useState<AttendanceRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    student_id: '',
    expected_return_time: '',
    exit_remarks: '',
  });
  const [checkinTarget, setCheckinTarget] = useState<MovementRow | null>(null);
  const [entryRemarks, setEntryRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({ date: attendanceDate });
      if (q.trim()) params.set('q', q.trim());
      const res = await api.get<MovementOverview>(`/api/movements/overview?${params.toString()}`);
      setData(res);
      setDraftAttendance(res.attendanceRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load movement & attendance');
    } finally {
      setLoading(false);
    }
  }, [attendanceDate, q]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const submitCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/api/movements/checkout', {
        student_id: Number(checkoutForm.student_id),
        expected_return_time: checkoutForm.expected_return_time,
        exit_remarks: checkoutForm.exit_remarks,
      });
      setCheckoutOpen(false);
      setCheckoutForm({ student_id: '', expected_return_time: '', exit_remarks: '' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record exit');
    } finally {
      setSaving(false);
    }
  };

  const submitCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkinTarget) return;
    setSaving(true);
    try {
      await api.post('/api/movements/checkin', {
        movement_id: checkinTarget.id,
        entry_remarks: entryRemarks,
      });
      setCheckinTarget(null);
      setEntryRemarks('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record entry');
    } finally {
      setSaving(false);
    }
  };

  const updateDraftAtt = (studentId: number, patch: Partial<AttendanceRecordRow>) => {
    setDraftAttendance((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, ...patch } : r)),
    );
  };

  const saveAttendance = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post('/api/movements/attendance', {
        attendance_date: attendanceDate,
        records: draftAttendance.map((r) => ({
          student_id: r.student_id,
          status: r.status,
          check_in_time: r.check_in_time,
          check_out_time: r.check_out_time,
          remarks: r.remarks,
        })),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <LoadingState label="Loading movement register & attendance..." />;
  if (!data) return <ErrorBanner message={error || 'Unable to load movements'} onRetry={loadData} />;

  const insideStudents = data.students.filter((s) => s.is_outside === 0);

  const movementCols: TableColumn<MovementRow>[] = [
    {
      key: 'student',
      header: 'Student',
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
      key: 'leave',
      header: 'Linked Leave',
      render: (r) => (
        <span className="font-mono text-[14px] text-[#777777]">{r.leave_code || 'Gate Pass'}</span>
      ),
    },
    {
      key: 'exit',
      header: 'Exit Time',
      render: (r) => <span className="text-[16px] leading-[1.45]">{r.exit_time.replace('T', ' ')}</span>,
    },
    {
      key: 'expected',
      header: 'Expected Return',
      render: (r) => <span className="text-[16px] leading-[1.45]">{r.expected_return_time.replace('T', ' ')}</span>,
    },
    {
      key: 'actual',
      header: 'Actual Return',
      render: (r) => (
        <span className="text-[16px] leading-[1.45] text-[#777777]">
          {r.actual_return_time ? r.actual_return_time.replace('T', ' ') : '--'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span
          className={`text-[14px] font-semibold leading-[1.35] ${
            r.status === 'returned'
              ? 'text-[#22A06B]'
              : r.status === 'late_return'
                ? 'text-[#D9383A]'
                : 'text-[#C97A16]'
          }`}
        >
          {r.status === 'late_return' ? 'Late Return' : r.status === 'outside' ? 'Outside' : 'Returned'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (r) =>
        r.status === 'outside' && can('movements', 'edit') ? (
          <button
            type="button"
            onClick={() => {
              setCheckinTarget(r);
              setEntryRemarks('');
            }}
            className="px-3 py-1.5 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[6px] inline-flex items-center gap-1.5 hover:bg-[#333333]"
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            Check In
          </button>
        ) : (
          <span className="text-[14px] text-[#777777]">Logged</span>
        ),
    },
  ];

  const presentCount = draftAttendance.filter((a) => a.status === 'present').length;
  const absentCount = draftAttendance.filter((a) => a.status === 'absent').length;

  return (
    <div>
      <PageHeader
        title="Movement & Attendance"
        subtitle="Monitor gate check-in/check-out movements, late returns, and daily hostel attendance"
        actions={
          can('movements', 'create') ? (
            <button
              type="button"
              onClick={() => {
                const defaultReturn = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 16);
                setCheckoutForm({ student_id: '', expected_return_time: defaultReturn, exit_remarks: '' });
                setCheckoutOpen(true);
              }}
              className="h-[40px] px-4 rounded-[8px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] flex items-center gap-2 hover:bg-[#333333]"
            >
              <ArrowUpRight className="w-4 h-4" />
              Record Student Exit
            </button>
          ) : null
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadData} /> : null}

      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Inside Hostel" value={data.summary.insideCount} icon={Users} tone="blue" />
        <StatCard label="Outside Hostel" value={data.summary.outsideCount} icon={ArrowUpRight} tone="lime" />
        <StatCard label="Expected Returns Today" value={data.summary.expectedReturnsToday} icon={Activity} tone="lavender" />
        <StatCard label="Late Returns" value={data.summary.lateReturnsCount} icon={AlertTriangle} tone="neutral" />
      </div>

      {/* Tab & Filter Strip */}
      <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-4 mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('movements')}
            className={`px-4 py-2 rounded-[8px] text-[15px] font-semibold leading-[1.3] ${
              tab === 'movements' ? 'bg-[#222222] text-white' : 'bg-[#F4F4F4] text-[#292929]'
            }`}
          >
            Movement Register
          </button>
          <button
            type="button"
            onClick={() => setTab('attendance')}
            className={`px-4 py-2 rounded-[8px] text-[15px] font-semibold leading-[1.3] ${
              tab === 'attendance' ? 'bg-[#222222] text-white' : 'bg-[#F4F4F4] text-[#292929]'
            }`}
          >
            Daily Attendance ({presentCount} Present · {absentCount} Absent)
          </button>
        </div>

        {tab === 'movements' ? (
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search student or room..."
            className="w-[290px] h-[40px] px-3 text-[16px] font-normal leading-[1.45] bg-[#F4F4F4] rounded-[8px] focus:outline-none"
          />
        ) : (
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
            {can('movements', 'edit') ? (
              <button
                type="button"
                onClick={saveAttendance}
                disabled={saving}
                className="h-[40px] px-4 bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px] inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Attendance'}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {tab === 'movements' ? (
        data.movements.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No movement records"
            description="Record student check-outs and check-ins to track movements."
          />
        ) : (
          <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] overflow-hidden">
            <DataTable columns={movementCols} data={data.movements} rowKey={(r) => r.id} />
          </div>
        )
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E9E9E9] text-[15px] font-semibold leading-[1.4] text-[#292929]">
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Room No</th>
                <th className="py-3 px-4">Check In</th>
                <th className="py-3 px-4">Check Out</th>
                <th className="py-3 px-4">Attendance Status</th>
                <th className="py-3 px-4">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E9E9] text-[16px] leading-[1.45]">
              {draftAttendance.map((row) => (
                <tr key={row.student_id}>
                  <td className="py-2.5 px-4">
                    <div className="font-semibold">{row.full_name}</div>
                    <div className="text-[14px] leading-[1.45] text-[#777777]">{row.student_code}</div>
                  </td>
                  <td className="py-2.5 px-4">{row.room_number}</td>
                  <td className="py-2.5 px-4">
                    <input
                      value={row.check_in_time}
                      onChange={(e) => updateDraftAtt(row.student_id, { check_in_time: e.target.value })}
                      placeholder="07:45 PM"
                      className="w-[120px] h-[36px] px-2.5 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[6px]"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      value={row.check_out_time}
                      onChange={(e) => updateDraftAtt(row.student_id, { check_out_time: e.target.value })}
                      placeholder="09:15 AM"
                      className="w-[120px] h-[36px] px-2.5 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[6px]"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <select
                      value={row.status}
                      onChange={(e) =>
                        updateDraftAtt(row.student_id, {
                          status: e.target.value as 'present' | 'absent' | 'on_leave',
                        })
                      }
                      className="h-[36px] px-2.5 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[6px] bg-white"
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="on_leave">On Leave</option>
                    </select>
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      value={row.remarks}
                      onChange={(e) => updateDraftAtt(row.student_id, { remarks: e.target.value })}
                      placeholder="Optional note"
                      className="w-full h-[36px] px-2.5 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[6px]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Exit Modal */}
      <Modal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title="Record Student Exit"
        subtitle="Students already marked outside cannot be checked out again."
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCheckoutOpen(false)}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="checkout-form"
              disabled={saving}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
            >
              {saving ? 'Recording...' : 'Confirm Exit'}
            </button>
          </>
        }
      >
        <form id="checkout-form" onSubmit={submitCheckout} className="space-y-4">
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Student Currently Inside *</label>
            <select
              required
              value={checkoutForm.student_id}
              onChange={(e) => setCheckoutForm({ ...checkoutForm, student_id: e.target.value })}
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            >
              <option value="">Select student...</option>
              {insideStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.student_code} · Room {s.room_number})
                  {s.active_approved_leave_id ? ' [Has Approved Leave]' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Expected Return Date & Time *</label>
            <input
              type="datetime-local"
              required
              value={checkoutForm.expected_return_time}
              onChange={(e) => setCheckoutForm({ ...checkoutForm, expected_return_time: e.target.value })}
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Gate Remarks</label>
            <input
              value={checkoutForm.exit_remarks}
              onChange={(e) => setCheckoutForm({ ...checkoutForm, exit_remarks: e.target.value })}
              placeholder="Purpose / destination"
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>
        </form>
      </Modal>

      {/* Check-In Modal */}
      <Modal
        open={Boolean(checkinTarget)}
        onClose={() => setCheckinTarget(null)}
        title={`Record Entry — ${checkinTarget?.student_name || ''}`}
        subtitle={`Expected return: ${checkinTarget?.expected_return_time.replace('T', ' ')}`}
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCheckinTarget(null)}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="checkin-form"
              disabled={saving}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
            >
              {saving ? 'Recording...' : 'Confirm Check-In'}
            </button>
          </>
        }
      >
        <form id="checkin-form" onSubmit={submitCheckin} className="space-y-3">
          <label className="block text-[15px] font-semibold leading-[1.4]">Entry Remarks (Optional)</label>
          <textarea
            rows={3}
            value={entryRemarks}
            onChange={(e) => setEntryRemarks(e.target.value)}
            placeholder="Gate check remarks or late return explanation..."
            className="w-full p-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
          />
        </form>
      </Modal>
    </div>
  );
};

