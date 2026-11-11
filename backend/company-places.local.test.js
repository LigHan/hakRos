'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, unlink, rmdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

const path = '/api/company/places';
const password = 'test-password';

async function startApi(database) {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DB_PATH: database, LOCAL_DEMO: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  server.stderr.on('data', chunk => { stderr += chunk; });

  async function stop() {
    if (server.exitCode !== null || server.signalCode !== null) return;
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }

  let origin;
  try {
    origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Сервер не запустился: ${stderr}`)), 8_000);
      server.once('error', error => {
        clearTimeout(timer);
        reject(error);
      });
      server.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`Сервер завершился (${code}): ${stderr}`));
      });
      server.stdout.on('data', chunk => {
        stdout += chunk;
        const match = /http:\/\/127\.0\.0\.1:(\d+)\/api/.exec(stdout);
        if (match) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${match[1]}`);
        }
      });
    });
  } catch (error) {
    await stop();
    throw error;
  }

  async function request(endpoint, expected, { token, method = 'GET', body } = {}) {
    const response = await fetch(origin + endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert([expected].flat().includes(response.status), `${method} ${endpoint}: ${response.status}`);
    return data;
  }

  async function login(email, loginPassword = password) {
    const data = await request('/login', 200, { method: 'POST', body: { email, password: loginPassword } });
    return data.token;
  }

  return { request, login, stop };
}

test('Компания управляет только своими карточками, а данные сохраняются после перезапуска', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'hakros-company-'));
  const database = join(directory, 'test.db');
  let api;
  t.after(async () => {
    await api?.stop();
    await unlink(database).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(directory);
  });

  api = await startApi(database);
  for (const [name, email, role] of [
    ['Кофейня', 'cafe@owner.invalid', 'company'],
    ['Другая компания', 'cafe@other.invalid', 'company'],
    ['Посетитель', 'visitor@example.invalid', 'user'],
  ]) {
    await api.request('/register', 201, { method: 'POST', body: { name, email, password, role } });
  }

  const [owner, other, visitor, demoCompany] = await Promise.all([
    api.login('cafe@owner.invalid'),
    api.login('cafe@other.invalid'),
    api.login('visitor@example.invalid'),
    api.login('company@local.test', 'demo1234'),
  ]);

  await api.request(path, 401);
  await api.request(path, 403, { token: visitor });
  assert.deepEqual(await api.request(path, 200, { token: owner }), []);
  assert.deepEqual((await api.request(path, 200, { token: demoCompany })).map(place => place.id), ['1']);

  const hours = [{ label: 'Будни', value: '09:00–19:00' }, { label: 'Выходные', value: 'Выходной' }];
  const draft = {
    requestId: 'draft-idempotency-01',
    place: 'Кофейня на углу',
    address: 'Центральная, 5',
    bio: 'Кофе и выпечка',
    category: 'cafe',
    workingHours: hours,
  };
  await api.request(path, 403, { token: visitor, method: 'POST', body: draft });
  const [created, repeated] = await Promise.all([
    api.request(path, [200, 201], { token: owner, method: 'POST', body: draft }),
    api.request(path, [200, 201], { token: owner, method: 'POST', body: draft }),
  ]);
  assert.equal(created.id, repeated.id);
  assert.equal(created.user, 'Кофейня');
  assert.match(created.image, /^data:image\//);
  assert.deepEqual((await api.request(path, 200, { token: owner })).map(place => place.id), [created.id]);
  assert.deepEqual(await api.request(path, 200, { token: other }), []);

  const editPath = `${path}/${created.id}`;
  const publicPath = `/api/posts/${created.id}`;
  assert.deepEqual((await api.request(publicPath, 200)).workingHours, hours);
  await api.request(editPath, 404, { token: other });
  await api.request(editPath, 404, { token: other, method: 'PUT', body: { ...draft, place: 'Чужое изменение' } });
  await api.request(editPath, 403, { token: visitor, method: 'PUT', body: draft });

  const next = {
    ...draft,
    place: 'Обновлённая кофейня',
    address: 'Центральная, 7',
    bio: 'Завтраки до обеда',
    image: 'https://example.invalid/cafe.jpg',
    workingHours: [{ label: 'Ежедневно', value: '10:00–20:00' }],
  };
  await api.request(editPath, 400, {
    token: owner, method: 'PUT', body: { ...next, workingHours: [{ label: '', value: '10:00' }] },
  });
  assert.equal((await api.request(publicPath, 200)).place, draft.place);
  assert.deepEqual((await api.request(publicPath, 200)).workingHours, hours);
  const saved = await api.request(editPath, 200, { token: owner, method: 'PUT', body: next });
  assert.deepEqual(await api.request(publicPath, 200), saved);
  assert.deepEqual(saved.workingHours, next.workingHours);
  assert.equal(saved.image, next.image);

  const seed = await api.request('/api/posts/1', 200);
  const updatedSeed = await api.request(`${path}/1`, 200, {
    token: demoCompany,
    method: 'PUT',
    body: { ...seed, bio: 'Новое описание', workingHours: [] },
  });
  assert.equal(updatedSeed.bio, 'Новое описание');
  assert.deepEqual(updatedSeed.gallery, seed.gallery);
  assert.deepEqual(updatedSeed.reviews, seed.reviews);
  assert.deepEqual(updatedSeed.workingHours, []);

  await api.stop();
  api = await startApi(database);
  const freshToken = await api.login('cafe@owner.invalid');
  assert.deepEqual(await api.request(editPath, 200, { token: freshToken }), saved);
  assert.deepEqual(await api.request(publicPath, 200), saved);

  const admin = await api.login('admin@local.test', 'demo1234');
  await api.request(`/api/admin/places/${created.id}`, 200, { token: admin, method: 'DELETE' });
  assert.deepEqual(await api.request(path, 200, { token: freshToken }), []);
  await api.request(path, 409, { token: freshToken, method: 'POST', body: draft });
  await api.request(publicPath, 404);
});
