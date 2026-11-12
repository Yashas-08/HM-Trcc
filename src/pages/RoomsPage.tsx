import React, { useCallback, useEffect, useState } from 'react';
import {
  BedDouble,
  Building2,
  Edit3,
  Plus,
  Trash2,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner, LoadingState } from '../components/ui/States';

interface Block {
  id: number;
  name: string;
  code: string;
  description: string;
}

interface Floor {
  id: number;
  block_id: number;
  floor_number: number;
  label: string;
}

interface Occupant {
  allocation_id: number;
  student_id: number;
  bed_label: string;
  student_code: string;
  full_name: string;
  phone: string;
}

interface Room {
  id: number;
  block_id: number;
  floor_id: number;
  room_number: string;
  capacity: number;
  occupied_beds: number;
  available_beds: number;
  facilities: string[];
  status: 'available' | 'occupied' | 'maintenance';
  notes: string;
  block_name: string;
  floor_number: number;
  floor_label: string;
  occupants: Occupant[];
}

interface RoomsOverview {
  blocks: Block[];
  floors: Floor[];
  rooms: Room[];
  unassignedStudents: Array<{ id: number; student_code: string; full_name: string; course: string }>;
  summary: {
    totalRooms: number;
    occupiedRooms: number;
    availableRooms: number;
    maintenanceRooms: number;
    totalBeds: number;
    operationalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
  };
}

const DEFAULT_FACILITIES = ['Wi-Fi', 'Study Desk', 'Ceiling Fan', 'Wardrobe', 'AC', 'Attached Bath', 'Balcony'];

