require('dotenv').config({ quiet: true });

const bcrypt = require('bcrypt');
const cors = require('cors');
const express = require('express');
const db = require('./db');
const databaseService = require('./database-service');
const statistics = require('./statistics')(db);
const map = require('./map')(db, statistics.auth, statistics.optionalAuth);
const connections = require('./connections')(db, statistics.auth, { onFriendRemoved: map.revokeFriendship });
const accountProfiles = require('./account-profile')(db, statistics.auth);
const media = require('./media')(db, statistics.auth);
const social = require('./social')(db, statistics.auth, media);
media.setCanRead(social.canReadMedia);
const path = require('node:path');
const companyPlaces = require('./company-places')(db, statistics.auth, databaseService);
const { createAssistantRouter } = require('./assistant/router');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
// Test accounts have a published password, so demo mode must never listen on a network interface.
if (process.env.LOCAL_DEMO === '1' && !['127.0.0.1', 'localhost', '::1'].includes(HOST)) {
  throw new Error('LOCAL_DEMO разрешён только на localhost');
}
const endpoints = [
  'GET /api/posts',
  'GET /api/stories',
  'GET /api/posts/:id',
  'POST /register',
  'POST /login',
  'GET /api/connections',
  'GET /api/company/places',
];

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use('/api/company/places', companyPlaces.router);
app.use('/api', accountProfiles.router);
app.use('/api/media', media.router);
app.use(express.json());
app.use('/api/assistant', createAssistantRouter({
  auth: statistics.auth,
  loadPosts: () => new Promise((resolve, reject) => {
    db.all('SELECT id, place, category, address, bio FROM posts ORDER BY created_at DESC LIMIT 1000', (error, rows) => error ? reject(error) : resolve(rows));
  }),
}));
app.use('/map-assets', express.static(path.join(__dirname, 'map-assets')));
app.use('/maplibre', express.static(path.join(__dirname, 'node_modules', 'maplibre-gl', 'dist')));
app.use('/api/map', map.router);

app.get('/', (_req, res) => {
  res.json({ message: 'Сервер работает!', endpoints: ['GET /api', ...endpoints] });
});

app.get('/api', (_req, res) => {
  res.json({ message: 'API работает!', endpoints });
});

app.get('/api/posts', async (_req, res) => {
  res.json(await databaseService.getPosts());
});

app.get('/api/stories', async (_req, res) => {
  res.json(await databaseService.getStories());
});

app.get('/api/place-covers/:placeId/:version', companyPlaces.getCover);

app.get('/api/posts/:id', async (req, res) => {
  const post = await databaseService.getPostById(req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  res.json(post);
});

function insertUser(fields) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (email, name, surname, password, role) VALUES (?, ?, ?, ?, ?)',
      fields,
      function onInsert(error) {
        if (error) reject(error);
        else resolve(this.lastID);
      }
    );
  });
}

function findUser(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], (error, user) => {
      if (error) reject(error);
      else resolve(user);
    });
  });
}

app.post('/register', async (req, res) => {
  const { email, name, surname, password, role } = req.body ?? {};
  if (![email, name, password].every(value => typeof value === 'string' && value) ||
      (surname != null && typeof surname !== 'string')) {
    return res.status(400).json({ error: 'Укажите email, имя и пароль' });
  }
  if (role !== 'user' && role !== 'company') {
    return res.status(400).json({ error: 'Role должен быть "user" или "company"' });
  }
  // Логин демо-администратора нельзя занять при регистрации обычного аккаунта.
  if (process.env.LOCAL_DEMO === '1' && email.trim().toLowerCase() === 'admin@local.test') {
    return res.status(409).json({ error: 'Email зарезервирован' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const userId = await insertUser([email, name, surname || null, hashedPassword, role]);
    res.status(201).json({ message: 'Пользователь зарегистрирован', userId });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('users.email')) {
      return res.status(409).json({ error: 'Email уже зарегистрирован' });
    }
    throw error;
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (![email, password].every(value => typeof value === 'string' && value)) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  if (process.env.LOCAL_DEMO === '1' && email === 'admin@local.test' && password === 'demo1234') {
    const user = { id: 'local-admin', name: 'Администратор', email, role: 'admin', handle: 'admin', surname: null };
    return res.json({ user, token: statistics.issue(user) });
  }
  const user = await findUser(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const { password: _password, ...safeUser } = user;
  res.json({
    message: 'Логин успешен',
    user: { ...safeUser, handle: email.split('@')[0].toLowerCase() },
    token: statistics.issue({ id: String(user.id), role: user.role }),
  });
});

app.post('/api/logout', statistics.auth, (req, _res, next) => { map.hide(req.account.id); next(); });
app.use('/api', statistics.router);
app.use('/api/connections', connections.router);
app.use('/api/social', social.router);
// Отдельный модуль подключён после общей аутентификации статистики; доступ ограничен внутри модуля.
app.use('/api/admin', require('./admin')(db, statistics.auth));

app.use((req, res) => {
  res.status(404).json({
    error: 'Маршрут не найден',
    path: req.path,
    method: req.method,
    availableEndpoints: ['GET /', 'GET /api', ...endpoints],
  });
});

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);

  if (error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ error: 'Некорректный запрос' });
  }
  console.error('Ошибка обработки запроса', error);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

function reportStartupError(error) {
  console.error('Не удалось запустить API', error);
  process.exitCode = 1;
}

db.ready.then(async () => {
  await statistics.initialize();
  await connections.initialize();
  await accountProfiles.initialize();
  await media.initialize();
  await social.initialize();
  await map.initialize();
  await companyPlaces.initialize();
  const server = app.listen(PORT, HOST, error => {
    if (error) {
      reportStartupError(error);
      return;
    }
    console.log(`API доступно по адресу http://${HOST}:${server.address().port}/api`);
  });
}).catch(reportStartupError);

