'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { tmpdir } = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const sqlite = require('sqlite3');
const createStatistics = require('../statistics');
const createPlans = require('../leisure-plans');

async function setup(dbPath = ':memory:') {
  const db = new sqlite.Database(dbPath);
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, e => e ? reject(e) : resolve()));
  await exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, surname TEXT, role TEXT);
    CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY, place TEXT, address TEXT, image TEXT);
    CREATE TABLE IF NOT EXISTS friendships(low_id INTEGER, high_id INTEGER, requested_by INTEGER, accepted INTEGER, PRIMARY KEY(low_id,high_id));
    INSERT OR IGNORE INTO users VALUES(1,'Аня',NULL,'user'),(2,'Борис',NULL,'user'),(3,'Вера',NULL,'user'),(4,'Компания',NULL,'company');
    INSERT OR IGNORE INTO posts VALUES('p1','Парк','Адрес','https://example.test/a.png');
    INSERT OR IGNORE INTO friendships VALUES(1,2,1,1);`);
  const stats = createStatistics(db), plans = createPlans(db, stats.auth);
  await plans.initialize(); await plans.initialize();
  const app = express(); app.use(express.json()); app.use('/api/plans', plans.router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const tokens = [null, ...[1, 2, 3, 4].map(id => stats.issue({ id: String(id), role: id === 4 ? 'company' : 'user' }))];
  const root = `http://127.0.0.1:${server.address().port}`;
  async function request(method, url, user, body) {
    const response = await fetch(root + '/api/plans' + url, { method, headers: { 'content-type': 'application/json', ...(user ? { Authorization: `Bearer ${tokens[user]}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  async function close() { await new Promise(resolve => server.close(resolve)); await new Promise(resolve => db.close(resolve)); }
  return { db, exec, request, close };
}

const future = hours => new Date(Date.now() + hours * 3600000).toISOString();
const body = () => ({ placeId: 'p1', startsAt: future(48), timeZone: 'Europe/Moscow', durationMinutes: 120, comment: 'После пар', confirmed: true, requestId: randomUUID() });

test('plan confirmation, validation, ownership, idempotency and privacy', async t => {
  const app = await setup(); t.after(app.close);
  const data = body();
  assert.equal((await app.request('POST', '', null, data)).status, 401);
  assert.equal((await app.request('POST', '', 4, data)).status, 403);
  assert.equal((await app.request('POST', '', 1, { ...data, confirmed: false })).status, 400);
  assert.equal((await app.request('POST', '', 1, { ...data, placeId: 'missing' })).status, 404);
  assert.equal((await app.request('POST', '', 1, { ...data, startsAt: '2099-02-30T12:00:00Z' })).status, 400);
  assert.equal((await app.request('POST', '', 1, { ...data, timeZone: 'invalid/timezone' })).status, 400);
  assert.equal((await app.request('POST', '', 1, { ...data, durationMinutes: -1 })).status, 400);
  const created = await app.request('POST', '', 1, data); assert.equal(created.status, 201);
  const id = created.data.id; assert.equal(created.data.placeName, 'Парк');
  const retry = await app.request('POST', '', 1, data); assert.equal(retry.status, 200); assert.equal(retry.data.id, id);
  assert.equal((await app.request('POST', '', 1, { ...data, comment: 'другое' })).status, 409);
  assert.equal((await app.request('GET', `/${id}`, 3)).status, 404);
  assert.equal((await app.request('PUT', `/${id}`, 2, { ...data, revision: 1 })).status, 404);
  assert.equal((await app.request('POST', `/${id}/cancel`, 2, { confirmed: true })).status, 404);
});

test('two friends invite, accept, confirm changed time, cancel and revoke access', async t => {
  const app = await setup(); t.after(app.close);
  const data = body(); const id = (await app.request('POST', '', 1, data)).data.id;
  assert.equal((await app.request('POST', `/${id}/invitations`, 1, { friendId: '2', revision: 1 })).status, 400);
  assert.equal((await app.request('POST', `/${id}/invitations`, 1, { friendId: '3', revision: 1, confirmed: true })).status, 403);
  const invitation = await app.request('POST', `/${id}/invitations`, 1, { friendId: '2', revision: 1, confirmed: true });
  assert.equal(invitation.status, 201); assert.equal(invitation.data.status, 'pending');
  const repeat = await app.request('POST', `/${id}/invitations`, 1, { friendId: '2', revision: 1, confirmed: true });
  assert.equal(repeat.status, 200); assert.equal(repeat.data.id, invitation.data.id);
  assert.equal((await app.request('GET', '', 2)).data[0].invitationStatus, 'pending');
  assert.equal((await app.request('POST', `/${id}/respond`, 3, { status: 'accepted', revision: 1, confirmed: true })).status, 404);
  assert.equal((await app.request('POST', `/${id}/respond`, 2, { status: 'accepted', revision: 1 })).status, 400);
  assert.equal((await app.request('POST', `/${id}/respond`, 2, { status: 'accepted', revision: 1, confirmed: true })).status, 200);
  assert.equal((await app.request('POST', `/${id}/respond`, 2, { status: 'accepted', revision: 1, confirmed: true })).status, 200);
  assert.equal((await app.request('GET', `/${id}`, 1)).data.participants[0].status, 'accepted');
  const changed = await app.request('PUT', `/${id}`, 1, { ...data, revision: 1, startsAt: future(72) }); assert.equal(changed.status, 200);
  assert.equal((await app.request('PUT', `/${id}`, 1, { ...data, revision: 1, startsAt: future(73) })).status, 409);
  assert.equal((await app.request('POST', `/${id}/respond`, 2, { status: 'accepted', revision: 1, confirmed: true })).status, 409);
  assert.equal((await app.request('GET', `/${id}`, 2)).data.invitationStatus, 'pending');
  await app.request('POST', `/${id}/respond`, 2, { status: 'accepted', revision: 2, confirmed: true });
  assert.equal((await app.request('POST', `/${id}/cancel`, 1, { confirmed: true })).status, 200);
  assert.equal((await app.request('GET', `/${id}`, 2)).data.status, 'cancelled');
  await app.exec('DELETE FROM friendships WHERE low_id=1 AND high_id=2');
  assert.equal((await app.request('GET', `/${id}`, 2)).status, 404);
});

test('declining or cancelling an invitation is restricted to its participants', async t => {
  const app = await setup(); t.after(app.close);
  const id = (await app.request('POST', '', 1, body())).data.id;
  await app.request('POST', `/${id}/invitations`, 1, { friendId: '2', revision: 1, confirmed: true });
  assert.equal((await app.request('POST', `/${id}/invitations/2/cancel`, 3, { confirmed: true })).status, 404);
  assert.equal((await app.request('POST', `/${id}/respond`, 2, { status: 'declined', revision: 1, confirmed: true })).status, 200);
  assert.equal((await app.request('POST', `/${id}/respond`, 2, { status: 'accepted', revision: 1, confirmed: true })).status, 409);
  assert.equal((await app.request('GET', `/${id}`, 2)).status, 404);
  assert.equal((await app.request('GET', `/${id}`, 1)).data.participants[0].status, 'declined');
});

test('revoked invitation does not regain access after the meeting is cancelled', async t => {
  const app = await setup(); t.after(app.close);
  const id = (await app.request('POST', '', 1, body())).data.id;
  await app.request('POST', `/${id}/invitations`, 1, { friendId: '2', revision: 1, confirmed: true });
  assert.equal((await app.request('POST', `/${id}/invitations/2/cancel`, 1, { confirmed: true })).status, 200);
  assert.equal((await app.request('GET', `/${id}`, 2)).status, 404);
  await app.request('POST', `/${id}/cancel`, 1, { confirmed: true });
  assert.equal((await app.request('GET', `/${id}`, 2)).status, 404);
  assert.deepEqual((await app.request('GET', '', 2)).data, []);
});

test('plans and invitations survive reopening SQLite', async t => {
  const file = path.join(tmpdir(), `hakros-plans-${randomUUID()}.sqlite`);
  t.after(() => { try { fs.unlinkSync(file); } catch {} });
  const first = await setup(file), plan = (await first.request('POST', '', 1, body())).data;
  await first.request('POST', `/${plan.id}/invitations`, 1, { friendId: '2', revision: 1, confirmed: true });
  await first.close();
  const second = await setup(file); t.after(second.close);
  assert.equal((await second.request('GET', `/${plan.id}`, 2)).data.invitationStatus, 'pending');
});