export const RoomsPage: React.FC = () => {
  const { can } = useAuth();
  const [data, setData] = useState<RoomsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedBlockId, setSelectedBlockId] = useState<string>('all');
  const [selectedFloorId, setSelectedFloorId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({ name: '', code: '', description: '', floorCount: 2 });

  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomForm, setRoomForm] = useState({
    block_id: '',
    floor_id: '',
    room_number: '',
    capacity: 3,
    facilities: ['Wi-Fi', 'Study Desk', 'Ceiling Fan'] as string[],
    notes: '',
  });

  const [detailRoom, setDetailRoom] = useState<Room | null>(null);
  const [assignStudentId, setAssignStudentId] = useState('');
  const [assignBedLabel, setAssignBedLabel] = useState('');

  const [deleteRoomTarget, setDeleteRoomTarget] = useState<Room | null>(null);
  const [vacateTarget, setVacateTarget] = useState<{ studentId: number; name: string } | null>(null);
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadRooms = useCallback(async () => {
    setError('');
    try {
      const res = await api.get<RoomsOverview>('/api/rooms/overview');
      setData(res);
      setDetailRoom((prev) => (prev ? res.rooms.find((r) => r.id === prev.id) || null : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const openAddRoom = () => {
    const firstBlock = data?.blocks[0];
    const firstFloor = data?.floors.find((f) => f.block_id === firstBlock?.id);
    setEditingRoom(null);
    setRoomForm({
      block_id: firstBlock ? String(firstBlock.id) : '',
      floor_id: firstFloor ? String(firstFloor.id) : '',
      room_number: '',
      capacity: 3,
      facilities: ['Wi-Fi', 'Study Desk', 'Ceiling Fan'],
      notes: '',
    });
    setActionError('');
    setRoomModalOpen(true);
  };

  const openEditRoom = (room: Room) => {
    setEditingRoom(room);
    setRoomForm({
      block_id: String(room.block_id),
      floor_id: String(room.floor_id),
      room_number: room.room_number,
      capacity: room.capacity,
      facilities: room.facilities,
      notes: room.notes || '',
    });
    setActionError('');
    setRoomModalOpen(true);
  };

  const submitBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setSaving(true);
    try {
      await api.post('/api/rooms/blocks', {
        name: blockForm.name,
        code: blockForm.code,
        description: blockForm.description,
        floorCount: Number(blockForm.floorCount),
      });
      setBlockModalOpen(false);
      setBlockForm({ name: '', code: '', description: '', floorCount: 2 });
      await loadRooms();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create block');
    } finally {
      setSaving(false);
    }
  };

  const submitRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setSaving(true);
    try {
      const payload = {
        block_id: Number(roomForm.block_id),
        floor_id: Number(roomForm.floor_id),
        room_number: roomForm.room_number,
        capacity: Number(roomForm.capacity),
        facilities: roomForm.facilities,
        notes: roomForm.notes,
      };
      if (editingRoom) {
        await api.put(`/api/rooms/${editingRoom.id}`, payload);
      } else {
        await api.post('/api/rooms', payload);
      }
      setRoomModalOpen(false);
      await loadRooms();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save room');
    } finally {
      setSaving(false);
    }
  };

  const handleAllocateToRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailRoom || !assignStudentId) return;
    setActionError('');
    setSaving(true);
    try {
      await api.post('/api/rooms/allocate', {
        student_id: Number(assignStudentId),
        room_id: detailRoom.id,
        bed_label: assignBedLabel.trim() || undefined,
      });
      setAssignStudentId('');
      setAssignBedLabel('');
      await loadRooms();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Allocation failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleMaintenance = async (room: Room) => {
    setActionError('');
    try {
      await api.post(`/api/rooms/${room.id}/maintenance`, {
        underMaintenance: room.status !== 'maintenance',
        notes: room.status !== 'maintenance' ? 'Marked under maintenance' : '',
      });
      await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update maintenance status');
    }
  };

  const confirmDeleteRoom = async () => {
    if (!deleteRoomTarget) return;
    setSaving(true);
    try {
      await api.delete(`/api/rooms/${deleteRoomTarget.id}`);
      setDeleteRoomTarget(null);
      await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete room');
    } finally {
      setSaving(false);
    }
  };

  const confirmVacateBed = async () => {
    if (!vacateTarget) return;
    setSaving(true);
    try {
      await api.post('/api/rooms/vacate', { student_id: vacateTarget.studentId });
      setVacateTarget(null);
      await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to vacate bed');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <LoadingState label="Loading blocks and rooms..." />;
  if (!data) return <ErrorBanner message={error || 'Unable to load rooms'} onRetry={loadRooms} />;

  const availableFloors =
    selectedBlockId === 'all'
      ? data.floors
      : data.floors.filter((f) => String(f.block_id) === selectedBlockId);

  const filteredRooms = data.rooms.filter((r) => {
    if (selectedBlockId !== 'all' && String(r.block_id) !== selectedBlockId) return false;
    if (selectedFloorId !== 'all' && String(r.floor_id) !== selectedFloorId) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  const modalFloors = data.floors.filter((f) => String(f.block_id) === roomForm.block_id);

  return (
    <div>
      <PageHeader
        title="Room & Block Management"
        subtitle="Configure hostel blocks, floors, room capacity, bed availability, and maintenance status"
        actions={
          can('rooms', 'create') ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setActionError('');
                  setBlockModalOpen(true);
                }}
                className="h-[40px] px-4 rounded-[8px] border border-[#E9E9E9] bg-white text-[15px] font-semibold leading-[1.3] text-[#292929] flex items-center gap-2 hover:bg-[#F4F4F4]"
              >
                <Building2 className="w-4 h-4" />
                Add Block
              </button>
              <button
                type="button"
                onClick={openAddRoom}
                className="h-[40px] px-4 rounded-[8px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] flex items-center gap-2 hover:bg-[#333333]"
              >
                <Plus className="w-4 h-4" />
                Add Room
              </button>
            </>
          ) : null
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadRooms} /> : null}

      {/* Summary Strip */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Rooms" value={data.summary.totalRooms} icon={Building2} tone="neutral" />
        <StatCard label="Occupied Rooms" value={data.summary.occupiedRooms} icon={BedDouble} tone="lavender" />
        <StatCard
          label="Available Beds"
          value={`${data.summary.availableBeds}/${data.summary.operationalBeds}`}
          icon={BedDouble}
          tone="blue"
        />
        <StatCard label="Under Maintenance" value={data.summary.maintenanceRooms} icon={Wrench} tone="lime" />
      </div>

      {/* Block & Floor Navigation */}
      <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-4 mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedBlockId('all');
              setSelectedFloorId('all');
            }}
            className={`px-3.5 py-2 rounded-[8px] text-[15px] font-semibold leading-[1.3] transition-colors ${
              selectedBlockId === 'all'
                ? 'bg-[#222222] text-white'
                : 'bg-[#F4F4F4] text-[#292929] hover:bg-[#E9E9E9]'
            }`}
          >
            All Blocks
          </button>
          {data.blocks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setSelectedBlockId(String(b.id));
                setSelectedFloorId('all');
              }}
              className={`px-3.5 py-2 rounded-[8px] text-[15px] font-semibold leading-[1.3] transition-colors ${
                selectedBlockId === String(b.id)
                  ? 'bg-[#222222] text-white'
                  : 'bg-[#F4F4F4] text-[#292929] hover:bg-[#E9E9E9]'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedFloorId}
            onChange={(e) => setSelectedFloorId(e.target.value)}
            aria-label="Filter by floor"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] bg-white"
          >
            <option value="all">All Floors</option>
            {availableFloors.map((f) => (
              <option key={f.id} value={f.id}>
                {selectedBlockId === 'all'
                  ? `${data.blocks.find((b) => b.id === f.block_id)?.name} · ${f.label}`
                  : f.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by room status"
            className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="occupied">Full / Occupied</option>
            <option value="maintenance">Under Maintenance</option>
          </select>
        </div>
      </div>

      {/* Room Occupancy Grid */}
      {filteredRooms.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="No rooms found"
          description="Adjust block/floor filters or add a new room."
        />
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {filteredRooms.map((room) => {
            const pct = room.capacity > 0 ? Math.round((room.occupied_beds / room.capacity) * 100) : 0;
            const statusText =
              room.status === 'maintenance'
                ? 'Maintenance'
                : room.occupied_beds >= room.capacity
                  ? 'Full'
                  : `${room.available_beds} Free`;
            const statusColor =
              room.status === 'maintenance'
                ? 'text-[#C97A16]'
                : room.occupied_beds >= room.capacity
                  ? 'text-[#292929]'
                  : 'text-[#22A06B]';

            return (
              <div
                key={room.id}
                className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5 flex flex-col justify-between shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="text-[13px] font-semibold uppercase tracking-wide text-[#777777]">
                        {room.block_name} · {room.floor_label}
                      </div>
                      <h3 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929]">Room {room.room_number}</h3>
                    </div>
                    <span className={`text-[14px] font-semibold leading-[1.35] ${statusColor}`}>{statusText}</span>
                  </div>

                  {/* Bed Progress */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[14px] leading-[1.45] text-[#777777] mb-1">
                      <span>Occupancy</span>
                      <span className="font-semibold text-[#292929]">
                        {room.occupied_beds} / {room.capacity} Beds
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#F4F4F4] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          room.status === 'maintenance'
                            ? 'bg-[#C97A16]'
                            : room.occupied_beds >= room.capacity
                              ? 'bg-[#CEB5EF]'
                              : 'bg-[#DDF58A]'
                        }`}
                        style={{ width: `${room.status === 'maintenance' ? 100 : pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Facilities */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {room.facilities.slice(0, 4).map((fac) => (
                      <span
                        key={fac}
                        className="px-2.5 py-0.5 text-[13px] bg-[#F4F4F4] text-[#777777] rounded-[6px]"
                      >
                        {fac}
                      </span>
                    ))}
                  </div>

                  {/* Occupants Preview */}
                  <div className="text-[15px] leading-[1.45] text-[#777777] space-y-1 border-t border-[#E9E9E9] pt-2.5">
                    {room.occupants.length === 0 ? (
                      <span className="italic">
                        {room.status === 'maintenance'
                          ? room.notes || 'Under maintenance'
                          : 'No students assigned'}
                      </span>
                    ) : (
                      room.occupants.map((o) => (
                        <div key={o.allocation_id} className="flex items-center justify-between gap-2 text-[#292929]">
                          <span className="truncate font-medium">{o.full_name}</span>
                          <span className="text-[14px] text-[#777777] shrink-0">{o.bed_label}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-[#E9E9E9]">
                  <button
                    type="button"
                    onClick={() => {
                      setActionError('');
                      setDetailRoom(room);
                    }}
                    className="px-3.5 py-1.5 text-[15px] font-semibold leading-[1.3] bg-[#F4F4F4] text-[#292929] rounded-[7px] hover:bg-[#E9E9E9]"
                  >
                    Manage Beds
                  </button>
                  <div className="flex items-center gap-1">
                    {can('rooms', 'edit') ? (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleMaintenance(room)}
                          title={room.status === 'maintenance' ? 'Clear Maintenance' : 'Mark Under Maintenance'}
                          className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4]"
                        >
                          <Wrench className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditRoom(room)}
                          title="Edit Room"
                          className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4]"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </>
                    ) : null}
                    {can('rooms', 'delete') && room.occupied_beds === 0 ? (
                      <button
                        type="button"
                        onClick={() => setDeleteRoomTarget(room)}
                        title="Delete Unoccupied Room"
                        className="p-1.5 rounded-[6px] text-[#777777] hover:text-[#D9383A] hover:bg-[#D9383A]/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Block Modal */}
      <Modal
        open={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        title="Add Hostel Block"
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setBlockModalOpen(false)}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="block-form"
              disabled={saving}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
            >
              {saving ? 'Creating...' : 'Create Block'}
            </button>
          </>
        }
      >
        <form id="block-form" onSubmit={submitBlock} className="space-y-4">
          {actionError ? <ErrorBanner message={actionError} /> : null}
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Block Name *</label>
            <input
              required
              value={blockForm.name}
              onChange={(e) => setBlockForm({ ...blockForm, name: e.target.value })}
              placeholder="e.g. Block C"
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Block Code *</label>
              <input
                required
                value={blockForm.code}
                onChange={(e) => setBlockForm({ ...blockForm, code: e.target.value })}
                placeholder="e.g. BLK-C"
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Initial Floors *</label>
              <input
                type="number"
                min={1}
                max={15}
                required
                value={blockForm.floorCount}
                onChange={(e) => setBlockForm({ ...blockForm, floorCount: Number(e.target.value) })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Description</label>
            <input
              value={blockForm.description}
              onChange={(e) => setBlockForm({ ...blockForm, description: e.target.value })}
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>
        </form>
      </Modal>

      {/* Add / Edit Room Modal */}
      <Modal
        open={roomModalOpen}
        onClose={() => setRoomModalOpen(false)}
        title={editingRoom ? `Edit Room ${editingRoom.room_number}` : 'Add New Room'}
        maxWidth="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setRoomModalOpen(false)}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="room-form"
              disabled={saving}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
            >
              {saving ? 'Saving...' : 'Save Room'}
            </button>
          </>
        }
      >
        <form id="room-form" onSubmit={submitRoom} className="space-y-4">
          {actionError ? <ErrorBanner message={actionError} /> : null}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Block *</label>
              <select
                required
                value={roomForm.block_id}
                onChange={(e) => {
                  const nextBlockId = e.target.value;
                  const firstFloor = data.floors.find((f) => String(f.block_id) === nextBlockId);
                  setRoomForm({
                    ...roomForm,
                    block_id: nextBlockId,
                    floor_id: firstFloor ? String(firstFloor.id) : '',
                  });
                }}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              >
                {data.blocks.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Floor *</label>
              <select
                required
                value={roomForm.floor_id}
                onChange={(e) => setRoomForm({ ...roomForm, floor_id: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              >
                {modalFloors.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Room Number *</label>
              <input
                required
                value={roomForm.room_number}
                onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })}
                placeholder="e.g. 204"
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Bed Capacity *</label>
              <input
                type="number"
                min={editingRoom ? Math.max(1, editingRoom.occupied_beds) : 1}
                max={20}
                required
                value={roomForm.capacity}
                onChange={(e) => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-2">Facilities</label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_FACILITIES.map((fac) => {
                const active = roomForm.facilities.includes(fac);
                return (
                  <button
                    key={fac}
                    type="button"
                    onClick={() =>
                      setRoomForm((prev) => ({
                        ...prev,
                        facilities: active
                          ? prev.facilities.filter((f) => f !== fac)
                          : [...prev.facilities, fac],
                      }))
                    }
                    className={`px-3 py-1.5 rounded-[7px] text-[15px] font-semibold leading-[1.3] border ${
                      active
                        ? 'bg-[#222222] text-white border-[#222222]'
                        : 'bg-white text-[#292929] border-[#E9E9E9]'
                    }`}
                  >
                    {fac}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Notes</label>
            <input
              value={roomForm.notes}
              onChange={(e) => setRoomForm({ ...roomForm, notes: e.target.value })}
              className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>
        </form>
      </Modal>

      {/* Room Detail & Allocation Modal */}
      <Modal
        open={Boolean(detailRoom)}
        onClose={() => setDetailRoom(null)}
        title={detailRoom ? `Room ${detailRoom.room_number} — ${detailRoom.block_name}` : ''}
        subtitle={
          detailRoom
            ? `${detailRoom.floor_label} · ${detailRoom.occupied_beds}/${detailRoom.capacity} beds occupied`
            : ''
        }
        maxWidth="md"
      >
        {detailRoom ? (
          <div className="space-y-5">
            {actionError ? <ErrorBanner message={actionError} /> : null}

            <div>
              <h3 className="font-slab text-[15px] font-normal uppercase tracking-wide text-[#777777] mb-2">
                Assigned Students
              </h3>
              {detailRoom.occupants.length === 0 ? (
                <p className="text-[16px] leading-[1.5] text-[#777777] py-3 border border-[#E9E9E9] rounded-[8px] px-4">
                  No students currently assigned to this room.
                </p>
              ) : (
                <div className="divide-y divide-[#E9E9E9] border border-[#E9E9E9] rounded-[8px]">
                  {detailRoom.occupants.map((occ) => (
                    <div key={occ.allocation_id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-[16px] font-semibold text-[#292929]">{occ.full_name}</div>
                        <div className="text-[14px] leading-[1.45] text-[#777777]">
                          {occ.student_code} · {occ.bed_label} · {occ.phone}
                        </div>
                      </div>
                      {can('rooms', 'edit') ? (
                        <button
                          type="button"
                          onClick={() => setVacateTarget({ studentId: occ.student_id, name: occ.full_name })}
                          className="px-3 py-1.5 text-[15px] font-semibold leading-[1.3] text-[#D9383A] border border-[#D9383A]/30 rounded-[7px] hover:bg-[#D9383A]/10"
                        >
                          Vacate Bed
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {can('rooms', 'edit') &&
            detailRoom.status !== 'maintenance' &&
            detailRoom.available_beds > 0 ? (
              <form
                onSubmit={handleAllocateToRoom}
                className="border-t border-[#E9E9E9] pt-4 space-y-3"
              >
                <h3 className="font-slab text-[15px] font-normal uppercase tracking-wide text-[#777777]">
                  Allocate Unassigned Student
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <select
                    required
                    value={assignStudentId}
                    onChange={(e) => setAssignStudentId(e.target.value)}
                    className="col-span-2 h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  >
                    <option value="">Select unassigned active student...</option>
                    {data.unassignedStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.student_code})
                      </option>
                    ))}
                  </select>
                  <input
                    value={assignBedLabel}
                    onChange={(e) => setAssignBedLabel(e.target.value)}
                    placeholder="Bed Label (opt.)"
                    className="h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving || data.unassignedStudents.length === 0}
                  className="h-[40px] px-4 bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px] inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  Allocate Student to Room
                </button>
              </form>
            ) : detailRoom.status === 'maintenance' ? (
              <div className="p-3 bg-[#C97A16]/10 border border-[#C97A16]/30 rounded-[8px] text-[14px] leading-[1.45] text-[#C97A16] font-medium">
                This room is marked under maintenance and cannot receive new bed allocations.
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteRoomTarget)}
        onClose={() => setDeleteRoomTarget(null)}
        onConfirm={confirmDeleteRoom}
        loading={saving}
        title="Delete Room"
        message={`Delete unoccupied Room ${deleteRoomTarget?.room_number}? This action cannot be undone.`}
        confirmLabel="Delete Room"
      />

      <ConfirmDialog
        open={Boolean(vacateTarget)}
        onClose={() => setVacateTarget(null)}
        onConfirm={confirmVacateBed}
        loading={saving}
        title="Vacate Bed"
        message={`Release bed allocation for ${vacateTarget?.name}?`}
        confirmLabel="Vacate Bed"
      />
    </div>
  );
};

