import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  QrCode,
  Search,
  Utensils,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, type TableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner, LoadingState } from '../components/ui/States';
import { RoomBox } from '../components/ui/RoomBox';

interface MessMenu {
  id: number;
  menu_date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  items_text: string;
  is_published: number;
}

interface MealBooking {
  id: number;
  booking_code: string;
  student_id: number;
  student_code: string;
  student_name: string;
  room_number: string;
  room_id?: number;
  meal_date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  qr_token: string;
  booking_status: 'booked' | 'cancelled';
  verified_status: 'pending' | 'served' | 'expired';
  verified_at: string | null;
}

interface RoomSummaryItem {
  room_id: number;
  room_number: string;
  block_id?: number;
  block_name?: string;
  total_bookings: number;
  served_count: number;
  pending_count: number;
}

interface RoomMealSummaryItem {
  room_id: number;
  room_number: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  total_bookings: number;
  served_count: number;
  pending_count: number;
}

interface MessOverviewResponse {
  dates: { yesterday: string; today: string; tomorrow: string };
  selectedDate: string;
  settings: {
    mess_booking_open_time: string;
    mess_booking_close_time: string;
    breakfast_window: string;
    lunch_window: string;
    dinner_window: string;
    allow_same_day_booking: number;
  };
  menus: MessMenu[];
  bookings: MealBooking[];
  summary: {
    breakfast_bookings: number | null;
    lunch_bookings: number | null;
    dinner_bookings: number | null;
    total_bookings: number | null;
    served_count: number | null;
    unused_count: number | null;
  };
  room_summary?: RoomSummaryItem[];
  room_meal_summary?: RoomMealSummaryItem[];
}

