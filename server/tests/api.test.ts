import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Database from 'better-sqlite3';
import { initializeSchema } from '../db/schema.js';
import { setDbForTest } from '../db/database.js';
import { seedDatabase } from '../db/seed.js';
import { createApp } from '../index.js';

let server: http.Server;
let baseUrl: string;

async function apiReq(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, data };
}

test.before(async () => {
  const memDb = new Database(':memory:');
  initializeSchema(memDb);
  setDbForTest(memDb);
  seedDatabase(memDb);

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Auth, RBAC, and all core hostel workflows operate end-to-end with DB persistence', async () => {
  // 1. Login as Super Admin & Mess Staff & Maintenance Staff
  const adminLogin = await apiReq('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@hmtrcc.local', password: 'Admin@123' },
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = String(adminLogin.data?.token);

  const messLogin = await apiReq('/api/auth/login', {
    method: 'POST',
    body: { email: 'mess@hmtrcc.local', password: 'Mess@123' },
  });
  assert.equal(messLogin.status, 200);
  const messToken = String(messLogin.data?.token);

  const maintLogin = await apiReq('/api/auth/login', {
    method: 'POST',
    body: { email: 'maintenance@hmtrcc.local', password: 'Maint@123' },
  });
  assert.equal(maintLogin.status, 200);
  const maintToken = String(maintLogin.data?.token);

  // RBAC: Mess staff cannot access Staff Management or create students
  const forbiddenStaff = await apiReq('/api/staff', { token: messToken });
  assert.equal(forbiddenStaff.status, 403);

  // 2. Dashboard loads live seeded data
  const dash = await apiReq('/api/dashboard', { token: adminToken });
  assert.equal(dash.status, 200);
  const stats = dash.data?.stats as Record<string, number>;
  assert.equal(stats.activeStudents, 18);
  assert.ok(stats.availableBeds > 0);

  // 3. Student Admission & Room Allocation + Business Rules
  const roomsOverview = await apiReq('/api/rooms/overview', { token: adminToken });
  const rooms = roomsOverview.data?.rooms as Array<{ id: number; room_number: string; status: string; available_beds: number }>;
  const maintRoom = rooms.find((r) => r.status === 'maintenance');
  const openRoom = rooms.find((r) => r.status === 'available' && r.available_beds > 0);
  assert.ok(maintRoom && openRoom);

  const newStudent = await apiReq('/api/students', {
    method: 'POST',
    token: adminToken,
    body: {
      full_name: 'Test Resident',
      phone: '9988776655',
      email: 'test.resident@student.edu',
      guardian_name: 'Parent Test',
      guardian_phone: '9988770000',
      admission_date: new Date().toISOString().slice(0, 10),
    },
  });
  assert.equal(newStudent.status, 201);
  const studentId = Number(newStudent.data?.id);

  // Allocation to maintenance room must fail
  const badAlloc = await apiReq(`/api/students/${studentId}/allocate-room`, {
    method: 'POST',
    token: adminToken,
    body: { room_id: maintRoom.id },
  });
  assert.equal(badAlloc.status, 400);

  // Allocation to available room succeeds
  const goodAlloc = await apiReq(`/api/students/${studentId}/allocate-room`, {
    method: 'POST',
    token: adminToken,
    body: { room_id: openRoom.id, bed_label: 'Bed Test' },
  });
  assert.equal(goodAlloc.status, 200);

  // Cannot delete occupied room
  const delOccupied = await apiReq(`/api/rooms/${openRoom.id}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(delOccupied.status, 400);

  // 4. Leave Request -> Approve -> Record Departure -> Movement Integration -> Return
  const depTime = new Date(Date.now() - 3600 * 1000).toISOString().slice(0, 16);
  const retTime = new Date(Date.now() + 7200 * 1000).toISOString().slice(0, 16);
  const createdLeave = await apiReq('/api/leaves', {
    method: 'POST',
    token: adminToken,
    body: {
      student_id: studentId,
      reason: 'Academic conference',
      destination: 'Mumbai',
      departure_at: depTime,
      expected_return_at: retTime,
      guardian_contact_verified: true,
    },
  });
  assert.equal(createdLeave.status, 201);
  const leaveId = Number(createdLeave.data?.id);

  const approvedLeave = await apiReq(`/api/leaves/${leaveId}/approve`, {
    method: 'POST',
    token: adminToken,
  });
  assert.equal(approvedLeave.status, 200);

  const depRes = await apiReq(`/api/leaves/${leaveId}/record-departure`, {
    method: 'POST',
    token: adminToken,
  });
  assert.equal(depRes.status, 200);

  // Duplicate checkout while outside must fail
  const dupCheckout = await apiReq('/api/movements/checkout', {
    method: 'POST',
    token: adminToken,
    body: { student_id: studentId, expected_return_time: retTime },
  });
  assert.equal(dupCheckout.status, 400);

  // Record return closes linked movement
  const retRes = await apiReq(`/api/leaves/${leaveId}/record-return`, {
    method: 'POST',
    token: adminToken,
  });
  assert.equal(retRes.status, 200);

  // 5. Complaints & Maintenance Staff Assignment
  const createdComplaint = await apiReq('/api/complaints', {
    method: 'POST',
    token: adminToken,
    body: {
      student_id: studentId,
      category: 'Plumbing',
      title: 'Test faucet leak',
      description: 'Leaking sink faucet in washroom',
      priority: 'high',
    },
  });
  assert.equal(createdComplaint.status, 201);
  const compId = Number(createdComplaint.data?.id);

  const staffList = await apiReq('/api/staff', { token: adminToken });
  const maintStaff = (staffList.data?.staff as Array<{ id: number; email: string }>).find(
    (u) => u.email === 'maintenance@hmtrcc.local',
  );
  assert.ok(maintStaff);

  const assignRes = await apiReq(`/api/complaints/${compId}/assign`, {
    method: 'POST',
    token: adminToken,
    body: { staff_id: maintStaff.id },
  });
  assert.equal(assignRes.status, 200);

  // Maintenance staff marks resolved
  const resolveRes = await apiReq(`/api/complaints/${compId}/status`, {
    method: 'PATCH',
    token: maintToken,
    body: { status: 'resolved', resolution_notes: 'Replaced tap washer' },
  });
  assert.equal(resolveRes.status, 200);

  // Maintenance staff cannot reopen resolved complaint
  const maintReopen = await apiReq(`/api/complaints/${compId}/status`, {
    method: 'PATCH',
    token: maintToken,
    body: { status: 'reopened' },
  });
  assert.equal(maintReopen.status, 403);

  // 6. Mess Booking Rules & QR Verification
  const today = new Date().toISOString().slice(0, 10);
  const sameDayBooking = await apiReq('/api/mess/bookings', {
    method: 'POST',
    token: messToken,
    body: { student_id: studentId, meal_date: today, meal_type: 'dinner' },
  });
  assert.equal(sameDayBooking.status, 400);

  // Verify a seeded pending dinner QR token once -> succeeds, second scan -> duplicate
  const messData = await apiReq('/api/mess/overview?dateCategory=today', { token: messToken });
  const pendingDinner = (messData.data?.bookings as Array<{ qr_token: string; meal_type: string; verified_status: string }>).find(
    (b) => b.meal_type === 'dinner' && b.verified_status === 'pending',
  );
  assert.ok(pendingDinner);

  const firstScan = await apiReq('/api/mess/qr/verify', {
    method: 'POST',
    token: messToken,
    body: { qr_token: pendingDinner.qr_token, meal_type: 'dinner' },
  });
  assert.equal(firstScan.status, 200);
  assert.equal(firstScan.data?.result, 'success');

  const secondScan = await apiReq('/api/mess/qr/verify', {
    method: 'POST',
    token: messToken,
    body: { qr_token: pendingDinner.qr_token, meal_type: 'dinner' },
  });
  assert.equal(secondScan.status, 409);
  assert.equal(secondScan.data?.result, 'duplicate');

  // 7. Reports & Settings Activity Logs
  const reportsRes = await apiReq('/api/reports', { token: adminToken });
  assert.equal(reportsRes.status, 200);
  const settingsRes = await apiReq('/api/settings', { token: adminToken });
  assert.equal(settingsRes.status, 200);
  assert.ok((settingsRes.data?.activityLogs as unknown[]).length > 0);
});

