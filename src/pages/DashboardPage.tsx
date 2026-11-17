import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BedDouble, ChevronLeft, ChevronRight, MessageSquareWarning, Users } from 'lucide-react';
import { api } from '../lib/api';
import type { DashboardData } from '../types';
import { StatCard } from '../components/ui/StatCard';
import {
  AdmissionsBarChart,
  MessSemiGauge,
  RoomOccupancyDonut,
} from '../components/ui/DashboardCharts';
import { ErrorBanner, LoadingState } from '../components/ui/States';
import { formatDate } from '../utils/date';

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
  const [activeTab, setActiveTab] = useState<'leaves' | 'complaints'>('leaves');
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

          {/* Row 3: Daily Updates Tabbed Action Table */}
          <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.025)] flex-1 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-4">
                <h2 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929]">Daily Updates</h2>
                <div className="inline-flex items-center p-1 bg-[#F5F5F4] rounded-full gap-1 border border-[#E9E9E9]">
                  <button
                    type="button"
                    onClick={() => setActiveTab('leaves')}
                    className={`px-3 py-1 rounded-full text-[13px] font-medium transition-all ${
                      activeTab === 'leaves'
                        ? 'bg-[#405B35] text-white shadow-sm'
                        : 'text-[#666666] hover:text-[#292929]'
                    }`}
                  >
                    Leave Intimations ({data.dailyLeaves?.length ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('complaints')}
                    className={`px-3 py-1 rounded-full text-[13px] font-medium transition-all ${
                      activeTab === 'complaints'
                        ? 'bg-[#405B35] text-white shadow-sm'
                        : 'text-[#666666] hover:text-[#292929]'
                    }`}
                  >
                    Recent Complaints ({data.dailyComplaints?.length ?? 0})
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-[14px] leading-[1.35] text-[#777777] bg-[#FAFAFA] px-2 py-1 rounded border border-[#E9E9E9]">
                  <button
                    type="button"
                    onClick={() => setAttendanceDate((d) => shiftDate(d, -1))}
                    aria-label="Previous day"
                    className="p-1 rounded hover:bg-[#EAEAEA] text-[#292929] transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-medium text-[#292929] min-w-[96px] text-center text-[13px]">
                    {formatDate(data.attendanceDate)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttendanceDate((d) => shiftDate(d, 1))}
                    aria-label="Next day"
                    className="p-1 rounded hover:bg-[#EAEAEA] text-[#292929] transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(activeTab === 'leaves' ? '/leaves' : '/complaints')}
                  className="text-[#405B35] hover:text-[#2D4025] hover:underline text-[13px] font-semibold flex items-center gap-1 ml-1"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {activeTab === 'leaves' ? (
              (!data.dailyLeaves || data.dailyLeaves.length === 0) ? (
                <div className="py-10 text-center text-[15px] leading-[1.5] text-[#777777] flex-1 flex items-center justify-center">
                  No leave intimations for {formatDate(data.attendanceDate)}.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[#E9E9E9]">
                        <th className="py-3 px-2 text-[14px] font-semibold leading-[1.35] text-[#292929] w-[44px]">#</th>
                        <th className="py-3 text-[14px] font-semibold leading-[1.35] text-[#292929]">Student Name</th>
                        <th className="py-3 text-[14px] font-semibold leading-[1.35] text-[#292929]">Room No</th>
                        <th className="py-3 text-[14px] font-semibold leading-[1.35] text-[#292929]">Leave Dates</th>
                        <th className="py-3 text-[14px] font-semibold leading-[1.35] text-[#292929]">Parent Status</th>
                        <th className="py-3 text-[14px] font-semibold leading-[1.35] text-[#292929] text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9E9E9]">
                      {data.dailyLeaves.map((row, index) => (
                        <tr
                          key={row.id}
                          onClick={() => navigate('/leaves')}
                          className="cursor-pointer hover:bg-[#FAFAFA] transition-colors"
                        >
                          <td className="py-3 px-2 text-[14px] font-semibold text-[#777777]">{index + 1}</td>
                          <td className="py-3 text-[15px] leading-[1.45] text-[#292929] font-medium">{row.student_name}</td>
                          <td className="py-3 text-[15px] leading-[1.45] text-[#777777]">{row.room_number}</td>
                          <td className="py-3 text-[14px] leading-[1.45] text-[#555555]">
                            {formatDate(row.departure_at)} - {formatDate(row.expected_return_at)}
                          </td>
                          <td className="py-3 text-[13px] leading-[1.35]">
                            {row.parent_status === 'Parent Approved' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium bg-[#EAF4E2] text-[#405B35]">
                                Parent Approved
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium bg-[#FEF3C7] text-[#C97A16]">
                                Awaiting Parent
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-[13px] font-semibold leading-[1.35] text-right">
                            {row.status === 'approved' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#E6F7ED] text-[#22A06B] capitalize">
                                Approved
                              </span>
                            ) : row.status === 'pending' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#FEF3C7] text-[#C97A16] capitalize">
                                Pending
                              </span>
                            ) : row.status === 'rejected' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#FEE2E2] text-[#D9383A] capitalize">
                                Rejected
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#F3F4F6] text-[#6B7280] capitalize">
                                {row.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              (!data.dailyComplaints || data.dailyComplaints.length === 0) ? (
                <div className="py-10 text-center text-[15px] leading-[1.5] text-[#777777] flex-1 flex items-center justify-center">
                  No complaints recorded for {formatDate(data.attendanceDate)}.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[#E9E9E9]">
                        <th className="py-3 px-2 text-[14px] font-semibold leading-[1.35] text-[#292929] w-[44px]">#</th>
                        <th className="py-3 text-[14px] font-semibold leading-[1.35] text-[#292929]">Student Name</th>
                        <th className="py-3 text-[14px] font-semibold leading-[1.35] text-[#292929]">Room No</th>
                        <th className="py-3 text-[14px] font-semibold leading-[1.35] text-[#292929]">Category / Issue</th>
                        <th className="py-3 text-[14px] font-semibold leading-[1.35] text-[#292929]">Raised On</th>
                        <th className="py-3 text-[14px] font-semibold leading-[1.35] text-[#292929] text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9E9E9]">
                      {data.dailyComplaints.map((row, index) => (
                        <tr
                          key={row.id}
                          onClick={() => navigate('/complaints')}
                          className="cursor-pointer hover:bg-[#FAFAFA] transition-colors"
                        >
                          <td className="py-3 px-2 text-[14px] font-semibold text-[#777777]">{index + 1}</td>
                          <td className="py-3 text-[15px] leading-[1.45] text-[#292929] font-medium">{row.student_name}</td>
                          <td className="py-3 text-[15px] leading-[1.45] text-[#777777]">{row.room_number}</td>
                          <td className="py-3 text-[14px] leading-[1.45]">
                            <span className="font-medium text-[#292929]">{row.category}</span>
                            <span className="text-[#777777] ml-1.5">- {row.title}</span>
                          </td>
                          <td className="py-3 text-[14px] leading-[1.45] text-[#555555]">{formatDate(row.created_at)}</td>
                          <td className="py-3 text-[13px] font-semibold leading-[1.35] text-right">
                            {row.status === 'resolved' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#E6F7ED] text-[#22A06B] capitalize">
                                Resolved
                              </span>
                            ) : row.status === 'in_progress' || row.status === 'assigned' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#FEF3C7] text-[#C97A16] capitalize">
                                {row.status === 'in_progress' ? 'In Progress' : 'Assigned'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#EFF6FF] text-[#2563EB] capitalize">
                                {row.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
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

