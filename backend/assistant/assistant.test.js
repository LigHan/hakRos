const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const { createAssistantRouter } = require('./router');
const { createAssistantService } = require('./service');
const { createCatalog } = require('./catalog');

async function withServer(service, run) {
  const app = express();
  app.use(express.json());
  app.use('/api/assistant', createAssistantRouter({ service }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}/api/assistant`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

async function post(base, body) {
  return fetch(`${base}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('API validates untrusted input and does not default to canned answers', async () => {
  await withServer(createAssistantService(), async base => {
    const health = await (await fetch(`${base}/health`)).json();
    assert.deepEqual(health, { mode: 'gigachat', configured: false });
    const response = await post(base, { message: 'Найди мне пати', history: [] });
    assert.equal(response.status, 503);
    assert.equal((await post(base, { message: ' ' })).status, 400);
    assert.equal((await post(base, { message: 'a'.repeat(1001) })).status, 400);
    assert.equal((await post(base, { message: 'hello', history: [{ role: 'system', content: 'x' }] })).status, 400);
    assert.equal((await post(base, { message: 'hello', history: Array(7).fill({ role: 'user', content: 'x' }) })).status, 400);
  });
});

test('GigaChat flow sends server-side credentials, preserves short history and reuses token', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/oauth')) return { ok: true, json: async () => ({ access_token: 'test-token', expires_at: Date.now() + 1800000 }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Можно погулять в парке.' } }] }) };
  };
  const service = createAssistantService({ mode: 'gigachat', credentials: 'test-secret', fetchImpl });
  await withServer(service, async base => {
    const history = [{ role: 'user', content: 'Есть два часа' }, { role: 'assistant', content: 'Какой бюджет?' }];
    const first = await post(base, { message: 'Люблю прогулки', history });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { reply: 'Можно погулять в парке.', mode: 'gigachat', catalogAvailable: false });
    assert.equal((await post(base, { message: 'Ещё вариант', history: [] })).status, 200);
    assert.equal(calls.filter(call => call.url.includes('/oauth')).length, 1);
    const chat = calls.find(call => call.url.endsWith('/chat/completions'));
    const request = JSON.parse(chat.options.body);
    assert.equal(request.model, 'GigaChat-2-Max');
    assert.equal(request.messages[0].role, 'system');
    assert.deepEqual(request.messages.slice(1), [...history, { role: 'user', content: 'Люблю прогулки' }]);
    assert.doesNotMatch(JSON.stringify(await (await fetch(`${base}/health`)).json()), /test-secret|test-token/);
  });
});

test('unknown budget and location are not invented by the model', async () => {
  let providerCalls = 0;
  const service = createAssistantService({ credentials: 'test', fetchImpl: async () => { providerCalls++; throw Error('must not call'); } });
  const budget = await service.reply('Найди бесплатное место за 0 рублей', []);
  assert.equal(budget.source, 'catalog_constraint');
  assert.match(budget.reply, /нет данных о стоимости/);
  const followUp = await service.reply('Покажи варианты', [{ role: 'user', content: 'Хочу бесплатно' }]);
  assert.equal(followUp.source, 'catalog_constraint');
  const near = await service.reply('Что находится рядом?', []);
  assert.match(near.reply, /нет твоей геопозиции/);
  assert.equal(providerCalls, 0);
});

test('catalog provides only bounded public fields and prioritizes relevant places', async () => {
  const catalog = createCatalog({ url: 'http://catalog.test/api/posts', fetchImpl: async () => ({
    ok: true,
    json: async () => [
      { id: 1, place: 'Кофейня', category: 'cafe', address: 'Центр', bio: 'Кофе', email: 'private@example.test' },
      { id: 2, place: 'Музей', category: 'museum', address: 'Проспект', bio: 'Выставка' },
    ],
  }) });
  const places = await catalog.find('Хочу в музей', []);
  assert.equal(places[0].name, 'Музей');
  assert.equal(places.length, 2);
  assert.doesNotMatch(JSON.stringify(places), /private@example/);
  assert.equal(await createCatalog({}).find('Привет', []), null);
  assert.equal(await createCatalog({ url: 'x', fetchImpl: async () => { throw Error('offline'); } }).find('Привет', []), null);
});

test('live request includes catalog and reports availability', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    if (url.includes('/oauth')) return { ok: true, json: async () => ({ access_token: 'token', expires_at: Date.now() + 1800000 }) };
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'В каталоге есть музей.' } }] }) };
  };
  const catalog = { find: async () => [{ id: '1', name: 'Музей' }] };
  const service = createAssistantService({ credentials: 'test', fetchImpl, catalog });
  const result = await service.reply('Куда сходить?', []);
  assert.equal(result.catalogAvailable, true);
  assert.match(requests[0].messages[0].content, /Музей/);
  assert.match(requests[0].messages[0].content, /не переданы проверенные цены/);
});

test('unconfigured or failed live provider returns a safe error, never a fake success', async () => {
  await withServer(createAssistantService({ mode: 'gigachat' }), async base => {
    const response = await post(base, { message: 'Привет' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'not_configured');
  });
  const failed = createAssistantService({ mode: 'gigachat', credentials: 'test-secret', fetchImpl: async () => { throw new Error('secret test-secret'); } });
  await withServer(failed, async base => {
    const response = await post(base, { message: 'Привет' });
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.match(text, /provider_unavailable/);
    assert.doesNotMatch(text, /test-secret/);
  });
});
