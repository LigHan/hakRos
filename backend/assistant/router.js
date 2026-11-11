const express = require('express');
const { AssistantError, createAssistantService } = require('./service');
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

  router.get('/health', (_req, res) => {
    res.json({ mode: service.mode, configured: service.configured });
  });

  router.post('/chat', async (req, res) => {
    const { message, history = [] } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim() || message.length > 1000 ||
        !Array.isArray(history) || history.length > 6 || history.some(item =>
          !item || !['user', 'assistant'].includes(item.role) ||
          typeof item.content !== 'string' || !item.content.trim() || item.content.length > 1000)) {
      return res.status(400).json({ error: 'invalid_request', message: 'Проверьте текст и историю сообщений.' });
    }
    try {
      const safeHistory = history.map(({ role, content }) => ({ role, content: content.trim() }));
      return res.json(await service.reply(message.trim(), safeHistory));
    } catch (error) {
      const code = error instanceof AssistantError ? error.code : 'provider_unavailable';
      return res.status(503).json({ error: code, message: 'Помощник сейчас недоступен. Попробуйте позже.' });
    }
  });

  return router;
}

module.exports = { createAssistantRouter };
