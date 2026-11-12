import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BedDouble, ChevronLeft, ChevronRight, MessageSquareWarning, Users } from 'lucide-react';
import { api } from '../lib/api';
import type { DashboardData } from '../types';
import { StatCard } from '../components/ui/StatCard';
import {
  AdmissionsBarChart,
  MessSemiGauge,
  RoomOccupancyDonut,
} from '../components/ui/DashboardCharts';
import { ErrorBanner, LoadingState } from '../components/ui/States';

function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-');
}

function shiftDate(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (date: string) => {
    setError('');
    try {
      const res = await api.get<DashboardData>(`/api/dashboard?attendanceDate=${date}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(attendanceDate);
  }, [attendanceDate, loadDashboard]);

  if (loading && !data) {
    return <LoadingState label="Loading dashboard overview..." />;
  }

  if (error && !data) {
    return <ErrorBanner message={error} onRetry={() => loadDashboard(attendanceDate)} />;
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      {error ? <ErrorBanner message={error} onRetry={() => loadDashboard(attendanceDate)} /> : null}

      <div className="flex gap-5 items-stretch">
        {/* Left Main Analytics Column (~70%) */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Row 1: 3 Pastel Stat Cards */}
          <div className="grid grid-cols-3 gap-5">
            <StatCard
              tone="blue"
              icon={BedDouble}
              label="Available Beds"
              value={`${data.stats.availableBeds}/${data.stats.operationalBeds}`}
              onClick={() => navigate('/rooms')}
            />
            <StatCard
              tone="lime"
              icon={MessageSquareWarning}
              label="Open Complaints"
              value={`${data.stats.openComplaints}/${data.stats.totalComplaints}`}
              onClick={() => navigate('/complaints')}
            />
            <StatCard
              tone="lavender"
              icon={Users}
              label="Total Students"
              value={`${data.stats.activeStudents}/${data.stats.totalBeds}`}
              onClick={() => navigate('/students')}
            />
          </div>

          {/* Row 2: Monthly Admissions vs Departures Bar Chart */}
          <AdmissionsBarChart data={data.admissionsVsDepartures} />

          {/* Row 3: Student Attendance Table */}
          <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.025)] flex-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929]">Student Attendance</h2>
              <div className="flex items-center gap-2 text-[14px] leading-[1.35] text-[#777777]">
                <button
                  type="button"
                  onClick={() => setAttendanceDate((d) => shiftDate(d, -1))}
                  aria-label="Previous attendance day"
                  className="p-1.5 rounded hover:bg-[#F4F4F4] text-[#292929]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-medium text-[#292929] min-w-[104px] text-center">
                  {formatDisplayDate(data.attendanceDate)}
                </span>
                <button
                  type="button"
                  onClick={() => setAttendanceDate((d) => shiftDate(d, 1))}
                  aria-label="Next attendance day"
                  className="p-1.5 rounded hover:bg-[#F4F4F4] text-[#292929]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {data.attendanceRows.length === 0 ? (
              <div className="py-10 text-center text-[16px] leading-[1.5] text-[#777777]">
                No student attendance records for this date.
              </div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#E9E9E9]">
                    <th className="py-3 text-[15px] font-semibold leading-[1.35] text-[#292929]">Name</th>
                    <th className="py-3 text-[15px] font-semibold leading-[1.35] text-[#292929]">Room no</th>
                    <th className="py-3 text-[15px] font-semibold leading-[1.35] text-[#292929]">Check in</th>
                    <th className="py-3 text-[15px] font-semibold leading-[1.35] text-[#292929]">Checkout</th>
                    <th className="py-3 text-[15px] font-semibold leading-[1.35] text-[#292929] text-right">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E9E9]">
                  {data.attendanceRows.map((row) => (
                    <tr
                      key={row.student_id}
                      onClick={() => navigate('/movements')}
                      className="cursor-pointer hover:bg-[#FAFAFA] transition-colors"
                    >
                      <td className="py-3.5 text-[16px] leading-[1.45] text-[#292929] font-medium">{row.full_name}</td>
                      <td className="py-3.5 text-[16px] leading-[1.45] text-[#777777]">{row.room_number}</td>
                      <td className="py-3.5 text-[16px] leading-[1.45] text-[#777777]">{row.check_in_time}</td>
                      <td className="py-3.5 text-[16px] leading-[1.45] text-[#777777]">{row.check_out_time}</td>
                      <td className="py-3.5 text-[14px] font-semibold leading-[1.35] text-right">
                        {row.status === 'present' ? (
                          <span className="text-[#22A06B]">Present</span>
                        ) : row.status === 'on_leave' ? (
                          <span className="text-[#C97A16]">On Leave</span>
                        ) : (
                          <span className="text-[#D9383A]">Absent</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Analytics Column (~30%) */}
        <div className="w-[330px] xl:w-[355px] shrink-0 flex flex-col gap-5">
          <div className="h-[396px]">
            <RoomOccupancyDonut
              occupiedBeds={data.roomOccupancy.occupiedBeds}
              availableBeds={data.roomOccupancy.availableBeds}
              occupiedPct={data.roomOccupancy.occupiedPct}
              availablePct={data.roomOccupancy.availablePct}
            />
          </div>
          <div className="flex-1 min-h-[260px]">
            <MessSemiGauge
              totalBookings={data.messOverview.totalBookings}
              servedCount={data.messOverview.servedCount}
              remainingCount={data.messOverview.remainingCount}
              servedPct={data.messOverview.servedPct}
              remainingPct={data.messOverview.remainingPct}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

