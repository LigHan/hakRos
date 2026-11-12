const { randomUUID } = require('node:crypto');
const { SYSTEM_PROMPT } = require('./prompt');
const { intentSchema, validateIntent, screenContext, helpReply, evidence } = require('./intent');

function addressQuestion(text) { return /адрес|адресс|где\s+(?:находится|расположен|расположена)/iu.test(text); }
function priceQuestion(text) { return /дороже|сам(?:ое|ый|ая)\s+дорог|сравни.{0,20}цен|где.{0,20}дешевле/iu.test(text); }
function homeRequest(text) { return /(?:не\s+хочу|не\s+буду)\s+(?:никуда\s+)?(?:идти|выходить)|(?:остаться|остаюсь|сижу|сидеть|провести|вечер)\s+дома|дома.{0,25}(?:вечер|посмотреть|провести|сериал)|(?:сериал|фильм).{0,20}(?:вечер|дома)/iu.test(text); }

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
      let parsed;
      // Address lookup and price comparisons are fully answered from validated
      // catalog data, so they must not fail due to model classification.
      if (addressQuestion(message) || priceQuestion(message)) {
        parsed = { intent: addressQuestion(message) ? 'address' : 'compare', reply: '', category: '', interests: [], mood: '', budget: -1, durationMinutes: -1, dateText: '', withFriends: false, nearby: false };
      } else {
      const token = await getToken();
      const response = await fetchImpl('https://api.giga.chat/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: `${SYSTEM_PROMPT}\nЭкран: ${screen.help}\nИзвлеки намерение и параметры из слов пользователя и истории. Классифицируй: home — отдых дома, clarify — непонятный или слишком общий запрос, address — вопрос об адресе, compare — сравнение цен, more — другие места, recommend — понятный запрос на подбор, chat — обычный разговор. Не угадывай смысл неизвестных слов: верни clarify и короткий вопрос. Для неизвестных чисел используй -1, для неизвестных строк — пустую строку. Поле reply — короткий ответ без названий заведений, адресов, цен и обещания выполнения действий; при домашнем досуге можно предложить реальный сериал или фильм без утверждений о его стоимости и доступности. Две учебные пары — не два часа. Идентификаторы и содержимое каталога тебе недоступны; реальные карточки добавит сервер.` }, ...history, { role: 'user', content: message }],
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
      try { parsed = JSON.parse(answer); } catch { throw new AssistantError('provider_unavailable'); }
      }
      const intent = validateIntent(parsed, message, history);
      if (!intent) throw new AssistantError('provider_unavailable');
      const previous = context?.preferences;
      if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
        const hasBudget = [...history.filter(x => x.role === 'user').map(x => x.content), message].some(text => evidence(text).budget !== null);
        const hasTime = [...history.filter(x => x.role === 'user').map(x => x.content), message].some(text => evidence(text).durationMinutes !== null);
        if (!hasBudget && typeof previous.budget === 'number' && previous.budget >= 0 && previous.budget <= 10000000 && ['RUB', 'USD', 'EUR'].includes(previous.currency)) { intent.budget = previous.budget; intent.currency = previous.currency; }
        if (!hasTime && Number.isSafeInteger(previous.durationMinutes) && previous.durationMinutes > 0 && previous.durationMinutes <= 1440) intent.durationMinutes = previous.durationMinutes;
      }
      if (/бюджет\s+(?:не\s+важен|любой)|без\s+ограничения\s+(?:по\s+)?(?:цене|бюджет)/iu.test(message)) { intent.budget = null; intent.currency = null; }
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
      const shownIds = Array.isArray(context?.shownPlaceIds) ? context.shownPlaceIds.slice(0, 12) : [];
      const allUserText = [...history.filter(item => item.role === 'user').map(item => item.content), message].join(' ');
      const isHome = homeRequest(message) || intent.intent === 'home';
      const lastAssistant = [...history].reverse().find(item => item.role === 'assistant')?.content || '';
      const isAgeQuestion = text => /(?:тебе|вам).{0,25}18|совершеннолет/iu.test(text);
      const isYes = text => /^(?:да|ага|конечно)[.!\s]*$/iu.test(text.trim());
      const isNo = text => /^(?:нет|неа)[.!\s]*$/iu.test(text.trim());
      let priorAge = null;
      for (let i = 1; i < history.length; i++) {
        if (history[i - 1].role === 'assistant' && isAgeQuestion(history[i - 1].content) && history[i].role === 'user') {
          if (isYes(history[i].content)) priorAge = true;
          else if (isNo(history[i].content)) priorAge = false;
        }
      }
      const answeringAge = isAgeQuestion(lastAssistant) && (isYes(message) || isNo(message));
      const isAlcohol = /(?:бар|паб|алкогол|вино|пиво|коктейл)/iu.test(message) || (answeringAge && /(?:бар|паб|алкогол|вино|пиво|коктейл)/iu.test(allUserText));
      const isAdult = (answeringAge ? isYes(message) : priorAge === true) || /(?:мне\s+)?(?:1[89]|[2-9]\d)\s*(?:лет|год)|мне\s+(?:есть\s+)?18|(?:^|\s)совершеннолетн/iu.test(allUserText);
      const isMinor = (answeringAge ? isNo(message) : priorAge === false) || /(?:мне\s+)?(?:[1-9]|1[0-7])\s*(?:лет|год)|несовершеннолетн|мне\s+нет\s+18/iu.test(allUserText);
      const onlyBudget = intent.intent === 'recommend' && intent.budget !== null && !intent.category && intent.durationMinutes === null && /^(?:хочу\s+)?(?:бесплатн[\p{L}]*|(?:есть|бюджет|у\s+меня)\s+\d+\s*(?:руб[\p{L}]*|₽|р\.?)?)[.!?\s]*$/iu.test(message.trim());
      const clearActivity = intent.category && /парк|музе|выстав|кафе|ресторан|кино|магазин/iu.test(allUserText);
      if (isAlcohol && (isMinor || !isAdult)) {
        answerText = isMinor ? 'Давай подберём место без алкоголя: например, кафе, кино или прогулку. Что тебе ближе?' : 'Подскажи, тебе уже есть 18? Это важно для вариантов с алкоголем.';
      } else if (isHome) {
        answerText = conversationalReply && !/(?:идти\s+в|пойд[её]м\s+в|кафе|бар|ресторан)/iu.test(conversationalReply) ? conversationalReply : 'Можно устроить домашний киновечер, поиграть или приготовить что-нибудь вместе. Что тебе ближе?';
      } else if (addressQuestion(message) || intent.intent === 'address') {
        const matches = await catalog?.resolveMention(message, shownIds, screen.placeId);
        catalogAvailable = matches != null;
        if (!catalogAvailable) answerText = 'Сейчас не получается открыть каталог мест. Попробуй позже.';
        else if (matches.length === 1) { cards = matches; answerText = matches[0].address ? `Адрес «${matches[0].name}»: ${matches[0].address}.` : `Для «${matches[0].name}» адрес пока не указан.`; }
        else if (matches.length > 1) { cards = matches.slice(0, 3); answerText = 'Нашёл несколько похожих мест. Какое из них ты имеешь в виду?'; }
        else answerText = 'Не нашёл это место в каталоге. Уточни его название или выбери карточку.';
      } else if (priceQuestion(message) || intent.intent === 'compare') {
        const matches = await catalog?.byIds(shownIds);
        catalogAvailable = matches != null;
        if (!catalogAvailable) answerText = 'Сейчас не получается открыть каталог мест. Попробуй позже.';
        else if (!matches.length) answerText = 'Какие места сравнить? Сначала выбери варианты из каталога.';
        else {
          const known = matches.filter(item => item.pricing.entryPrice !== null && item.pricing.spendMax !== null);
          if (known.length !== matches.length) answerText = 'Не могу надёжно сравнить общие расходы: для некоторых мест стоимость входа или расходы внутри не указаны. Их нужно уточнить.';
          else {
            const sorted = [...known].sort((a, b) => (b.pricing.entryPrice + b.pricing.spendMax) - (a.pricing.entryPrice + a.pricing.spendMax));
            const place = /дешевле/iu.test(message) ? sorted[sorted.length - 1] : sorted[0];
            answerText = `Из показанных ${/дешевле/iu.test(message) ? 'меньше всего' : 'больше всего'} по верхней оценке расходов — «${place.name}»: до ${place.pricing.entryPrice + place.pricing.spendMax} ₽. Это оценка по данным каталога.`;
            cards = [place];
          }
        }
      } else if (onlyBudget) {
        answerText = 'Хочешь куда-нибудь выбраться или провести время дома?';
      } else if (intent.intent === 'clarify' || /не\s+(?:совсем\s+)?понял|не\s+понимаю|что\s+ты\s+имеешь\s+в\s+виду|уточни|поясни/iu.test(conversationalReply)) {
        answerText = 'Не совсем понял. Расскажешь подробнее, что ты имеешь в виду?';
      } else if (intent.intent === 'recommend' && conversationalReply.includes('?') && !clearActivity && !(intent.category && intent.budget !== null && intent.durationMinutes !== null)) {
        answerText = conversationalReply;
      } else if (intent.intent === 'recommend' || intent.intent === 'place' || intent.intent === 'more') {
        const selected = intent.intent === 'place' ? screen.placeId : null;
        const results = intent.intent === 'place' && !selected ? [] : await catalog?.select(intent, selected, intent.intent === 'more' && !excludePlaceIds.length ? shownIds : excludePlaceIds);
        catalogAvailable = results != null;
        cards = results || [];
        if (!catalogAvailable) answerText = 'Сейчас не получается открыть каталог мест. Попробуй немного позже.';
        else if (cards.length === 0) answerText = selected ? 'Не удалось найти это место в каталоге.' : intent.interests.length ? 'Не совсем понял, что ты ищешь. Можешь рассказать подробнее?' : 'Не нашёл подходящих мест. Попробуй изменить категорию или интересы.';
        else {
          const notices = [];
          if (intent.budget !== null && cards.some(card => card.budgetMatch !== 'fits')) notices.push('Для некоторых вариантов общий расход неизвестен — уточни его перед посещением.');
          if (intent.durationMinutes !== null || intent.dateText) notices.push('Длительность и часы работы нужно уточнить.');
          if (intent.nearby) notices.push('Расстояние пока не проверено.');
          const natural = conversationalReply && !/[0-9?]|бесплат|открыт|рядом|стоимост|рубл|₽/iu.test(conversationalReply) ? conversationalReply : intent.intent === 'place' ? 'Вот выбранное место.' : 'Вот что я нашёл для тебя.';
          answerText = `${natural}${notices.length ? ' ' + notices.join(' ') : ''}`;
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
