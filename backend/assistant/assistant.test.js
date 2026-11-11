const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const { createAssistantRouter } = require('./router');
const { createAssistantService } = require('./service');

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

test('mock API responds honestly and validates untrusted input', async () => {
  await withServer(createAssistantService(), async base => {
    const health = await (await fetch(`${base}/health`)).json();
    assert.deepEqual(health, { mode: 'mock', configured: true });
    const response = await post(base, { message: 'Найди мне пати', history: [] });
    assert.equal(response.status, 200);
    const answer = await response.json();
    assert.equal(answer.mode, 'mock');
    assert.match(answer.reply, /пока не подключён/);
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
    const first = await post(base, { message: '500 рублей', history });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { reply: 'Можно погулять в парке.', mode: 'gigachat' });
    assert.equal((await post(base, { message: 'Ещё вариант', history: [] })).status, 200);
    assert.equal(calls.filter(call => call.url.includes('/oauth')).length, 1);
    const chat = calls.find(call => call.url.endsWith('/chat/completions'));
    const request = JSON.parse(chat.options.body);
    assert.equal(request.model, 'GigaChat-2-Max');
    assert.equal(request.messages[0].role, 'system');
    assert.deepEqual(request.messages.slice(1), [...history, { role: 'user', content: '500 рублей' }]);
    assert.doesNotMatch(JSON.stringify(await (await fetch(`${base}/health`)).json()), /test-secret|test-token/);
  });
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