export const MessPage: React.FC = () => {
  const { can } = useAuth();

  // Workflow State: Date -> Meal -> View Room Numbers -> Open Room -> Select Meal Again -> View Student Bookings
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner'>('breakfast');
  const [roomSearch, setRoomSearch] = useState<string>('');

  // Selected Room for Detailed View
  const [selectedRoom, setSelectedRoom] = useState<{ id: number; room_number: string } | null>(null);
  // Independent Meal Selector inside Room Details View
  const [roomMealType, setRoomMealType] = useState<'breakfast' | 'lunch' | 'dinner'>('breakfast');

  const [data, setData] = useState<MessOverviewResponse | null>(null);
  const [students, setStudents] = useState<Array<{ id: number; student_code: string; full_name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const [menuDrafts, setMenuDrafts] = useState<Record<'breakfast' | 'lunch' | 'dinner', string>>({
    breakfast: '',
    lunch: '',
    dinner: '',
  });
  const [savingMenu, setSavingMenu] = useState<string | null>(null);

  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [bookForm, setBookForm] = useState({
    student_id: '',
    meal_date: '',
    meal_type: 'breakfast' as 'breakfast' | 'lunch' | 'dinner',
  });
  const [bookError, setBookError] = useState('');
  const [saving, setSaving] = useState(false);

  const [qrViewBooking, setQrViewBooking] = useState<MealBooking | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [cancelTarget, setCancelTarget] = useState<MealBooking | null>(null);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  const loadMess = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({
        date: selectedDate,
      });

      const res = await api.get<MessOverviewResponse>(`/api/mess/overview?${params.toString()}`);
      setData(res);

      const currentMenus = res.menus.filter((m) => m.menu_date === res.selectedDate);
      setMenuDrafts({
        breakfast: currentMenus.find((m) => m.meal_type === 'breakfast')?.items_text || '',
        lunch: currentMenus.find((m) => m.meal_type === 'lunch')?.items_text || '',
        dinner: currentMenus.find((m) => m.meal_type === 'dinner')?.items_text || '',
      });
      setBookForm((prev) => ({
        ...prev,
        meal_date: prev.meal_date || res.dates.tomorrow,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meal bookings');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadMess();
  }, [loadMess]);

  useEffect(() => {
    api
      .get<{ students: Array<{ id: number; student_code: string; full_name: string }> }>(
        '/api/students?status=active',
      )
      .then((res) => setStudents(res.students))
      .catch(() => {});
  }, []);

  const saveMenu = async (mType: 'breakfast' | 'lunch' | 'dinner', publish: boolean) => {
    if (!data || !menuDrafts[mType].trim()) return;
    setSavingMenu(mType);
    try {
      await api.put('/api/mess/menus', {
        menu_date: data.selectedDate,
        meal_type: mType,
        items_text: menuDrafts[mType],
        is_published: publish,
      });
      await loadMess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save menu');
    } finally {
      setSavingMenu(null);
    }
  };

  const submitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookError('');
    setSaving(true);
    try {
      await api.post('/api/mess/bookings', {
        student_id: Number(bookForm.student_id),
        meal_date: bookForm.meal_date,
        meal_type: bookForm.meal_type,
      });
      setBookModalOpen(false);
      await loadMess();
    } catch (err) {
      setBookError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setSaving(false);
    }
  };

  const openQrModal = async (booking: MealBooking) => {
    setQrViewBooking(booking);
    const url = await QRCode.toDataURL(booking.qr_token, { width: 240, margin: 2 });
    setQrDataUrl(url);
  };

  const confirmCancelBooking = async () => {
    if (!cancelTarget) return;
    setSaving(true);
    try {
      await api.patch(`/api/mess/bookings/${cancelTarget.id}/cancel`);
      setCancelTarget(null);
      await loadMess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel booking');
    } finally {
      setSaving(false);
    }
  };

  // Direct table verification of individual student booking
  const handleVerifyBooking = async (booking: MealBooking) => {
    if (booking.verified_status === 'served') return;
    setVerifyingId(booking.id);
    setActionSuccess('');
    setError('');
    try {
      await api.patch(`/api/mess/bookings/${booking.id}/verify`);
      setActionSuccess(`Meal marked as served for ${booking.student_name}.`);
      await loadMess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifyingId(null);
    }
  };

  // Derived room list for the main page:
  // Only display rooms with bookings for the selected date and meal.
  const mainRoomsWithBookings = useMemo(() => {
    if (!data) return [];

    // Aggregate from data.bookings for the active mealType on the main page
    const map = new Map<string, {
      room_id: number;
      room_number: string;
      total_bookings: number;
      served_count: number;
      pending_count: number;
    }>();

    for (const b of data.bookings) {
      if (b.meal_type === mealType && b.booking_status === 'booked' && b.room_number && b.room_number !== '--') {
        const existing = map.get(b.room_number) || {
          room_id: b.room_id || 0,
          room_number: b.room_number,
          total_bookings: 0,
          served_count: 0,
          pending_count: 0,
        };
        existing.total_bookings += 1;
        if (b.verified_status === 'served') {
          existing.served_count += 1;
        } else {
          existing.pending_count += 1;
        }
        map.set(b.room_number, existing);
      }
    }

    const list = Array.from(map.values()).filter((r) => r.total_bookings > 0);

    // Filter by room search input if provided
    const query = roomSearch.trim().toLowerCase();
    const filtered = query ? list.filter((r) => r.room_number.toLowerCase().includes(query)) : list;

    // Natural numeric sort for room numbers (101, 102, 103, 201...)
    filtered.sort((a, b) => {
      const numA = parseInt(a.room_number, 10);
      const numB = parseInt(b.room_number, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.room_number.localeCompare(b.room_number);
    });

    return filtered;
  }, [data, mealType, roomSearch]);

  // Derived student bookings for Room Details View
  const roomBookings = useMemo(() => {
    if (!data || !selectedRoom) return [];
    return data.bookings.filter(
      (b) => b.room_number === selectedRoom.room_number && b.meal_type === roomMealType,
    );
  }, [data, selectedRoom, roomMealType]);

  // Derived stats for Room Details View
  const roomStats = useMemo(() => {
    const total = roomBookings.length;
    const served = roomBookings.filter((b) => b.verified_status === 'served').length;
    const pending = roomBookings.filter((b) => b.booking_status === 'booked' && b.verified_status !== 'served').length;
    return { total, served, pending };
  }, [roomBookings]);

  if (loading && !data) return <LoadingState label="Loading meal bookings..." />;
  if (!data) return <ErrorBanner message={error || 'Unable to load meal bookings'} onRetry={loadMess} />;

  const selectedMenus = data.menus.filter((m) => m.menu_date === data.selectedDate);

  // Student Booking Table Columns (Section 4)
  const columns: TableColumn<MealBooking>[] = [
    {
      key: 'student_name',
      header: 'Student Name',
      render: (r) => (
        <div className="font-semibold text-[#292929]">{r.student_name}</div>
      ),
    },
    {
      key: 'student_code',
      header: 'Registration No',
      render: (r) => (
        <span className="font-mono text-[14px] text-[#777777]">{r.student_code}</span>
      ),
    },
    {
      key: 'room_number',
      header: 'Room No',
      render: (r) => <span className="font-semibold text-[#292929]">{r.room_number}</span>,
    },
    {
      key: 'meal_type',
      header: 'Meal Type',
      render: (r) => <span className="capitalize font-medium text-[#292929]">{r.meal_type}</span>,
    },
    {
      key: 'booking_code',
      header: 'Booking Code',
      render: (r) => <span className="font-mono text-[14px] text-[#777777]">{r.booking_code}</span>,
    },
    {
      key: 'booking_status',
      header: 'Booking Status',
      render: (r) => (
        <span
          className={`text-[14px] font-semibold leading-[1.35] capitalize ${
            r.booking_status === 'booked' ? 'text-[#292929]' : 'text-[#D9383A]'
          }`}
        >
          {r.booking_status}
        </span>
      ),
    },
    {
      key: 'verified_status',
      header: 'Verification Status',
      render: (r) => (
        <span
          className={`text-[14px] font-semibold leading-[1.35] capitalize ${
            r.verified_status === 'served'
              ? 'text-[#22A06B]'
              : r.verified_status === 'expired'
                ? 'text-[#D9383A]'
                : 'text-[#C97A16]'
          }`}
        >
          {r.verified_status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          {/* Direct verification button */}
          {r.booking_status === 'booked' && r.verified_status !== 'served' && (can('mess', 'edit') || can('qr_scanner', 'create')) ? (
            <button
              type="button"
              disabled={verifyingId === r.id}
              onClick={() => handleVerifyBooking(r)}
              className="px-3 py-1.5 text-[14px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[6px] hover:bg-[#333333] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {verifyingId === r.id ? 'Verifying...' : 'Verify'}
            </button>
          ) : null}

          {/* QR code modal button */}
          {r.booking_status === 'booked' ? (
            <button
              type="button"
              onClick={() => openQrModal(r)}
              className="px-3 py-1.5 text-[14px] font-semibold leading-[1.3] bg-[#F4F4F4] text-[#292929] rounded-[6px] hover:bg-[#E9E9E9] inline-flex items-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5" />
              QR
            </button>
          ) : null}

          {/* Cancel booking button */}
          {r.booking_status === 'booked' && r.verified_status !== 'served' && can('mess', 'edit') ? (
            <button
              type="button"
              onClick={() => setCancelTarget(r)}
              title="Cancel Booking"
              className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#D9383A] hover:bg-[#D9383A]/10"
            >
              <XCircle className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Meal Bookings"
        subtitle={`Room-based advance bookings (${data.settings.mess_booking_open_time} – ${data.settings.mess_booking_close_time}) and QR verification`}
        actions={
          can('mess', 'create') ? (
            <button
              type="button"
              onClick={() => {
                setBookError('');
                setBookForm({ student_id: '', meal_date: data.dates.tomorrow, meal_type: 'breakfast' });
                setBookModalOpen(true);
              }}
              className="h-[40px] px-4 rounded-[8px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] flex items-center gap-2 hover:bg-[#333333]"
            >
              <Plus className="w-4 h-4" />
              Advance Meal Booking
            </button>
          ) : null
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadMess} /> : null}
      {actionSuccess ? (
        <div className="mb-4 p-3.5 rounded-[8px] bg-[#DDF58A]/30 border border-[#DDF58A] text-[#1F7A4A] text-[15px] font-medium flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button
            type="button"
            onClick={() => setActionSuccess('')}
            className="text-[14px] font-semibold underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Top Overview KPIs */}
      <div className="grid grid-cols-5 gap-4 mb-5">
        <StatCard label="Breakfast" value={data.summary.breakfast_bookings || 0} icon={Utensils} tone="blue" />
        <StatCard label="Lunch" value={data.summary.lunch_bookings || 0} icon={Utensils} tone="lime" />
        <StatCard label="Dinner" value={data.summary.dinner_bookings || 0} icon={Utensils} tone="lavender" />
        <StatCard label="Total Booked" value={data.summary.total_bookings || 0} icon={Clock} tone="neutral" />
        <StatCard
          label="Meals Served"
          value={data.summary.served_count || 0}
          subtext={`${data.summary.unused_count || 0} pending`}
          icon={CheckCircle2}
          tone="neutral"
        />
      </div>

      {/* ========================================================= */}
      {/* SECTION 2 & 3: MAIN ROOM-BASED MEAL BOOKINGS OR ROOM DETAIL */}
      {/* ========================================================= */}
      {!selectedRoom ? (
        /* MAIN ROOM NUMBERS VIEW */
        <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5 mb-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          {/* Header Controls (Date, Meal Selector, Room Search) */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E9E9E9] mb-5">
            {/* Date Selector & Quick Jumps */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                    }
                  }}
                  className="h-[40px] pl-9 pr-3 text-[15px] font-medium border border-[#E9E9E9] rounded-[8px] bg-white focus:outline-none focus:border-[#222222]"
                />
                <Calendar className="w-4 h-4 text-[#777777] absolute left-3 top-3 pointer-events-none" />
              </div>

              <div className="flex items-center gap-1.5">
                {[
                  ['yesterday', 'Yesterday', data.dates.yesterday],
                  ['today', 'Today', data.dates.today],
                  ['tomorrow', 'Tomorrow', data.dates.tomorrow],
                ].map(([key, label, dateVal]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(dateVal)}
                    className={`px-3 py-2 rounded-[7px] text-[14px] font-semibold leading-[1.3] transition-colors ${
                      selectedDate === dateVal
                        ? 'bg-[#222222] text-white'
                        : 'bg-[#F4F4F4] text-[#292929] hover:bg-[#E9E9E9]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Meal Selector & Room Number Search */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Primary Meal Selector: Breakfast, Lunch, Dinner */}
              <div className="flex items-center bg-[#F4F4F4] p-1 rounded-[8px] gap-1">
                {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
                  <button
                    key={meal}
                    type="button"
                    onClick={() => setMealType(meal)}
                    className={`px-3.5 py-1.5 text-[14px] font-semibold capitalize rounded-[6px] transition-colors ${
                      mealType === meal
                        ? 'bg-[#222222] text-white shadow-sm'
                        : 'text-[#777777] hover:text-[#292929]'
                    }`}
                  >
                    {meal}
                  </button>
                ))}
              </div>

              {/* Room Search Field */}
              <div className="relative">
                <input
                  type="text"
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  placeholder="Search room number..."
                  className="w-[180px] sm:w-[210px] h-[40px] pl-9 pr-3 text-[15px] font-normal border border-[#E9E9E9] rounded-[8px] bg-white focus:outline-none focus:border-[#222222]"
                />
                <Search className="w-4 h-4 text-[#777777] absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Room Boxes Grid */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-slab text-[18px] font-semibold text-[#292929]">
                Rooms with <span className="capitalize">{mealType}</span> Bookings
              </h2>
              <span className="text-[13px] text-[#777777]">
                Showing {mainRoomsWithBookings.length} {mainRoomsWithBookings.length === 1 ? 'room' : 'rooms'}
              </span>
            </div>

            {mainRoomsWithBookings.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  icon={Utensils}
                  title={`No ${mealType} bookings found`}
                  description={`No rooms have bookings for ${mealType} on ${selectedDate}${
                    roomSearch.trim() ? ` matching "${roomSearch}"` : ''
                  }.`}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {mainRoomsWithBookings.map((room) => (
                  <RoomBox
                    key={room.room_id || room.room_number}
                    roomNumber={room.room_number}
                    primaryMeta={`${room.total_bookings} ${room.total_bookings === 1 ? 'Booking' : 'Bookings'}`}
                    secondaryMeta={`${room.served_count} served · ${room.pending_count} pending`}
                    badgeLabel={`${room.total_bookings} Booked`}
                    badgeTone={room.pending_count === 0 ? 'success' : 'neutral'}
                    onClick={() => {
                      setSelectedRoom({ id: room.room_id, room_number: room.room_number });
                      setRoomMealType(mealType);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ROOM DETAILS VIEW (Section 3 & 4) */
        <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5 mb-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          {/* Details Header with Return Action & Second Meal Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E9E9E9] mb-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedRoom(null)}
                className="h-[38px] px-3.5 rounded-[8px] bg-[#F4F4F4] hover:bg-[#E9E9E9] text-[#292929] text-[14px] font-semibold flex items-center gap-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Room Overview
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-slab text-[22px] font-bold text-[#292929]">
                    Room {selectedRoom.room_number}
                  </h2>
                  <span className="text-[13px] font-medium text-[#777777] bg-[#F4F4F4] px-2.5 py-0.5 rounded-[6px]">
                    {selectedDate}
                  </span>
                </div>
              </div>
            </div>

            {/* MANDATORY SECOND MEAL SELECTOR INSIDE ROOM DETAILS VIEW */}
            <div className="flex items-center bg-[#F4F4F4] p-1 rounded-[8px] gap-1 self-start sm:self-auto">
              {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
                <button
                  key={meal}
                  type="button"
                  onClick={() => setRoomMealType(meal)}
                  className={`px-4 py-1.5 text-[14px] font-semibold capitalize rounded-[6px] transition-colors ${
                    roomMealType === meal
                      ? 'bg-[#222222] text-white shadow-sm'
                      : 'text-[#777777] hover:text-[#292929]'
                  }`}
                >
                  {meal}
                </button>
              ))}
            </div>
          </div>

          {/* Room Specific Meal Statistics Strip */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <StatCard
              label="Total Bookings"
              value={roomStats.total}
              subtext={`Room ${selectedRoom.room_number} · ${roomMealType}`}
              icon={Utensils}
              tone="blue"
            />
            <StatCard
              label="Meals Served"
              value={roomStats.served}
              icon={CheckCircle2}
              tone="lime"
            />
            <StatCard
              label="Pending Verification"
              value={roomStats.pending}
              icon={Clock}
              tone="lavender"
            />
          </div>

          {/* Student Booking Table for this Room and Meal */}
          <div className="border border-[#E9E9E9] rounded-[8px] overflow-hidden">
            <div className="px-4 py-3 bg-[#FAFAFA] border-b border-[#E9E9E9] flex items-center justify-between">
              <h3 className="font-slab text-[16px] font-semibold text-[#292929] capitalize">
                {roomMealType} Student Bookings — Room {selectedRoom.room_number}
              </h3>
              <span className="text-[13px] text-[#777777]">
                {roomBookings.length} {roomBookings.length === 1 ? 'student' : 'students'}
              </span>
            </div>

            {roomBookings.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={Utensils}
                  title={`No ${roomMealType} bookings`}
                  description={`No students in Room ${selectedRoom.room_number} have booked ${roomMealType} for ${selectedDate}. Switch meals above to inspect other bookings.`}
                />
              </div>
            ) : (
              <DataTable columns={columns} data={roomBookings} rowKey={(r) => r.id} />
            )}
          </div>
        </div>
      )}

      {/* Daily Menu Editor Strip */}
      <div className="grid grid-cols-3 gap-5 mb-5">
        {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => {
          const existing = selectedMenus.find((m) => m.meal_type === meal);
          const isPublished = existing?.is_published === 1;
          return (
            <div key={meal} className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929] capitalize">
                  {meal} Menu
                </h3>
                <span
                  className={`text-[14px] font-semibold leading-[1.35] ${
                    isPublished ? 'text-[#22A06B]' : 'text-[#777777]'
                  }`}
                >
                  {isPublished ? 'Published' : 'Draft'}
                </span>
              </div>
              <textarea
                rows={3}
                disabled={!can('mess', 'edit')}
                value={menuDrafts[meal]}
                onChange={(e) => setMenuDrafts((prev) => ({ ...prev, [meal]: e.target.value }))}
                placeholder={`Enter ${meal} menu items...`}
                className="w-full p-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] focus:outline-none focus:border-[#222222] disabled:bg-[#F9F9F9]"
              />
              {can('mess', 'edit') ? (
                <div className="flex items-center justify-end gap-2 mt-3">
                  <button
                    type="button"
                    disabled={savingMenu === meal}
                    onClick={() => saveMenu(meal, false)}
                    className="px-3.5 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[7px] hover:bg-[#F4F4F4]"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    disabled={savingMenu === meal}
                    onClick={() => saveMenu(meal, true)}
                    className="px-3.5 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[7px] hover:bg-[#333333]"
                  >
                    {savingMenu === meal ? 'Saving...' : 'Publish Menu'}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Advance Meal Booking Modal */}
      <Modal
        open={bookModalOpen}
        onClose={() => setBookModalOpen(false)}
        title="Create Advance Meal Booking"
        subtitle={`Booking window: ${data.settings.mess_booking_open_time} – ${data.settings.mess_booking_close_time} (same-day booking disabled)`}
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setBookModalOpen(false)}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="meal-book-form"
              disabled={saving}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
            >
              {saving ? 'Booking...' : 'Book Meal & Generate QR'}
            </button>
          </>
        }
      >
        <form id="meal-book-form" onSubmit={submitBooking} className="space-y-4">
          {bookError ? <ErrorBanner message={bookError} /> : null}
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Student *</label>
            <select
              required
              value={bookForm.student_id}
              onChange={(e) => setBookForm({ ...bookForm, student_id: e.target.value })}
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
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Meal Date *</label>
            <input
              type="date"
              required
              min={data.dates.tomorrow}
              value={bookForm.meal_date}
              onChange={(e) => setBookForm({ ...bookForm, meal_date: e.target.value })}
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Meal Type *</label>
            <select
              value={bookForm.meal_type}
              onChange={(e) =>
                setBookForm({ ...bookForm, meal_type: e.target.value as 'breakfast' | 'lunch' | 'dinner' })
              }
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* QR Code Preview Modal */}
      <Modal
        open={Boolean(qrViewBooking)}
        onClose={() => setQrViewBooking(null)}
        title="Meal Verification QR Code"
        subtitle={
          qrViewBooking
            ? `${qrViewBooking.student_name} · ${qrViewBooking.meal_date} (${qrViewBooking.meal_type.toUpperCase()})`
            : ''
        }
        maxWidth="sm"
      >
        {qrViewBooking ? (
          <div className="flex flex-col items-center text-center space-y-3 py-2">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Meal Booking QR"
                className="w-[210px] h-[210px] border border-[#E9E9E9] rounded-[10px] p-2"
              />
            ) : null}
            <div className="text-[14px] leading-[1.45] text-[#777777]">Booking Code: {qrViewBooking.booking_code}</div>
            <code className="px-3 py-1.5 bg-[#F4F4F4] rounded-[6px] text-[14px] leading-[1.45] text-[#292929] select-all">
              {qrViewBooking.qr_token}
            </code>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancelBooking}
        loading={saving}
        title="Cancel Meal Booking"
        message={`Cancel ${cancelTarget?.meal_type} booking (${cancelTarget?.booking_code}) for ${cancelTarget?.student_name}?`}
        confirmLabel="Cancel Booking"
      />
    </div>
  );
};
