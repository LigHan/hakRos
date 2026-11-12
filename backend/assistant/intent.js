'use strict';

const categories = ['cafe', 'restaurant', 'park', 'museum', 'shop', 'entertainment'];
const screens = {
  home: 'Рекомендации: лента мест, сохранение и публикации друзей.',
  search: 'Поиск: поиск мест и категории.',
  map: 'Карта: поиск адреса, просмотр мест и построение маршрута.',
  profile: 'Профиль: сохранённые места, друзья и настройки.',
  place: 'Карточка места: описание, сохранение, подписка и переход к карте.',
  plans: 'Планы: встречи, приглашения и статусы.',
  other: 'Пользователь находится в приложении.',
};

const intentSchema = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['recommend', 'help', 'place', 'save', 'plan', 'invite', 'chat'] },
    reply: { type: 'string', description: 'Короткий ответ без названий мест, адресов, цен, событий и неподтверждённых действий' },
    category: { type: 'string', enum: ['', ...categories] },
    interests: { type: 'array', items: { type: 'string' } },
    mood: { type: 'string' },
    budget: { type: 'number', description: 'Число или -1, если неизвестно; валюту не конвертируй' },
    durationMinutes: { type: 'number', description: 'Минуты или -1, если неизвестно; пара учебных пар — не часы' },
    dateText: { type: 'string', description: 'Точная цитата даты из сообщения или пустая строка' },
    withFriends: { type: 'boolean' },
    nearby: { type: 'boolean' },
  },
  required: ['intent', 'reply', 'category', 'interests', 'mood', 'budget', 'durationMinutes', 'dateText', 'withFriends', 'nearby'],
};

function screenContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return { screen: 'other', placeId: null, help: screens.other };
  const screen = Object.hasOwn(screens, context.screen) ? context.screen : 'other';
  const placeId = screen === 'place' && typeof context.placeId === 'string' && /^[\w-]{1,128}$/.test(context.placeId) ? context.placeId : null;
  return { screen, placeId, help: screens[screen] };
}

function helpReply(message, screen) {
  const text = message.toLocaleLowerCase('ru');
  if (/карт/.test(text)) return 'Нажми «Карта» на нижней панели. Там можно найти место или адрес и начать построение маршрута.';
  if (/поиск|найти\s+мест/.test(text)) return 'Открой «Поиск» на нижней панели, введи название или выбери категорию.';
  if (/план|приглаш/.test(text)) return 'В профиле открой «Планы и приглашения». Новый план можно составить из карточки места.';
  if (/профил/.test(text)) return 'Нажми «Профиль» на нижней панели. Там находятся сохранённые места, друзья и настройки.';
  return screen.help;
}

const numbers = { один: 1, одна: 1, одно: 1, два: 2, две: 2, пару: 2, пара: 2, трех: 3, три: 3, четыре: 4, пять: 5 };
function amount(value) { return /^\d+$/.test(value) ? Number(value) : numbers[value]; }

function evidence(text) {
  const lower = text.toLocaleLowerCase('ru').replace(/ё/g, 'е');
  let budget = null;
  let currency = null;
  if (/бесплатн|без\s+денег|ноль\s+руб/.test(lower)) { budget = 0; currency = 'RUB'; }
  const money = lower.match(/(\d{1,8}(?:[.,]\d{1,2})?)\s*(руб(?:л(?:ей|я|ь)?)?\.?|₽|р\.|usd|доллар(?:ов|а)?|\$|eur|евро|€)/);
  if (money) {
    budget = Number(money[1].replace(',', '.'));
    currency = /^(?:usd|доллар|\$)/.test(money[2]) ? 'USD' : /^(?:eur|евро|€)/.test(money[2]) ? 'EUR' : 'RUB';
  }
  const leadingMoney = lower.match(/([$€])\s*(\d{1,8}(?:[.,]\d{1,2})?)/);
  if (!money && leadingMoney) { budget = Number(leadingMoney[2].replace(',', '.')); currency = leadingMoney[1] === '$' ? 'USD' : 'EUR'; }
  let durationMinutes = null;
  const time = lower.match(/(\d{1,4}|один|одна|два|две|пару|пара|три|четыре|пять)\s*(час(?:а|ов)?|минут(?:а|ы)?)/);
  if (time) durationMinutes = amount(time[1]) * (time[2].startsWith('час') ? 60 : 1);
  const validBudget = budget !== null && Number.isFinite(budget) && budget >= 0 && budget <= 10000000;
  return { budget: validBudget ? budget : null, currency: validBudget ? currency : null, durationMinutes: durationMinutes > 0 && durationMinutes <= 1440 ? durationMinutes : null };
}

