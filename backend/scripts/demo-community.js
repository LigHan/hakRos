'use strict';

// Explicit, local-only demo setup. Credentials stay in an ignored file;
// locations belong only to the fictional accounts and expire normally.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const backend = path.resolve(__dirname, '..');
const configFile = path.join(backend, '.env.demo-community.json');
const base = (process.env.DEMO_API_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw new Error('Демо-данные можно создавать только на локальном сервере.');
const requestedInterval = Number(process.env.DEMO_LOCATION_REFRESH_MS);
const interval = Number.isFinite(requestedInterval) && requestedInterval >= 2000 && requestedInterval <= 240000 ? requestedInterval : 120000;
const friends = [
  { name: 'Анна', surname: 'Демо', bio: 'Люблю прогулки и уютные места после пар.', latitude: 48.018, longitude: 37.805, point: 'Демо · Место для прогулки', image: 'scherbakov-park.jpg', posts: ['Нашла место для прогулки после занятий 🌿', 'Кто хочет выбраться погулять на выходных?'] },
  { name: 'Максим', surname: 'Демо', bio: 'Ищу интересные места в городе.', latitude: 48.013, longitude: 37.799, point: 'Демо · Встреча в центре', image: 'lenin-square.jpg', posts: ['Немного фотографий из центра города 📷', 'Хочу открыть для себя ещё одно новое место. Есть идеи?'] },
  { name: 'Дарья', surname: 'Демо', bio: 'Кофе, выставки и городские прогулки.', latitude: 48.010, longitude: 37.807, point: 'Демо · Любимое место', image: 'forged-figures-park.jpg', posts: ['Хороший день, чтобы гулять и замечать детали ✨', 'Давайте соберём идеи для совместного отдыха после пар!'] },
];

function writeConfig(config) {
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}
function loadConfig(create = false) {
  if (fs.existsSync(configFile)) return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (!create) throw new Error('Сначала запустите создание демо-аккаунтов.');
  const suffix = crypto.randomBytes(4).toString('hex');
  const accounts = ['user', 'friend1', 'friend2', 'friend3'].map(label => ({
    email: `hakros-${label}-${suffix}@example.test`,
    password: crypto.randomBytes(12).toString('base64url'),
  }));
  const config = { version: 1, suffix, accounts };
  writeConfig(config);
  return config;
}

async function request(endpoint, { token, method = 'GET', body, contentType = 'application/json', allow = [] } = {}) {
  const response = await fetch(base + endpoint, {
    method,
    headers: { 'Content-Type': contentType, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: contentType === 'application/json' ? JSON.stringify(body) : body }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !allow.includes(response.status)) {
    const error = new Error(`${method} ${endpoint} — HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return { status: response.status, data };
}
async function login(account) {
  const { data } = await request('/login', { method: 'POST', body: { email: account.email, password: account.password } });
  if (!data.token || !data.user?.id) throw new Error('Не удалось войти в демо-аккаунт.');
  return { token: data.token, id: String(data.user.id) };
}

async function seed() {
  const config = loadConfig(true);
  const profiles = [{ name: 'Алексей', surname: 'Демо', bio: 'Демонстрационный профиль для просмотра ленты и карты.' }, ...friends];
  const sessions = [];
  for (let index = 0; index < profiles.length; index++) {
    const account = config.accounts[index], profile = profiles[index];
    await request('/register', { method: 'POST', allow: [409], body: { ...account, name: profile.name, surname: profile.surname, role: 'user' } });
    const session = await login(account);
    sessions.push(session);
    await request('/api/account/profile', { token: session.token, method: 'PATCH', body: { bio: profile.bio, isPrivate: true } });
  }
  const owner = sessions[0];
  const connections = (await request('/api/connections', { token: owner.token })).data;
  for (const friend of sessions.slice(1)) {
    if (connections.friends.some(entry => entry.id === friend.id)) continue;
    await request(`/api/connections/friends/${friend.id}/request`, { token: owner.token, method: 'PUT' });
    await request(`/api/connections/friends/${owner.id}/accept`, { token: friend.token, method: 'PUT' });
  }
  for (let index = 0; index < friends.length; index++) {
    const friend = friends[index], session = sessions[index + 1], account = config.accounts[index + 1];
    const places = (await request('/api/map/places', { token: session.token })).data;
    if (!places.some(place => place.name === friend.point && place.isOwn)) {
      await request('/api/map/places', { token: session.token, method: 'POST', body: { name: friend.point, latitude: friend.latitude, longitude: friend.longitude } });
    }
    if (!account.mediaId) {
      const image = fs.readFileSync(path.join(backend, '..', 'frontend', 'assets', 'images', 'places', friend.image));
      const upload = await request('/api/media', { token: session.token, method: 'POST', body: image, contentType: 'image/jpeg' });
      account.mediaId = upload.data.id;
      writeConfig(config);
    }
    for (let number = 0; number < friend.posts.length; number++) {
      await request('/api/social/items', { token: session.token, method: 'POST', body: {
        kind: 'post', body: friend.posts[number], ...(number === 0 ? { mediaId: account.mediaId } : {}),
        requestId: `demo-community-${config.suffix}-${index}-${number}`,
      } });
    }
  }
  const feed = (await request('/api/social/feed', { token: owner.token })).data;
  const points = (await request('/api/map/places', { token: owner.token })).data;
  const authors = new Set(sessions.slice(1).map(friend => friend.id));
  const postCount = feed.filter(post => authors.has(post.authorId) && post.kind === 'post').length;
  const pointCount = friends.filter(friend => points.some(point => point.name === friend.point)).length;
  if (postCount < 6 || pointCount < 3) throw new Error('Не все демо-публикации или точки доступны основному аккаунту.');
  console.log('Готово: 1 демо-аккаунт, 3 друга, 6 постов и 3 точки.');
  console.log('Данные для входа сохранены в backend/.env.demo-community.json (файл не входит в Git).');
}

async function watch() {
  const config = loadConfig();
  const owner = await login(config.accounts[0]);
  const states = friends.map(() => ({}));
  let stopped = false, timer;
  const stop = () => { stopped = true; clearTimeout(timer); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  async function update(index) {
    const state = states[index], profile = friends[index], account = config.accounts[index + 1];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!state.token) state.token = (await login(account)).token;
        if (!state.shareId) state.shareId = (await request('/api/map/location', { token: state.token, method: 'POST', body: { recipientIds: [owner.id] } })).data.id;
        await request(`/api/map/location/${state.shareId}`, { token: state.token, method: 'PUT', body: { latitude: profile.latitude, longitude: profile.longitude } });
        return;
      } catch (error) {
        state.token = null; state.shareId = null;
        if (attempt) throw error;
      }
    }
  }
  async function refresh() {
    try { for (let index = 0; index < friends.length; index++) await update(index); }
    catch { console.error('Демо-геопозиции временно недоступны; повторим попытку.'); }
    if (!stopped) timer = setTimeout(refresh, interval);
  }
  await refresh();
  console.log('Демо-геопозиции обновляются; Ctrl+C завершает показ.');
}

const command = process.argv[2];
if (command === '--seed') seed().catch(error => { console.error(error.message); process.exitCode = 1; });
else if (command === '--watch') watch().catch(error => { console.error(error.message); process.exitCode = 1; });
else { console.error('Использование: node scripts/demo-community.js --seed | --watch'); process.exitCode = 1; }
