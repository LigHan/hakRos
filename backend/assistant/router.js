const express = require('express');
const { AssistantError, createAssistantService, urgentReply } = require('./service');
const { createCatalog } = require('./catalog');

function createAssistantRouter(options = {}) {
  if (typeof options.auth !== 'function') throw new Error('Assistant router requires authentication');
  const service = options.service || createAssistantService({
    mode: process.env.ASSISTANT_MODE || 'gigachat',
    credentials: process.env.GIGACHAT_AUTH_KEY?.trim(),
    model: process.env.GIGACHAT_MODEL || 'GigaChat-2-Max',
    catalog: createCatalog({ loadPosts: options.loadPosts }),
  });
  const router = express.Router();
  router.use(options.auth);
  const calls = new Map();
  const active = new Map();
  const limit = options.limit ?? 20;
  const windowMs = options.windowMs ?? 60000;

  function limitCalls(req, res, next) {
    if (typeof req.body?.message === 'string' && req.body.message.length <= 1000 && urgentReply(req.body.message)) {
      res.locals.releaseAssistant = () => {};
      return next();
    }
    const account = String(req.account.id);
    const now = Date.now();
    for (const [id, entry] of calls) if (entry.until <= now) calls.delete(id);
    const current = calls.get(account) || { count: 0, until: now + windowMs };
    if (active.has(account) || current.count >= limit) return res.status(429).json({ error: 'rate_limited', message: 'Подожди немного и попробуй снова.' });
    current.count++;
    calls.set(account, current);
    const ticket = Symbol('assistant-request');
    active.set(account, ticket);
    const release = () => { if (active.get(account) === ticket) active.delete(account); };
    res.locals.releaseAssistant = release;
    res.once('finish', release);
    res.once('close', () => { if (!res.locals.assistantPending) release(); });
    next();
  }

  router.get('/health', (_req, res) => {
    res.json({ mode: service.mode, configured: service.configured });
  });

  router.post('/chat', limitCalls, async (req, res) => {
    const { message, history = [], context = {}, excludePlaceIds = [] } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim() || message.length > 1000 ||
        !Array.isArray(excludePlaceIds) || excludePlaceIds.length > 200 || excludePlaceIds.some(id => typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id)) ||
        !context || typeof context !== 'object' || Array.isArray(context) ||
        (context.screen != null && (typeof context.screen !== 'string' || context.screen.length > 32)) ||
        (context.placeId != null && (typeof context.placeId !== 'string' || !/^[\w-]{1,128}$/.test(context.placeId))) ||
        (context.shownPlaceIds != null && (!Array.isArray(context.shownPlaceIds) || context.shownPlaceIds.length > 12 || context.shownPlaceIds.some(id => typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id)))) ||
        !Array.isArray(history) || history.length > 20 || history.some(item =>
          !item || !['user', 'assistant'].includes(item.role) ||
          typeof item.content !== 'string' || !item.content.trim() || item.content.length > 1000)) {
      return res.status(400).json({ error: 'invalid_request', message: 'Проверьте текст и историю сообщений.' });
    }
    res.locals.assistantPending = true;
    try {
      const safeHistory = history.map(({ role, content }) => ({ role, content: content.trim() }));
      return res.json(await service.reply(message.trim(), safeHistory, context, excludePlaceIds));
    } catch (error) {
      const code = error instanceof AssistantError ? error.code : 'provider_unavailable';
      return res.status(503).json({ error: code, message: 'Помощник сейчас недоступен. Попробуйте позже.' });
    } finally {
      res.locals.releaseAssistant();
    }
  });

  return router;
}

module.exports = { createAssistantRouter };
