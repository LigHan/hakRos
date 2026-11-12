'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, unlink, rmdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const express = require('express');
const sqlite = require('sqlite3');
const createConnections = require('../connections');
const createMessages = require('../messages');
const createStatistics = require('../statistics');

async function setup(filename = ':memory:') {
  const db = new sqlite.Database(filename);
  await new Promise((resolve, reject) => db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, surname TEXT, role TEXT);
    CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY);
    INSERT OR IGNORE INTO users VALUES
      (1, 'Анна', NULL, 'user'), (2, 'Борис', NULL, 'user'),
      (3, 'Вера', NULL, 'user'), (4, 'Кафе', NULL, 'company');
  `, error => error ? reject(error) : resolve()));
  const statistics = createStatistics(db);
  const connections = createConnections(db, statistics.auth);
  const messages = createMessages(db, statistics.auth);
  await connections.initialize();
  await messages.initialize();
  const app = express();
  app.use(express.json());
  app.use('/api/connections', connections.router);
  app.use('/api/messages', messages.router);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const tokens = [null, ...[1, 2, 3, 4].map(id => statistics.issue({ id: String(id), role: id === 4 ? 'company' : 'user' }))];
  async function request(path, viewer, status, method = 'GET', body) {
    const response = await fetch(origin + '/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(viewer ? { Authorization: 'Bearer ' + tokens[viewer] } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    if (path.startsWith('/messages') && status < 400) assert.equal(response.headers.get('cache-control'), 'no-store');
    return data;
  }
  async function befriend(first, second) {
    await request(`/connections/friends/${second}/request`, first, 200, 'PUT');
    await request(`/connections/friends/${first}/accept`, second, 200, 'PUT');
  }
  async function close() {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
  }
  return { request, befriend, close };
}

const message = body => ({ body, requestId: randomUUID() });

test('Чат доступен подтверждённым друзьям и переживает перезапуск сервера', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'hakros-messages-'));
  const file = join(directory, 'chat.db');
  let api;
  t.after(async () => {
    await api?.close();
    await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(directory);
  });
  api = await setup(file);
  const send = message('Пойдём в парк?');
  await api.request('/messages/unread', null, 401);
  await api.request('/messages', 4, 403);
  await api.request('/messages/1', 1, 400);
  await api.request('/messages/2', 1, 404);
  await api.request('/connections/friends/2/request', 1, 200, 'PUT');
  await api.request('/messages/2', 1, 404, 'POST', send);
  await api.request('/connections/friends/1/accept', 2, 200, 'PUT');
  const empty = await api.request('/messages/2', 1, 200);
  assert.deepEqual(empty, { friend: { id: '2', name: 'Борис' }, messages: [], hasMore: false });
  await api.request('/messages/2', 1, 400, 'POST', message('   '));
  await api.request('/messages/2', 1, 400, 'POST', message('а'.repeat(2001)));

  const created = await api.request('/messages/2', 1, 201, 'POST', send);
  assert.equal(created.mine, true);
  assert.deepEqual(await api.request('/messages/2', 1, 200, 'POST', send), created);
  await api.request('/messages/2', 1, 409, 'POST', { ...send, body: 'Другой текст' });
  const second = await api.request('/messages/2', 1, 201, 'POST', message('Встретимся после пар.'));
  const reply = await api.request('/messages/1', 2, 201, 'POST', message('Да, давай.'));

  assert.deepEqual(await api.request('/messages/unread', 1, 200), { unread: 1 });
  assert.deepEqual(await api.request('/messages/unread', 2, 200), { unread: 2 });
  const inbox = await api.request('/messages', 2, 200);
  assert.deepEqual(inbox.conversations, [{ friend: { id: '1', name: 'Анна' }, latest: reply, unread: 2 }]);
  assert.deepEqual(await api.request('/messages', 3, 200), { conversations: [] });
  await api.request('/messages/1', 3, 404);
  await api.request('/messages/1/read', 3, 404, 'PUT', { throughId: created.id });
  await api.request('/messages/1/read', 2, 404, 'PUT', { throughId: reply.id });
  await api.request('/messages/1/read', 2, 200, 'PUT', { throughId: created.id });
  await api.request('/messages/1/read', 2, 200, 'PUT', { throughId: created.id });
  assert.deepEqual(await api.request('/messages/unread', 2, 200), { unread: 1 });

  await api.close();
  api = null;
  api = await setup(file);
  const history = await api.request('/messages/1', 2, 200);
  assert.deepEqual(history.messages, [{ ...created, mine: false }, { ...second, mine: false }, reply]);
  assert.deepEqual(await api.request('/messages/unread', 2, 200), { unread: 1 });
  await api.request('/connections/friends/1', 2, 200, 'DELETE');
  await api.request('/messages/1', 2, 404);
  await api.request('/messages/1/read', 2, 404, 'PUT', { throughId: second.id });
  await api.request('/messages/2', 1, 404, 'POST', send);
  assert.deepEqual(await api.request('/messages', 2, 200), { conversations: [] });
  assert.deepEqual(await api.request('/messages/unread', 2, 200), { unread: 0 });
});

test('Страницы истории и обновлений идут без пропусков и сохраняют порядок', async t => {
  const api = await setup();
  t.after(api.close);
  await api.befriend(1, 2);
  const sent = [];
  for (let i = 1; i <= 44; i++) {
    sent.push(await api.request('/messages/2', 1, 201, 'POST', message(`Сообщение ${i}`)));
  }
  const recent = await api.request('/messages/2', 1, 200);
  assert.deepEqual(recent.messages, sent.slice(4));
  assert.equal(recent.hasMore, true);
  const older = await api.request(`/messages/2?before=${recent.messages[0].id}`, 1, 200);
  assert.deepEqual(older.messages, sent.slice(0, 4));
  assert.equal(older.hasMore, false);
  const firstUpdate = await api.request(`/messages/2?after=${sent[0].id}`, 1, 200);
  assert.deepEqual(firstUpdate.messages, sent.slice(1, 41));
  assert.equal(firstUpdate.hasMore, true);
  const tail = await api.request(`/messages/2?after=${firstUpdate.messages.at(-1).id}`, 1, 200);
  assert.deepEqual(tail.messages, sent.slice(41));
  assert.equal(tail.hasMore, false);
  await api.request('/messages/2?before=1&after=2', 1, 400);
});
