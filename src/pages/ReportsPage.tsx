import React, { useCallback, useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { BarChart3, Download, FileSpreadsheet } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { ErrorBanner, LoadingState } from '../components/ui/States';

type ReportDomain =
  | 'students'
  | 'rooms'
  | 'attendance'
  | 'leaves'
  | 'complaints'
  | 'mess'
  | 'movements';

interface ReportsPayload {
  students: {
    counts: { total: number; active: number; inactive: number };
    blockDistribution: Array<{ block_id: number; block_name: string; student_count: number }>;
  };
  rooms: {
    blockOccupancy: Array<{
      block_id: number;
      block_name: string;
      total_rooms: number;
      total_beds: number;
      occupied_beds: number;
      maintenance_rooms: number;
    }>;
  };
  attendance: {
    summary: { total_records: number; present_count: number; absent_count: number; on_leave_count: number };
    trend: Array<{ date: string; present: number; absent: number; on_leave: number }>;
  };
  leaves: {
    summary: { total: number; pending: number; approved: number; rejected: number; completed: number };
    records: Array<{
      leave_code: string;
      student_name: string;
      room_number: string;
      reason: string;
      departure_at: string;
      expected_return_at: string;
      status: string;
    }>;
  };
  complaints: {
    byCategory: Array<{ category: string; total: number; resolved: number; pending: number }>;
    metrics: { total: number; resolved: number; avg_resolution_hours: number | null; resolutionRatePct: number };
  };
  mess: {
    byMeal: Array<{ meal_type: string; total_booked: number; served: number; unused: number }>;
  };
  movements: {
    summary: { total_exits: number; total_entries: number; currently_outside: number; late_returns: number };
    logs: Array<{
      id: number;
      student_name: string;
      student_code: string;
      room_number: string;
      exit_time: string;
      expected_return_time: string;
      actual_return_time: string | null;
      status: string;
    }>;
  };
}

const REPORT_TABS: Array<{ key: ReportDomain; label: string }> = [
  { key: 'students', label: 'Student Reports' },
  { key: 'rooms', label: 'Room Reports' },
  { key: 'attendance', label: 'Attendance Reports' },
  { key: 'leaves', label: 'Leave Reports' },
  { key: 'complaints', label: 'Complaint Reports' },
  { key: 'mess', label: 'Mess Reports' },
  { key: 'movements', label: 'Movement Reports' },
];

export const ReportsPage: React.FC = () => {
  const [domain, setDomain] = useState<ReportDomain>('students');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [blockId, setBlockId] = useState('all');
  const [blocks, setBlocks] = useState<Array<{ id: number; name: string }>>([]);
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReports = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (blockId !== 'all') params.set('blockId', blockId);
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      const res = await api.get<ReportsPayload>(`/api/reports?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [blockId, fromDate, toDate]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    api
      .get<{ blocks: Array<{ id: number; name: string }> }>('/api/rooms/overview')
      .then((res) => setBlocks(res.blocks))
      .catch(() => {});
  }, []);

  const getExportTable = (): { title: string; headers: string[]; rows: Array<Array<string | number>> } => {
    if (!data) return { title: 'HM Trcc Report', headers: [], rows: [] };
    switch (domain) {
      case 'students':
        return {
          title: 'HM Trcc — Block-Wise Student Distribution',
          headers: ['Block', 'Assigned Students'],
          rows: data.students.blockDistribution.map((b) => [b.block_name, b.student_count]),
        };
      case 'rooms':
        return {
          title: 'HM Trcc — Block-Wise Room Occupancy Report',
          headers: ['Block', 'Total Rooms', 'Total Beds', 'Occupied Beds', 'Available Beds', 'Maintenance Rooms'],
          rows: data.rooms.blockOccupancy.map((r) => [
            r.block_name,
            r.total_rooms,
            r.total_beds,
            r.occupied_beds,
            Math.max(0, r.total_beds - r.occupied_beds),
            r.maintenance_rooms || 0,
          ]),
        };
      case 'attendance':
        return {
          title: 'HM Trcc — Daily Attendance Trend',
          headers: ['Date', 'Present', 'Absent', 'On Leave'],
          rows: data.attendance.trend.map((t) => [t.date, t.present, t.absent, t.on_leave]),
        };
      case 'leaves':
        return {
          title: 'HM Trcc — Leave Applications Report',
          headers: ['Leave ID', 'Student', 'Room', 'Reason', 'Departure', 'Expected Return', 'Status'],
          rows: data.leaves.records.map((l) => [
            l.leave_code,
            l.student_name,
            l.room_number,
            l.reason,
            l.departure_at,
            l.expected_return_at,
            l.status,
          ]),
        };
      case 'complaints':
        return {
          title: 'HM Trcc — Category-Wise Complaint Report',
          headers: ['Category', 'Total', 'Resolved', 'Pending'],
          rows: data.complaints.byCategory.map((c) => [c.category, c.total, c.resolved, c.pending]),
        };
      case 'mess':
        return {
          title: 'HM Trcc — Meal-Wise Mess Consumption Report',
          headers: ['Meal Type', 'Booked', 'Served', 'Unused'],
          rows: data.mess.byMeal.map((m) => [m.meal_type.toUpperCase(), m.total_booked, m.served, m.unused]),
        };
      case 'movements':
        return {
          title: 'HM Trcc — Student Movement Report',
          headers: ['Student', 'ID', 'Room', 'Exit Time', 'Expected Return', 'Actual Return', 'Status'],
          rows: data.movements.logs.map((m) => [
            m.student_name,
            m.student_code,
            m.room_number,
            m.exit_time,
            m.expected_return_time,
            m.actual_return_time || '--',
            m.status,
          ]),
        };
    }
  };

  const exportPdf = () => {
    const { title, headers, rows } = getExportTable();
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(title, 14, 18);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 24);
    autoTable(doc, {
      startY: 30,
      head: [headers],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [34, 34, 34] },
    });
    doc.save(`hm-trcc-${domain}-report.pdf`);
  };

  const exportExcel = async () => {
    const { title, headers, rows } = getExportTable();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(domain.toUpperCase());
    sheet.addRow([title]);
    sheet.addRow([]);
    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(row);
    }
    const buf = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hm-trcc-${domain}-report.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) return <LoadingState label="Generating operational reports..." />;
  if (!data) return <ErrorBanner message={error || 'Unable to load reports'} onRetry={loadReports} />;

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Operational hostel analytics derived from live database records with PDF and Excel exports"
        actions={
          <>
            <button
              type="button"
              onClick={exportPdf}
              className="h-[40px] px-4 rounded-[8px] border border-[#E9E9E9] bg-white text-[15px] font-semibold leading-[1.3] text-[#292929] flex items-center gap-2 hover:bg-[#F4F4F4]"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
            <button
              type="button"
              onClick={exportExcel}
              className="h-[40px] px-4 rounded-[8px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] flex items-center gap-2 hover:bg-[#333333]"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export Excel
            </button>
          </>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadReports} /> : null}

      {/* Domain Tabs & Filters */}
      <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-4 mb-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {REPORT_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setDomain(t.key)}
              className={`px-3.5 py-2 rounded-[8px] text-[15px] font-semibold leading-[1.3] ${
                domain === t.key ? 'bg-[#222222] text-white' : 'bg-[#F4F4F4] text-[#292929] hover:bg-[#E9E9E9]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={blockId}
            onChange={(e) => setBlockId(e.target.value)}
            aria-label="Filter by block"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[7px]"
          >
            <option value="all">All Blocks</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            aria-label="From date"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[7px]"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            aria-label="To date"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[7px]"
          />
        </div>
      </div>

      {/* Domain Content */}
      {domain === 'students' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Total Students" value={data.students.counts.total || 0} icon={BarChart3} tone="blue" />
            <StatCard label="Active Students" value={data.students.counts.active || 0} icon={BarChart3} tone="lime" />
            <StatCard label="Departed / Inactive" value={data.students.counts.inactive || 0} icon={BarChart3} tone="lavender" />
          </div>
          <div className="bg-white border border-[#E9E9E9] rounded-[12px] p-5">
            <h3 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929] mb-4">
              Block-Wise Student Distribution
            </h3>
            <div className="space-y-3">
              {data.students.blockDistribution.map((b) => {
                const max = Math.max(1, ...data.students.blockDistribution.map((x) => x.student_count));
                return (
                  <div key={b.block_id}>
                    <div className="flex justify-between text-[16px] leading-[1.5] mb-1">
                      <span className="font-semibold">{b.block_name}</span>
                      <span>{b.student_count} students</span>
                    </div>
                    <div className="h-3 bg-[#F4F4F4] rounded-full overflow-hidden">
                      <div className="h-full bg-[#B5DDEC] rounded-full" style={{ width: `${(b.student_count / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {domain === 'rooms' ? (
        <div className="bg-white border border-[#E9E9E9] rounded-[12px] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E9E9E9] text-[15px] font-semibold leading-[1.35] text-[#292929]">
                <th className="py-3.5 px-4">Block</th>
                <th className="py-3.5 px-4">Total Rooms</th>
                <th className="py-3.5 px-4">Total Beds</th>
                <th className="py-3.5 px-4">Occupied Beds</th>
                <th className="py-3.5 px-4">Available Beds</th>
                <th className="py-3.5 px-4">Maintenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E9E9] text-[16px] font-normal leading-[1.45] text-[#292929]">
              {data.rooms.blockOccupancy.map((r) => (
                <tr key={r.block_id}>
                  <td className="py-3.5 px-4 font-semibold">{r.block_name}</td>
                  <td className="py-3.5 px-4">{r.total_rooms}</td>
                  <td className="py-3.5 px-4">{r.total_beds}</td>
                  <td className="py-3.5 px-4">{r.occupied_beds}</td>
                  <td className="py-3.5 px-4 font-semibold text-[#22A06B]">
                    {Math.max(0, r.total_beds - r.occupied_beds)}
                  </td>
                  <td className="py-3.5 px-4">{r.maintenance_rooms || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {domain === 'attendance' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Total Entries" value={data.attendance.summary.total_records || 0} icon={BarChart3} tone="neutral" />
            <StatCard label="Present" value={data.attendance.summary.present_count || 0} icon={BarChart3} tone="lime" />
            <StatCard label="Absent" value={data.attendance.summary.absent_count || 0} icon={BarChart3} tone="lavender" />
            <StatCard label="On Leave" value={data.attendance.summary.on_leave_count || 0} icon={BarChart3} tone="blue" />
          </div>
          <div className="bg-white border border-[#E9E9E9] rounded-[12px] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E9E9E9] text-[15px] font-semibold leading-[1.35] text-[#292929]">
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Present</th>
                  <th className="py-3.5 px-4">Absent</th>
                  <th className="py-3.5 px-4">On Leave</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E9E9] text-[16px] font-normal leading-[1.45] text-[#292929]">
                {data.attendance.trend.map((t) => (
                  <tr key={t.date}>
                    <td className="py-3.5 px-4 font-medium">{t.date}</td>
                    <td className="py-3.5 px-4 text-[#22A06B] font-semibold">{t.present}</td>
                    <td className="py-3.5 px-4 text-[#D9383A] font-semibold">{t.absent}</td>
                    <td className="py-3.5 px-4 text-[#C97A16] font-semibold">{t.on_leave}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {domain === 'leaves' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Total Requests" value={data.leaves.summary.total || 0} icon={BarChart3} tone="neutral" />
            <StatCard label="Approved" value={data.leaves.summary.approved || 0} icon={BarChart3} tone="lime" />
            <StatCard label="Pending" value={data.leaves.summary.pending || 0} icon={BarChart3} tone="blue" />
            <StatCard label="Rejected" value={data.leaves.summary.rejected || 0} icon={BarChart3} tone="lavender" />
          </div>
          <div className="bg-white border border-[#E9E9E9] rounded-[12px] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E9E9E9] text-[15px] font-semibold leading-[1.35] text-[#292929]">
                  <th className="py-3.5 px-4">Leave ID</th>
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4">Room</th>
                  <th className="py-3.5 px-4">Reason</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E9E9] text-[16px] font-normal leading-[1.45] text-[#292929]">
                {data.leaves.records.map((l) => (
                  <tr key={l.leave_code}>
                    <td className="py-3.5 px-4 font-mono text-[14px] text-[#777777]">{l.leave_code}</td>
                    <td className="py-3.5 px-4 font-medium">{l.student_name}</td>
                    <td className="py-3.5 px-4">{l.room_number}</td>
                    <td className="py-3.5 px-4">{l.reason}</td>
                    <td className="py-3.5 px-4 text-[14px] font-semibold leading-[1.35] capitalize">{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {domain === 'complaints' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Total Complaints" value={data.complaints.metrics.total || 0} icon={BarChart3} tone="blue" />
            <StatCard label="Resolution Rate" value={`${data.complaints.metrics.resolutionRatePct}%`} icon={BarChart3} tone="lime" />
            <StatCard
              label="Avg Resolution Time"
              value={data.complaints.metrics.avg_resolution_hours != null ? `${data.complaints.metrics.avg_resolution_hours} hrs` : '--'}
              icon={BarChart3}
              tone="lavender"
            />
          </div>
          <div className="bg-white border border-[#E9E9E9] rounded-[12px] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E9E9E9] text-[15px] font-semibold leading-[1.35] text-[#292929]">
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Total</th>
                  <th className="py-3.5 px-4">Resolved</th>
                  <th className="py-3.5 px-4">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E9E9] text-[16px] font-normal leading-[1.45] text-[#292929]">
                {data.complaints.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td className="py-3.5 px-4 font-semibold">{c.category}</td>
                    <td className="py-3.5 px-4">{c.total}</td>
                    <td className="py-3.5 px-4 text-[#22A06B] font-semibold">{c.resolved}</td>
                    <td className="py-3.5 px-4 text-[#C97A16] font-semibold">{c.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {domain === 'mess' ? (
        <div className="bg-white border border-[#E9E9E9] rounded-[12px] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E9E9E9] text-[15px] font-semibold leading-[1.35] text-[#292929]">
                <th className="py-3.5 px-4">Meal Type</th>
                <th className="py-3.5 px-4">Total Booked</th>
                <th className="py-3.5 px-4">Verified Served</th>
                <th className="py-3.5 px-4">Unused / Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E9E9] text-[16px] font-normal leading-[1.45] text-[#292929]">
              {data.mess.byMeal.map((m) => (
                <tr key={m.meal_type}>
                  <td className="py-3.5 px-4 font-semibold capitalize">{m.meal_type}</td>
                  <td className="py-3.5 px-4">{m.total_booked}</td>
                  <td className="py-3.5 px-4 text-[#22A06B] font-semibold">{m.served}</td>
                  <td className="py-3.5 px-4 text-[#777777]">{m.unused}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {domain === 'movements' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Total Exits" value={data.movements.summary.total_exits || 0} icon={BarChart3} tone="blue" />
            <StatCard label="Total Entries" value={data.movements.summary.total_entries || 0} icon={BarChart3} tone="lime" />
            <StatCard label="Currently Outside" value={data.movements.summary.currently_outside || 0} icon={BarChart3} tone="lavender" />
            <StatCard label="Late Returns" value={data.movements.summary.late_returns || 0} icon={BarChart3} tone="neutral" />
          </div>
          <div className="bg-white border border-[#E9E9E9] rounded-[12px] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E9E9E9] text-[15px] font-semibold leading-[1.35] text-[#292929]">
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4">Room</th>
                  <th className="py-3.5 px-4">Exit Time</th>
                  <th className="py-3.5 px-4">Expected Return</th>
                  <th className="py-3.5 px-4">Actual Return</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E9E9] text-[16px] font-normal leading-[1.45] text-[#292929]">
                {data.movements.logs.map((m) => (
                  <tr key={m.id}>
                    <td className="py-3.5 px-4 font-medium">{m.student_name}</td>
                    <td className="py-3.5 px-4">{m.room_number}</td>
                    <td className="py-3.5 px-4">{m.exit_time.replace('T', ' ')}</td>
                    <td className="py-3.5 px-4">{m.expected_return_time.replace('T', ' ')}</td>
                    <td className="py-3.5 px-4">{m.actual_return_time?.replace('T', ' ') || '--'}</td>
                    <td className="py-3.5 px-4 text-[14px] font-semibold leading-[1.35] capitalize">{m.status.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};

