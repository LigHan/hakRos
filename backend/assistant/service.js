const { randomUUID } = require('node:crypto');
const { SYSTEM_PROMPT } = require('./prompt');
const { intentSchema, validateIntent, screenContext, helpReply } = require('./intent');

class AssistantError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function createAssistantService({ mode = 'gigachat', credentials, model = 'GigaChat-2-Max', fetchImpl = fetch, catalog } = {}) {
  let cachedToken;
  let expiresAt = 0;
  let tokenPromise;

  async function getToken() {
    if (cachedToken && Date.now() < expiresAt) return cachedToken;
    if (tokenPromise) return tokenPromise;
    tokenPromise = (async () => {
      const response = await fetchImpl('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          RqUID: randomUUID(),
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ scope: 'GIGACHAT_API_PERS' }).toString(),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new AssistantError('provider_unavailable');
      const data = await response.json();
      if (typeof data.access_token !== 'string' || !data.access_token) throw new AssistantError('provider_unavailable');
      cachedToken = data.access_token;
      expiresAt = Number.isFinite(data.expires_at) ? data.expires_at - 60000 : Date.now() + 25 * 60 * 1000;
      return cachedToken;
    })();
    try { return await tokenPromise; } finally { tokenPromise = undefined; }
  }

  async function reply(message, history, context, excludePlaceIds = []) {
    if (mode !== 'gigachat' || !credentials) throw new AssistantError('not_configured');

    try {
      const screen = screenContext(context);
      const token = await getToken();
      const response = await fetchImpl('https://api.giga.chat/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: `${SYSTEM_PROMPT}\nЭкран: ${screen.help}\nИзвлеки намерение и параметры из слов пользователя и истории. Для неизвестных чисел используй -1, для неизвестных строк — пустую строку. Поле reply — короткий ответ без названий мест, адресов, цен и обещания выполнения действий. Две учебные пары — не два часа. Идентификаторы и содержимое каталога тебе недоступны; реальные карточки добавит сервер.` }, ...history, { role: 'user', content: message }],
          response_format: { type: 'json_schema', schema: intentSchema, strict: true },
          max_tokens: 500,
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        if (response.status === 401) { cachedToken = undefined; expiresAt = 0; }
        throw new AssistantError('provider_unavailable');
      }
      const result = await response.json();
      const answer = result.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim()) throw new AssistantError('provider_unavailable');
      let parsed;
      try { parsed = JSON.parse(answer); } catch { throw new AssistantError('provider_unavailable'); }
      const intent = validateIntent(parsed, message, history);
      if (!intent) throw new AssistantError('provider_unavailable');
      // Resolve explicit UI requests against the app's known capabilities even
      // if the model classifies them as general conversation.
      if (/как\s+(?:мне\s+)?(?:открыть|найти|перейти\s+на)\s+карт|что\s+здесь\s+можно\s+делать/iu.test(message)) intent.intent = 'help';
      else if (screen.placeId && /расскажи\s+(?:об\s+этом|про\s+это)\s+мест|что\s+это\s+за\s+мест/iu.test(message)) intent.intent = 'place';
      else if (/сохрани\s+(?:это|место)/iu.test(message)) intent.intent = 'save';
      else if (/(?:пригласим|пригласи|пригласить)\s+друг/iu.test(message)) intent.intent = 'invite';
      const { reply: conversationalReply, ...parameters } = intent;
      let cards = [];
      let catalogAvailable = true;
      let answerText = conversationalReply || 'Расскажи чуть подробнее, и я постараюсь помочь.';
      if (intent.intent === 'recommend' || intent.intent === 'place') {
        const selected = intent.intent === 'place' ? screen.placeId : null;
        const results = intent.intent === 'place' && !selected ? [] : await catalog?.select(intent, selected, excludePlaceIds);
        catalogAvailable = results != null;
        cards = results || [];
        if (!catalogAvailable) answerText = 'Сейчас не получается открыть каталог мест. Попробуй немного позже.';
        else if (cards.length === 0) answerText = selected ? 'Не удалось найти это место в каталоге.' : 'Не нашёл подходящих мест. Попробуй изменить категорию или интересы.';
        else {
          const notices = [];
          if (intent.budget !== null) notices.push('Стоимость не подтверждена, поэтому соответствие бюджету нужно уточнить.');
          if (intent.durationMinutes !== null || intent.dateText) notices.push('Длительность и часы работы нужно уточнить.');
          if (intent.nearby) notices.push('Расстояние пока не проверено.');
          answerText = `${intent.intent === 'place' ? 'Вот выбранное место.' : 'Нашёл варианты в каталоге.'}${notices.length ? ' ' + notices.join(' ') : ''}`;
        }
      } else if (intent.intent === 'help') {
        answerText = helpReply(message, screen);
      } else if (intent.intent === 'save') {
        answerText = 'Чтобы сохранить место, открой его карточку и нажми значок сохранения.';
        if (screen.placeId) {
          const results = await catalog?.select(intent, screen.placeId);
          catalogAvailable = results != null;
          cards = results || [];
          if (catalogAvailable && !cards.length) answerText = 'Не удалось найти это место в каталоге.';
        }
      } else if (intent.intent === 'invite') {
        answerText = 'Сначала выбери место и создай план. Затем можно выбрать друга и подтвердить приглашение.';
      } else if (intent.intent === 'plan') {
        answerText = 'Выбери место в карточке, затем укажи время встречи и подтверди создание плана.';
      }
      return { reply: answerText, mode: 'gigachat', catalogAvailable, parameters, cards };
    } catch (error) {
      if (error instanceof AssistantError) throw error;
      throw new AssistantError('provider_unavailable');
    }
  }

  return { reply, mode, configured: mode === 'gigachat' && Boolean(credentials) };
}

module.exports = { AssistantError, createAssistantService };
