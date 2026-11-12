import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Clock, Plus, QrCode, Utensils, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, type TableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner, LoadingState } from '../components/ui/States';

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
  meal_date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  qr_token: string;
  booking_status: 'booked' | 'cancelled';
  verified_status: 'pending' | 'served' | 'expired';
  verified_at: string | null;
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
}

export const MessPage: React.FC = () => {
  const { can } = useAuth();
  const [dateCategory, setDateCategory] = useState<'yesterday' | 'today' | 'tomorrow'>('today');
  const [mealTypeFilter, setMealTypeFilter] = useState('all');
  const [q, setQ] = useState('');
  const [data, setData] = useState<MessOverviewResponse | null>(null);
  const [students, setStudents] = useState<Array<{ id: number; student_code: string; full_name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const loadMess = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({
        dateCategory,
        mealType: mealTypeFilter,
      });
      if (q.trim()) params.set('q', q.trim());

      const res = await api.get<MessOverviewResponse>(`/api/mess/overview?${params.toString()}`);
      setData(res);

      const selectedMenus = res.menus.filter((m) => m.menu_date === res.selectedDate);
      setMenuDrafts({
        breakfast: selectedMenus.find((m) => m.meal_type === 'breakfast')?.items_text || '',
        lunch: selectedMenus.find((m) => m.meal_type === 'lunch')?.items_text || '',
        dinner: selectedMenus.find((m) => m.meal_type === 'dinner')?.items_text || '',
      });
      setBookForm((prev) => ({
        ...prev,
        meal_date: prev.meal_date || res.dates.tomorrow,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mess data');
    } finally {
      setLoading(false);
    }
  }, [dateCategory, mealTypeFilter, q]);

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

  const saveMenu = async (mealType: 'breakfast' | 'lunch' | 'dinner', publish: boolean) => {
    if (!data || !menuDrafts[mealType].trim()) return;
    setSavingMenu(mealType);
    try {
      await api.put('/api/mess/menus', {
        menu_date: data.selectedDate,
        meal_type: mealType,
        items_text: menuDrafts[mealType],
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

  if (loading && !data) return <LoadingState label="Loading mess menus and bookings..." />;
  if (!data) return <ErrorBanner message={error || 'Unable to load mess management'} onRetry={loadMess} />;

  const selectedMenus = data.menus.filter((m) => m.menu_date === data.selectedDate);

  const columns: TableColumn<MealBooking>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div>
          <div className="font-semibold text-[#292929]">{r.student_name}</div>
          <div className="text-[14px] font-normal leading-[1.45] text-[#777777]">{r.student_code}</div>
        </div>
      ),
    },
    {
      key: 'room',
      header: 'Room No',
      render: (r) => <span>{r.room_number}</span>,
    },
    {
      key: 'meal_type',
      header: 'Meal Type',
      render: (r) => <span className="capitalize font-medium">{r.meal_type}</span>,
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
          {r.booking_status === 'booked' ? (
            <button
              type="button"
              onClick={() => openQrModal(r)}
              className="px-3 py-1.5 text-[15px] font-semibold leading-[1.3] bg-[#F4F4F4] text-[#292929] rounded-[6px] hover:bg-[#E9E9E9] inline-flex items-center gap-1.5"
            >
              <QrCode className="w-4 h-4" />
              QR
            </button>
          ) : null}
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
        title="Mess Management"
        subtitle={`Advance meal bookings (${data.settings.mess_booking_open_time} – ${data.settings.mess_booking_close_time}, same-day disabled) and daily menu publishing`}
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

      {/* Mess Overview KPIs */}
      <div className="grid grid-cols-5 gap-4 mb-5">
        <StatCard label="Breakfast" value={data.summary.breakfast_bookings || 0} icon={Utensils} tone="blue" />
        <StatCard label="Lunch" value={data.summary.lunch_bookings || 0} icon={Utensils} tone="lime" />
        <StatCard label="Dinner" value={data.summary.dinner_bookings || 0} icon={Utensils} tone="lavender" />
        <StatCard label="Total Booked" value={data.summary.total_bookings || 0} icon={Clock} tone="neutral" />
        <StatCard
          label="Meals Served"
          value={data.summary.served_count || 0}
          subtext={`${data.summary.unused_count || 0} unused / pending`}
          icon={CheckCircle2}
          tone="neutral"
        />
      </div>

      {/* Date Category Switcher (Yesterday / Today / Tomorrow) */}
      <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-4 mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {(
            [
              ['yesterday', `Yesterday (${data.dates.yesterday})`],
              ['today', `Today (${data.dates.today})`],
              ['tomorrow', `Tomorrow (${data.dates.tomorrow})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDateCategory(key)}
              className={`px-4 py-2 rounded-[8px] text-[15px] font-semibold leading-[1.3] transition-colors ${
                dateCategory === key
                  ? 'bg-[#222222] text-white'
                  : 'bg-[#F4F4F4] text-[#292929] hover:bg-[#E9E9E9]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="text-[14px] font-normal leading-[1.45] text-[#777777]">
          Breakfast: {data.settings.breakfast_window} · Lunch: {data.settings.lunch_window} · Dinner: {data.settings.dinner_window}
        </div>
      </div>

      {/* Daily Menu Editor */}
      <div className="grid grid-cols-3 gap-5 mb-5">
        {(['breakfast', 'lunch', 'dinner'] as const).map((mealType) => {
          const existing = selectedMenus.find((m) => m.meal_type === mealType);
          const isPublished = existing?.is_published === 1;
          return (
            <div key={mealType} className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929] capitalize">{mealType} Menu</h3>
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
                value={menuDrafts[mealType]}
                onChange={(e) => setMenuDrafts((prev) => ({ ...prev, [mealType]: e.target.value }))}
                placeholder={`Enter ${mealType} menu items...`}
                className="w-full p-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] focus:outline-none focus:border-[#292929] disabled:bg-[#F9F9F9]"
              />
              {can('mess', 'edit') ? (
                <div className="flex items-center justify-end gap-2 mt-3">
                  <button
                    type="button"
                    disabled={savingMenu === mealType}
                    onClick={() => saveMenu(mealType, false)}
                    className="px-3.5 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[7px] hover:bg-[#F4F4F4]"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    disabled={savingMenu === mealType}
                    onClick={() => saveMenu(mealType, true)}
                    className="px-3.5 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[7px] hover:bg-[#333333]"
                  >
                    {savingMenu === mealType ? 'Saving...' : 'Publish Menu'}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Meal Bookings Table */}
      <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E9E9E9] flex items-center justify-between gap-4">
          <h2 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929]">
            Meal Bookings — <span className="capitalize">{dateCategory}</span>
          </h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search student or booking code..."
              className="w-[295px] h-[40px] px-3 text-[16px] font-normal leading-[1.45] bg-[#F4F4F4] rounded-[8px] focus:outline-none"
            />
            <select
              value={mealTypeFilter}
              onChange={(e) => setMealTypeFilter(e.target.value)}
              aria-label="Filter by meal type"
              className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] bg-white"
            >
              <option value="all">All Meals</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
          </div>
        </div>

        {data.bookings.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Utensils}
              title="No meal bookings for this selection"
              description="No bookings match the selected date category and meal filter."
            />
          </div>
        ) : (
          <DataTable columns={columns} data={data.bookings} rowKey={(r) => r.id} />
        )}
      </div>

      {/* Create Advance Meal Booking Modal */}
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

