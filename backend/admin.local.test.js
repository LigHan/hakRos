'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

test('Локальная админка: права, данные пользователей и мест', async () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DB_PATH: ':memory:', LOCAL_DEMO: '1' }, stdio: 'ignore' });
  const request = async (path, { token, method = 'GET', body } = {}) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${origin}/api`)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'тестовый сервер запустился');
    const login = async email => (await request('/login', { method: 'POST', body: { email, password: 'demo1234' } })).data.token;
    const [admin, user, company] = await Promise.all(['admin@local.test', 'user@local.test', 'company@local.test'].map(login));
    assert.ok(admin && user && company);
    for (const path of ['/api/admin/users', '/api/admin/places']) {
      assert.equal((await request(path)).status, 401);
      for (const token of [user, company]) {
        assert.equal((await request(path, { token })).status, 403);
        assert.equal((await request(`${path}/1`, { token, method: 'PUT', body: {} })).status, 403);
      }
    }
    const users = (await request('/api/admin/users', { token: admin })).data;
    assert.equal(users.length, 2);
    assert.ok(users.every(item => !('password' in item)));
    const target = users.find(item => item.role === 'user');
    const other = users.find(item => item.role === 'company');
    const update = (id, body) => request(`/api/admin/users/${id}`, { token: admin, method: 'PUT', body });
    assert.equal((await update(target.id, { name: 'Новое имя', surname: 'Фамилия', email: 'new@local.test', role: 'admin' })).status, 200);
    const updated = (await request('/api/admin/users', { token: admin })).data.find(item => item.id === target.id);
    assert.deepEqual(updated, { id: target.id, email: 'new@local.test', name: 'Новое имя', surname: 'Фамилия', role: 'user' });
    assert.equal((await request('/login', { method: 'POST', body: { email: 'new@local.test', password: 'demo1234' } })).status, 200);
    assert.equal((await update(target.id, { name: 'Имя', surname: '', email: other.email.toUpperCase() })).status, 409);
    assert.equal((await update(target.id, { name: 'Имя', surname: '', email: 'admin@local.test' })).status, 409);
    assert.equal((await update(target.id, { name: '', surname: '', email: 'new@local.test' })).status, 400);
    assert.equal((await update(999999, { name: 'Имя', surname: '', email: 'missing@local.test' })).status, 404);
    assert.equal((await request('/register', { method: 'POST', body: { email: 'admin@local.test', name: 'Имя', password: 'x', role: 'user' } })).status, 409);
    const places = (await request('/api/admin/places', { token: admin })).data;
    const place = places.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    assert.ok(place);
    const placeUpdate = { place: 'Новое название', bio: 'Описание', address: 'Адрес', category: 'museum' };
    assert.equal((await request(`/api/admin/places/${place.id}`, { token: admin, method: 'PUT', body: placeUpdate })).status, 200);
    const publicPlace = (await request(`/api/posts/${place.id}`)).data;
    for (const [key, value] of Object.entries(placeUpdate)) assert.equal(publicPlace[key], value);
    const pricingPath = `/api/admin/places/${place.id}/pricing`;
    const pricing = { entryType: 'free', entryPrice: null, spendMin: 0, spendMax: 500, source: 'Данные заведения' };
    assert.equal((await request(pricingPath, { token: user, method: 'PUT', body: pricing })).status, 403);
    assert.equal((await request(pricingPath, { token: admin, method: 'PUT', body: { ...pricing, source: '' } })).status, 400);
    assert.equal((await request(pricingPath, { token: admin, method: 'PUT', body: { ...pricing, entryType: 'paid', entryPrice: -1 } })).status, 400);
    assert.equal((await request(pricingPath, { token: admin, method: 'PUT', body: pricing })).status, 200);
    const savedPricing = (await request(`/api/posts/${place.id}`)).data.pricing;
    assert.equal(savedPricing.entryType, 'free'); assert.equal(savedPricing.spendMax, 500); assert.equal(savedPricing.source, pricing.source); assert.ok(savedPricing.updatedAt);
    const point = await request('/api/map/places', { token: admin, method: 'POST', body: { name: 'Проверенная точка', latitude: 48, longitude: 37 } });
    const linkPath = `/api/admin/map-places/${point.data.id}/link`;
    assert.equal((await request(linkPath, { token: user, method: 'POST', body: { postId: place.id, confirmed: true } })).status, 403);
    assert.equal((await request(linkPath, { token: admin, method: 'POST', body: { postId: place.id } })).status, 400);
    assert.equal((await request(linkPath, { token: admin, method: 'POST', body: { postId: place.id, confirmed: true } })).status, 200);
    const linked = (await request('/api/map/places', { token: user })).data.find(item => item.id === point.data.id);
    assert.equal(linked.postId, place.id); assert.equal(linked.latitude, 48); assert.equal(linked.longitude, 37);
    const another = await request('/api/map/places', { token: admin, method: 'POST', body: { name: 'Другая точка', latitude: 48.1, longitude: 37 } });
    assert.equal((await request(`/api/admin/map-places/${another.data.id}/link`, { token: admin, method: 'POST', body: { postId: place.id, confirmed: true } })).status, 409);
    assert.equal((await request(`/api/admin/places/${place.id}`, { token: admin, method: 'PUT', body: { ...placeUpdate, place: '' } })).status, 400);
    assert.equal((await request(`/api/admin/places/${place.id}`, { token: admin, method: 'PUT', body: { ...placeUpdate, category: 'unknown' } })).status, 400);
    assert.equal((await request('/api/admin/places/missing', { token: admin, method: 'PUT', body: placeUpdate })).status, 404);
    const postWithReview = (await request('/api/posts')).data.find(item => item.reviews.length > 0);
    assert.ok(postWithReview, 'в демоданных есть отзыв для проверки');
    const review = postWithReview.reviews[0];
      for (const token of [user, company]) assert.equal((await request(`/api/admin/reviews/${review.id}`, { token, method: 'DELETE' })).status, 403);
      assert.equal((await request(`/api/admin/reviews/${review.id}`, { method: 'DELETE' })).status, 401);
      assert.equal((await request(`/api/admin/reviews/${review.id}`, { token: admin, method: 'DELETE' })).status, 200);
      assert.ok(!(await request(`/api/posts/${postWithReview.id}`)).data.reviews.some(item => item.id === review.id));
      assert.equal((await request(`/api/admin/reviews/${review.id}`, { token: admin, method: 'DELETE' })).status, 404);
    for (const token of [user, company]) assert.equal((await request(`/api/admin/places/${place.id}`, { token, method: 'DELETE' })).status, 403);
    assert.equal((await request(`/api/admin/places/${place.id}`, { method: 'DELETE' })).status, 401);
    assert.equal((await request('/api/events', { token: user, method: 'POST', body: { type: 'card_view', placeId: place.id } })).status, 201);
    const viewsBefore = (await request('/api/statistics', { token: admin })).data.counts.card_view;
    const companyViewsBefore = (await request('/api/statistics', { token: company })).data.counts.card_view;
    assert.equal(companyViewsBefore, 1);
    assert.equal((await request(`/api/admin/places/${place.id}`, { token: admin, method: 'DELETE' })).status, 200);
    assert.equal((await request(`/api/posts/${place.id}`)).status, 404);
    assert.ok(!(await request('/api/stories')).data.some(story => story.postId === place.id));
    assert.equal((await request('/api/statistics', { token: admin })).data.counts.card_view, viewsBefore);
    assert.equal((await request('/api/statistics', { token: company })).data.counts.card_view, companyViewsBefore);
    assert.equal((await request(`/api/admin/places/${place.id}`, { token: admin, method: 'DELETE' })).status, 404);
    const personal = (await request('/api/statistics?scope=personal', { token: admin })).data;
    assert.equal(personal.role, 'user');
    assert.equal(personal.counts.card_view, 0);
    await request('/api/logout', { token: admin, method: 'POST' });
    assert.equal((await request('/api/admin/users', { token: admin })).status, 401);
  } finally { server.kill(); }
});
