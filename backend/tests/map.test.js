'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite = require('sqlite3');
const createMap = require('../map');
const createStatistics = require('../statistics');

test('точки и геопозиция друзей: доступ, модерация и отзыв показа', async t => {
  const db = new sqlite.Database(':memory:');
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, e => e ? reject(e) : resolve()));
  await exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, surname TEXT, role TEXT); INSERT INTO users VALUES (1, 'Аня', 'Иванова', 'user'), (2, 'Борис', NULL, 'user'), (3, 'Вера', NULL, 'user'), (4, 'Глеб', NULL, 'user'), (5, 'Кафе', NULL, 'company'); CREATE TABLE posts (id TEXT PRIMARY KEY); INSERT INTO posts VALUES ('post-1')");
  const oldDemo = process.env.LOCAL_DEMO; process.env.LOCAL_DEMO = '1';
  t.after(() => { if (oldDemo === undefined) delete process.env.LOCAL_DEMO; else process.env.LOCAL_DEMO = oldDemo; });
  let now = 1_000_000;
  const statistics = createStatistics(db);
  const map = createMap(db, statistics.auth, statistics.optionalAuth, { now: () => now });
  const connections = require('../connections')(db, statistics.auth, { onFriendRemoved: map.revokeFriendship });
  await connections.initialize(); await map.initialize();
  const app = express();
  app.use(express.json());
  app.use('/api/map', map.router);
  app.use('/api/connections', connections.router);
  app.use('/api/admin', require('../admin')(db, statistics.auth));
  app.post('/api/logout', statistics.auth, (req, _res, next) => { map.hide(req.account.id); next(); });
  app.use('/api', statistics.router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await new Promise(resolve => db.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api/map`;
  const connectionPath = `http://127.0.0.1:${server.address().port}/api/connections`;
  const user = statistics.issue({ id: '1', role: 'user' });
  const other = statistics.issue({ id: '2', role: 'user' });
  const stranger = statistics.issue({ id: '3', role: 'user' });
  const admin = statistics.issue({ id: 'admin', role: 'admin' });
  const unselected = statistics.issue({ id: '4', role: 'user' });
  const company = statistics.issue({ id: '5', role: 'company' });
  async function request(path, method = 'GET', token, body) {
    const result = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: result.status, data: await result.json(), headers: result.headers };
  }
  const point = { name: 'Парк', latitude: 48, longitude: 37 };
  assert.equal((await request('/places', 'POST', null, point)).status, 401);
  assert.equal((await request('/places', 'POST', user, { ...point, latitude: 91 })).status, 400);
  assert.equal((await request('/places', 'POST', user, { ...point, postId: 'post-1' })).status, 403);
  assert.equal((await request('/places', 'POST', user, point)).status, 201);
  const created = (await request('/places', 'GET', user)).data[0];
  assert.equal(created.name, 'Парк');
  assert.equal(created.reviewStatus, 'private');
  assert.equal((await request('/places')).data.length, 0);
  assert.equal((await request('/places', 'GET', other)).data.length, 0);
  assert.equal((await request('/places', 'GET', admin)).data.length, 0);
  const connection = (path, method, token) => fetch(connectionPath + path, { method, headers:{Authorization:`Bearer ${token}`} });
  assert.equal((await connection('/friends/2/request', 'PUT', user)).status, 200);
  assert.equal((await request('/places', 'GET', other)).data.length, 0);
  assert.equal((await connection('/friends/1/accept', 'PUT', stranger)).status, 404);
  assert.equal((await connection('/friends/2/accept', 'PUT', user)).status, 404);
  assert.equal((await connection('/friends/1/accept', 'PUT', other)).status, 200);
  assert.equal((await request('/places', 'GET', other)).data[0].id, created.id);
  assert.equal((await request('/places', 'GET', stranger)).data.length, 0);
  assert.equal((await connection('/friends/1', 'DELETE', other)).status, 200);
  assert.equal((await request('/places', 'GET', other)).data.length, 0);
  assert.equal((await connection('/friends/2/request', 'PUT', user)).status, 200);
  assert.equal((await connection('/friends/1/accept', 'PUT', other)).status, 200);
  assert.equal((await request(`/places/${created.id}`, 'DELETE', other)).status, 403);
  assert.equal((await request(`/places/${created.id}`, 'DELETE', admin)).status, 403);
  assert.equal((await request(`/places/${created.id}/submit`, 'POST', other)).status, 409);
  assert.equal((await request(`/places/${created.id}/submit`, 'POST', user)).status, 200);
  assert.equal((await request('/places')).data.length, 0);
  assert.equal((await request('/places', 'GET', admin)).data[0].reviewStatus, 'pending');
  async function review(token,decision) {
    return fetch(`http://127.0.0.1:${server.address().port}/api/admin/map-places/${created.id}/review`, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({decision})});
  }
  assert.equal((await review(other,'approve')).status,403);
  assert.equal((await review(admin,'reject')).status,200);
  assert.equal((await request('/places', 'GET', admin)).data.length, 0);
  assert.equal((await request(`/places/${created.id}/submit`, 'POST', user)).status,200);
  assert.equal((await review(admin,'approve')).status,200);
  assert.equal((await request('/places')).data[0].reviewStatus, 'approved');
  assert.equal((await review(admin,'approve')).status,409);
  assert.equal((await request('/places', 'POST', admin, { ...point, postId: 'post-1' })).status, 201);
  assert.equal((await request('/places', 'POST', admin, { ...point, longitude: 38, postId: 'post-1' })).status, 201);
  assert.equal((await request('/places')).data.find(p => p.postId === 'post-1').longitude, 38);
  assert.equal((await request(`/places/${created.id}`, 'DELETE', admin)).status, 200);

  assert.equal((await connection('/friends/4/request', 'PUT', user)).status, 200);
  assert.equal((await connection('/friends/1/accept', 'PUT', unselected)).status, 200);
  assert.equal((await connection('/friends/3/request', 'PUT', user)).status, 200);

  const start = (recipientIds, token = user) => request('/location', 'POST', token, { recipientIds });
  const publish = (id, token = user) => request('/location/' + id, 'PUT', token, {
    latitude: 48.015831, longitude: 37.802677,
  });
  const view = token => request('/locations', 'GET', token);
  const stop = (id, token = user) => request('/location/' + id, 'DELETE', token);

  assert.equal((await view()).status, 401);
  assert.equal((await view(admin)).status, 403);
  assert.equal((await view(company)).status, 403);
  assert.equal((await start(['2'], company)).status, 403);
  assert.equal((await start([])).status, 400);
  assert.equal((await start(['1'])).status, 400);
  assert.equal((await start(['2', '3'])).status, 403);
  assert.deepEqual((await view(other)).data, []);

  const initial = await start(['2']);
  assert.equal(initial.status, 201);
  assert.deepEqual((await view(other)).data, []);
  assert.equal((await publish(initial.data.id, other)).status, 404);
  assert.equal((await publish(initial.data.id)).status, 200);
  const visible = await view(other);
  assert.equal(visible.headers.get('cache-control'), 'no-store');
  assert.deepEqual(visible.data, [{
    id: '1', name: 'Аня Иванова', latitude: 48.016, longitude: 37.803, updatedAt: now, expiresInMs: 300_000,
  }]);
  for (const token of [user, unselected, stranger]) assert.deepEqual((await view(token)).data, []);

  now += 299_999;
  assert.equal((await view(other)).data[0].expiresInMs, 1);
  now++;
  assert.deepEqual((await view(other)).data, []);
  assert.equal((await publish(initial.data.id)).status, 404);

  const next = (await start(['2', '4'])).data.id;
  assert.equal((await publish(next)).status, 200);
  assert.equal((await stop(initial.data.id)).status, 200);
  assert.equal((await view(other)).data.length, 1);
  assert.equal((await connection('/friends/1', 'DELETE', other)).status, 200);
  assert.deepEqual((await view(other)).data, []);
  assert.equal((await view(unselected)).data.length, 1);
  assert.equal((await connection('/friends/2/request', 'PUT', user)).status, 200);
  assert.equal((await connection('/friends/1/accept', 'PUT', other)).status, 200);
  assert.deepEqual((await view(other)).data, []);
  assert.equal((await stop(next)).status, 200);
  assert.deepEqual((await view(unselected)).data, []);
  assert.equal((await publish(next)).status, 404);

  const finalShare = (await start(['4'])).data.id;
  assert.equal((await publish(finalShare)).status, 200);
  const logout = await fetch(`http://127.0.0.1:${server.address().port}/api/logout`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + user },
  });
  assert.equal(logout.status, 200);
  assert.deepEqual((await view(unselected)).data, []);
  assert.equal((await publish(finalShare)).status, 401);
});

test('миграция старой базы сохраняет точки закрытыми по умолчанию', async t => {
  const db = new sqlite.Database(':memory:');
  t.after(() => new Promise(resolve => db.close(resolve)));
  await new Promise((resolve,reject) => db.exec("CREATE TABLE map_places(id TEXT PRIMARY KEY,name TEXT,latitude REAL,longitude REAL,creator_id TEXT,post_id TEXT UNIQUE,created_at TEXT); INSERT INTO map_places VALUES('legacy','Старое',48,37,'1',NULL,'2026')", e => e ? reject(e) : resolve()));
  const map = createMap(db, (_req,_res,next) => next(), (_req,_res,next) => next());
  await map.initialize(); await map.initialize();
  const row = await new Promise((resolve,reject) => db.get("SELECT review_status FROM map_places WHERE id='legacy'", (e,value) => e ? reject(e) : resolve(value)));
  assert.equal(row.review_status,'private');
});
