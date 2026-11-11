'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, unlink, rmdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

const connectionsPath = '/api/connections';

async function startApi(database) {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DB_PATH: database, LOCAL_DEMO: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  let errors = '';
  server.stderr.on('data', chunk => { errors += chunk; });

  async function stop() {
    if (server.exitCode !== null || server.signalCode !== null) return;
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }

  let origin;
  try {
    origin = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Сервер не запустился: ${errors}`)), 8_000);
      server.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      server.once('exit', code => {
        clearTimeout(timeout);
        reject(new Error(`Сервер завершился (${code}): ${errors}`));
      });
      server.stdout.on('data', chunk => {
        output += chunk;
        const match = /http:\/\/127\.0\.0\.1:(\d+)\/api/.exec(output);
        if (match) {
          clearTimeout(timeout);
          resolve(`http://127.0.0.1:${match[1]}`);
        }
      });
    });
  } catch (error) {
    await stop();
    throw error;
  }

  async function request(path, status, { token, method = 'GET', body } = {}) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    return data;
  }
  return { request, stop };
}

function account(name, role = 'user') {
  return { name, role, email: `${role}-${name}@example.invalid`, password: 'test-password' };
}

async function logIn(request, { email, password }) {
  return request('/login', 200, { method: 'POST', body: { email, password } });
}

test('Друзья и подписки сохраняются и определяют аудиторию ленты', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'hakros-connections-'));
  const database = join(directory, 'test.db');
  let api;
  t.after(async () => {
    await api?.stop();
    await unlink(database).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(directory);
  });

  api = await startApi(database);
  const aliceAccount = account('Алиса');
  const borisAccount = account('Борис');
  const companyAccount = account('Компания', 'company');
  for (const body of [aliceAccount, borisAccount, companyAccount]) {
    await api.request('/register', 201, { method: 'POST', body });
  }
  let [alice, boris, company] = await Promise.all(
    [aliceAccount, borisAccount, companyAccount].map(person => logIn(api.request, person))
  );
  const list = (token) => api.request(connectionsPath, 200, { token });
  const requestFriend = (actor, id) => api.request(`${connectionsPath}/friends/${id}/request`, 200, {
    token: actor.token, method: 'PUT',
  });
  const friendPath = (person) => `${connectionsPath}/friends/${person.user.id}`;

  await api.request(connectionsPath, 401);
  await api.request(connectionsPath, 403, { token: company.token });
  await api.request(`${friendPath(alice)}/request`, 400, { token: alice.token, method: 'PUT' });
  await api.request(`${friendPath(company)}/request`, 404, { token: alice.token, method: 'PUT' });
  const matches = await api.request(`${connectionsPath}/users?q=${encodeURIComponent('БОР')}`, 200, { token: alice.token });
  assert.deepEqual(matches, [{ id: String(boris.user.id), name: 'Борис' }]);

  await Promise.all([requestFriend(alice, boris.user.id), requestFriend(alice, boris.user.id)]);
  assert.deepEqual((await list(alice.token)).outgoingRequests, matches);
  assert.deepEqual((await list(boris.token)).incomingRequests, [{ id: String(alice.user.id), name: 'Алиса' }]);
  assert.deepEqual((await list(alice.token)).friends, []);
  await api.request(`${friendPath(boris)}/accept`, 404, { token: alice.token, method: 'PUT' });
  await requestFriend(boris, alice.user.id);
  assert.deepEqual((await list(boris.token)).friends, []);
  await api.request(`${friendPath(alice)}/accept`, 200, { token: boris.token, method: 'PUT' });
  assert.deepEqual((await list(alice.token)).friends, matches);

  const stories = await api.request('/api/stories', 200);
  const placeId = stories[0].postId;
  const placePath = `${connectionsPath}/places/${encodeURIComponent(placeId)}`;
  const followedStories = async token => {
    const ids = new Set((await list(token)).subscriptions.map(place => place.placeId));
    return stories.filter(story => ids.has(story.postId));
  };
  assert.deepEqual(await followedStories(alice.token), []);
  assert.deepEqual(await api.request(placePath, 200, { token: alice.token }), { subscribed: false });
  await Promise.all([
    api.request(placePath, 200, { token: alice.token, method: 'PUT' }),
    api.request(placePath, 200, { token: alice.token, method: 'PUT' }),
  ]);
  assert.deepEqual(await followedStories(alice.token), stories.filter(story => story.postId === placeId));
  assert.deepEqual(await followedStories(boris.token), []);
  assert.equal((await list(alice.token)).subscriptions.length, 1);

  await api.stop();
  api = await startApi(database);
  [alice, boris] = await Promise.all([aliceAccount, borisAccount].map(person => logIn(api.request, person)));
  assert.deepEqual((await list(alice.token)).friends, matches);
  assert.equal((await list(boris.token)).friends[0].id, String(alice.user.id));
  assert.deepEqual(await api.request(placePath, 200, { token: alice.token }), { subscribed: true });

  await api.request(friendPath(alice), 200, { token: boris.token, method: 'DELETE' });
  assert.deepEqual((await list(alice.token)).friends, []);
  assert.deepEqual((await list(boris.token)).friends, []);
  assert.deepEqual(await api.request(placePath, 200, { token: alice.token, method: 'DELETE' }), { subscribed: false });
  assert.deepEqual(await followedStories(alice.token), []);
});
