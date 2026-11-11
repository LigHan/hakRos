'use strict';
const http = require('node:http');
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const { createDatabase } = require('./database');
const stats = require('./analytics');

// Isolated, synthetic, loopback-only demo. The role selection is NOT authentication.
const profiles = Object.freeze({
  admin: { role: 'admin', scope: { role: 'admin' } },
  company: { role: 'company', scope: { role: 'company', ownedPlaceIds: ['demo-place-1'] } },
  user: { role: 'user', scope: { role: 'user', userId: 'demo-user-1' } },
});
const sample = Object.freeze({
  search: {type:'search', actorId:'demo-user-1'},
  search_no_results: {type:'search_no_results', actorId:'demo-user-1'},
  card_view: {type:'card_view', actorId:'demo-user-1', placeId:'demo-place-1', category:'cafe'},
  card_walk: {type:'card_view', actorId:'demo-user-1', placeId:'demo-place-1', category:'walk'},
  card_event: {type:'card_view', actorId:'demo-user-1', placeId:'demo-place-1', category:'event'},
  favorite_added: {type:'favorite_added', actorId:'demo-user-1', placeId:'demo-place-1'},
  like_added: {type:'like_added', actorId:'demo-user-1', placeId:'demo-place-1'},
  route_requested: {type:'route_requested', actorId:'demo-user-1', placeId:'demo-place-1'},
  share_initiated: {type:'share_initiated', actorId:'demo-user-1', placeId:'demo-place-1'},
});
function json(res, status, value) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
async function createApp() {
  const db = createDatabase(); await stats.initialize(db);
  const sessions = new Map();
  const html = fs.readFileSync(require('node:path').join(__dirname, 'index.html'));
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'}); return res.end(html); }
      const session = sessions.get((req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('demo_session='))?.slice('demo_session='.length));
      if (req.method === 'POST' && /^\/demo\/login\/(admin|company|user)$/.test(req.url)) {
        const role = req.url.split('/').at(-1); const token = randomBytes(24).toString('hex');
        sessions.set(token, profiles[role]); res.setHeader('Set-Cookie', `demo_session=${token}; HttpOnly; SameSite=Strict; Path=/`); return json(res, 200, {role});
      }
      if (!session) return json(res, 401, {error:'Выберите роль'});
      if (req.method === 'POST' && /^\/demo\/event\/[a-z_]+$/.test(req.url)) {
        const name = req.url.split('/').at(-1); if (!Object.hasOwn(sample, name)) return json(res, 400, {error:'Неизвестное действие'});
        await stats.record(db, sample[name]); return json(res, 200, {ok:true});
      }
      if (req.method === 'GET' && req.url === '/demo/stats') {
        const from = '2000-01-01T00:00:00.000Z', to = '2100-01-01T00:00:00.000Z';
        return json(res, 200, {role: session.role, ...await stats.summarize(db, session.scope, {from, to})});
      }
      return json(res, 404, {error:'Не найдено'});
    } catch (err) { console.error('Demo error:', err.message); return json(res, 500, {error:'Ошибка демонстрации'}); }
  });
  return {server, db};
}
if (require.main === module) createApp().then(({server}) => server.listen(8090, '127.0.0.1', () => console.log('Откройте http://127.0.0.1:8090'))).catch(err => {console.error(err.message); process.exitCode=1;});
module.exports = { createApp };