function validateIntent(raw, message, history) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      !['recommend', 'help', 'place', 'save', 'plan', 'invite', 'chat'].includes(raw.intent) ||
      typeof raw.reply !== 'string' || raw.reply.length > 1000 ||
      typeof raw.category !== 'string' || !['', ...categories].includes(raw.category) ||
      !Array.isArray(raw.interests) || raw.interests.length > 8 || raw.interests.some(v => typeof v !== 'string' || v.length > 80) ||
      typeof raw.mood !== 'string' || raw.mood.length > 80 ||
      typeof raw.budget !== 'number' || !Number.isFinite(raw.budget) ||
      typeof raw.durationMinutes !== 'number' || !Number.isFinite(raw.durationMinutes) ||
      typeof raw.dateText !== 'string' || raw.dateText.length > 80 ||
      typeof raw.withFriends !== 'boolean' || typeof raw.nearby !== 'boolean') return null;
  const userMessages = [...history.filter(item => item.role === 'user').map(item => item.content), message];
  const userText = userMessages.join(' ');
  const known = { budget: null, currency: null, durationMinutes: null };
  for (const text of userMessages) {
    const found = evidence(text);
    if (found.budget !== null) { known.budget = found.budget; known.currency = found.currency; }
    if (found.durationMinutes !== null) known.durationMinutes = found.durationMinutes;
  }
  const dateText = raw.dateText.trim();
  const lower = userText.toLocaleLowerCase('ru');
  // The site's categories are explicit; common inflections from the user are
  // mapped to the same category IDs instead of returning unrelated first rows.
  const categoryWords = {
    cafe: 'кафе|кофе', restaurant: 'ресторан', park: 'парк|погуля|гуля|прогул',
    museum: 'музе|выставк', shop: 'магазин|покупк', entertainment: 'кино|развлечен',
  };
  const rejected = new Set();
  let inferredCategory = null;
  for (const text of userMessages) {
    for (const [category, words] of Object.entries(categoryWords)) {
      if (!new RegExp(words, 'iu').test(text)) continue;
      const negative = new RegExp(`(?:не(?:\\s+хочу|\\s+надо|\\s+нужен)?|кроме|только\\s+не)\\s+(?:в\\s+)?(?:${words})`, 'iu').test(text);
      if (negative) { rejected.add(category); if (inferredCategory === category) inferredCategory = null; }
      else { rejected.delete(category); inferredCategory = category; }
    }
  }
  const explicit = value => value && lower.includes(value.toLocaleLowerCase('ru'));
  return {
    intent: raw.intent, reply: raw.reply.trim(), category: inferredCategory || (raw.category && !rejected.has(raw.category) ? raw.category : null), excludedCategories: [...rejected],
    interests: raw.interests.map(x => x.trim()).filter(explicit), mood: explicit(raw.mood.trim()) ? raw.mood.trim() : null,
    budget: known.budget,
    currency: known.currency,
    durationMinutes: known.durationMinutes,
    dateText: dateText && userText.toLocaleLowerCase('ru').includes(dateText.toLocaleLowerCase('ru')) ? dateText : null,
    withFriends: /друг|друз|компани|вместе|пати/i.test(lower),
    nearby: /рядом|поблизости|недалеко|ближайш/i.test(lower),
  };
}

module.exports = { intentSchema, validateIntent, screenContext, helpReply, evidence };
