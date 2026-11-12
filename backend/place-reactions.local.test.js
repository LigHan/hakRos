'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('лайки и оценки реальны, уникальны для аккаунта и сохраняются после перезапуска', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hakros-reactions-'));
  const port = 32000 + Math.floor(Math.random() * 20000);
  const origin = `http://127.0.0.1:${port}`;
  let server;
  const start = async () => {
    server = spawn(process.execPath, ['server.js'], { cwd: __dirname,
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DB_PATH: path.join(dir, 'test.db'), LOCAL_DEMO: '1' }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(origin + '/api')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Тестовый сервер не запустился');
  };
  const stop = () => new Promise(resolve => { if (!server || server.exitCode != null) return resolve(); server.once('exit', resolve); server.kill(); });
  const req = async (url, token, method = 'GET', body) => {
    const result = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: result.status, data: await result.json() };
  };
  const login = async email => (await req('/login', null, 'POST', { email, password: 'demo1234' })).data.token;
  try {
    await start();
    await req('/register', null, 'POST', { email: 'other@local.test', name: 'Друг', password: 'demo1234', role: 'user' });
    let [alice, bob, company] = await Promise.all(['user@local.test', 'other@local.test', 'company@local.test'].map(login));
    const initial = (await req('/api/posts/1')).data;
    assert.equal(initial.likes, 0); assert.equal(initial.ratingCount, 0); assert.equal(initial.rating, 0);
    assert.equal(initial.reviews.length, 0, 'вымышленные демонстрационные отзывы не показываются');
    assert.equal((await req('/api/posts/1/like', null, 'PUT')).status, 401);
    assert.equal((await req('/api/posts/1/rating', company, 'PUT', { rating: 5 })).status, 403);
    assert.equal((await req('/api/posts/missing/like', alice, 'PUT')).status, 404);
    assert.equal((await req('/api/posts/1/rating', alice, 'PUT', { rating: 6 })).status, 400);
    assert.equal((await req('/api/posts/1/rating', alice, 'PUT', { rating: 4.5 })).status, 400);
    assert.equal((await req('/api/posts/1/like', alice, 'PUT')).data.likes, 1);
    assert.equal((await req('/api/posts/1/like', alice, 'PUT')).data.likes, 1);
    assert.equal((await req('/api/posts/1/like', bob, 'PUT')).data.likes, 2);
    assert.equal((await req('/api/posts/1/rating', alice, 'PUT', { rating: 5 })).data.rating, 5);
    const rated = (await req('/api/posts/1/rating', bob, 'PUT', { rating: 3 })).data;
    assert.equal(rated.rating, 4); assert.equal(rated.ratingCount, 2);
    assert.equal((await req('/api/posts/1/rating', alice, 'PUT', { rating: 1 })).data.rating, 2);
    assert.deepEqual((await req('/api/place-likes', alice)).data, ['1']);
    await stop(); await start();
    [alice, bob] = await Promise.all(['user@local.test', 'other@local.test'].map(login));
    const persisted = (await req('/api/posts/1')).data;
    assert.equal(persisted.likes, 2); assert.equal(persisted.rating, 2); assert.equal(persisted.ratingCount, 2);
    assert.equal((await req('/api/posts/1/reactions', alice)).data.myRating, 1);
    assert.equal((await req('/api/posts/1/like', alice, 'DELETE')).data.likes, 1);
    assert.equal((await req('/api/posts/1/like', alice, 'DELETE')).data.likes, 1);
    const removed = (await req('/api/posts/1/rating', alice, 'DELETE')).data;
    assert.equal(removed.rating, 3); assert.equal(removed.ratingCount, 1); assert.equal(removed.myRating, null);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});
