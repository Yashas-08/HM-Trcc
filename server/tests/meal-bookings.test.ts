import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { initializeSchema } from '../db/schema.js';
import { createDatabase, setDbForTest } from '../db/database.js';
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
  const memDb = createDatabase(':memory:');
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

test('Room-Based Meal Booking & Room Section UI workflow validation', async () => {
  // 1. Auth & Permissions
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

  const today = new Date().toISOString().slice(0, 10);

  // 2. Date Selection & Overview
  const overviewRes = await apiReq(`/api/mess/overview?date=${today}`, { token: adminToken });
  assert.equal(overviewRes.status, 200);
  assert.equal(overviewRes.data?.selectedDate, today);
  assert.ok(Array.isArray(overviewRes.data?.room_summary));
  assert.ok(Array.isArray(overviewRes.data?.room_meal_summary));

  // 3. Breakfast, Lunch and Dinner Filtering
  for (const meal of ['breakfast', 'lunch', 'dinner']) {
    const mealRes = await apiReq(`/api/mess/overview?date=${today}&mealType=${meal}`, { token: messToken });
    assert.equal(mealRes.status, 200);
    const bookings = mealRes.data?.bookings as Array<{ meal_type: string }>;
    assert.ok(bookings.length > 0);
    assert.ok(bookings.every((b) => b.meal_type === meal));

    const roomSummary = mealRes.data?.room_summary as Array<{
      room_number: string;
      total_bookings: number;
      served_count: number;
      pending_count: number;
    }>;
    assert.ok(roomSummary.length > 0);
    for (const r of roomSummary) {
      assert.ok(r.total_bookings > 0);
      assert.equal(r.total_bookings, r.served_count + r.pending_count);
    }
  }

  // 4. View Room Numbers & Open Room (e.g. Room 101)
  const room101Res = await apiReq(`/api/mess/overview?date=${today}&roomNumber=101`, { token: messToken });
  assert.equal(room101Res.status, 200);
  const r101Bookings = room101Res.data?.bookings as Array<{ room_number: string; student_name: string; student_code: string; booking_code: string; booking_status: string; verified_status: string }>;
  assert.ok(r101Bookings.length > 0);
  assert.ok(r101Bookings.every((b) => b.room_number === '101'));

  // 5. Switch meals inside room details
  const r101Breakfast = await apiReq(`/api/mess/overview?date=${today}&roomNumber=101&mealType=breakfast`, { token: messToken });
  assert.equal(r101Breakfast.status, 200);
  const r101Lunch = await apiReq(`/api/mess/overview?date=${today}&roomNumber=101&mealType=lunch`, { token: messToken });
  assert.equal(r101Lunch.status, 200);
  const r101Dinner = await apiReq(`/api/mess/overview?date=${today}&roomNumber=101&mealType=dinner`, { token: messToken });
  assert.equal(r101Dinner.status, 200);

  // 6. Correct Student Booking Records
  const sample = (r101Breakfast.data?.bookings as Array<Record<string, unknown>>)[0];
  assert.ok(sample.student_name);
  assert.ok(sample.student_code);
  assert.equal(sample.room_number, '101');
  assert.equal(sample.meal_type, 'breakfast');
  assert.ok(sample.booking_code);
  assert.ok(sample.booking_status);
  assert.ok(sample.verified_status);

  // 7. QR Verification & Direct Verification
  const pendingBooking = (r101Dinner.data?.bookings as Array<{ id: number; qr_token: string; verified_status: string }>).find(
    (b) => b.verified_status === 'pending',
  );
  assert.ok(pendingBooking);

  // Direct table verification
  const directVerify = await apiReq(`/api/mess/bookings/${pendingBooking.id}/verify`, {
    method: 'PATCH',
    token: messToken,
  });
  assert.equal(directVerify.status, 200);

  // 8. Duplicate Verification Prevention
  const dupVerify = await apiReq(`/api/mess/bookings/${pendingBooking.id}/verify`, {
    method: 'PATCH',
    token: messToken,
  });
  assert.equal(dupVerify.status, 409);

  // Also via QR verify endpoint
  const qrDup = await apiReq('/api/mess/qr/verify', {
    method: 'POST',
    token: messToken,
    body: { qr_token: pendingBooking.qr_token, meal_type: 'dinner' },
  });
  assert.equal(qrDup.status, 409);
  assert.equal(qrDup.data?.result, 'duplicate');

  // 9. Rooms Section Overview data
  const roomsRes = await apiReq('/api/rooms/overview', { token: adminToken });
  assert.equal(roomsRes.status, 200);
  const rooms = roomsRes.data?.rooms as Array<{ room_number: string; occupied_beds: number; capacity: number; status: string }>;
  assert.ok(rooms.length > 0);
  assert.ok(rooms.some((r) => r.room_number === '101'));
});
