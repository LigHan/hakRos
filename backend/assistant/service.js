const { randomUUID } = require('node:crypto');

const SYSTEM_PROMPT = [
  'Ты — дружелюбный помощник приложения для студенческого досуга.',
  'Отвечай по-русски кратко и помогай придумать занятие или разобраться в приложении.',
  'У тебя пока нет доступа к каталогу мест, расписаниям или людям.',
  'Не выдумывай конкретные места, цены, события, пользователей и возможности приложения.',
  'Если нужен поиск компании или проверка условий, честно скажи об ограничении.',
].join(' ');

class AssistantError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function createAssistantService({ mode = 'mock', credentials, model = 'GigaChat-2-Max', fetchImpl = fetch } = {}) {
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

  async function reply(message, history) {
    if (mode === 'mock') {
      const lower = message.toLowerCase();
      if (/пати|компан|друз/.test(lower)) {
        return { reply: 'Можно придумать совместную прогулку или игру. Поиск компании пока не подключён.', mode: 'mock' };
      }
      if (/бесплат|денег|бюджет|руб/.test(lower)) {
        return { reply: 'Для недорогого отдыха можно рассмотреть прогулку или бесплатную выставку. Проверка цен и поиск мест пока не подключены.', mode: 'mock' };
      }
      return { reply: 'Можно прогуляться, сходить на выставку или поиграть с друзьями. Подскажи, сколько у тебя времени и какой бюджет?', mode: 'mock' };
    }
    if (mode !== 'gigachat' || !credentials) throw new AssistantError('not_configured');

    try {
      const token = await getToken();
      const response = await fetchImpl('https://api.giga.chat/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history, { role: 'user', content: message }],
          max_tokens: 200,
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
      return { reply: answer.trim(), mode: 'gigachat' };
    } catch (error) {
      if (error instanceof AssistantError) throw error;
      throw new AssistantError('provider_unavailable');
    }
  }

  return { reply, mode, configured: mode === 'mock' || (mode === 'gigachat' && Boolean(credentials)) };
}

module.exports = { AssistantError, createAssistantService };
