'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./server');
const stats = require('./analytics');

test('HTTP demo: сессия, фильтрация по ролям и учёт действия', async () => {
 const {server, db} = await createApp();
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = `http://127.0.0.1:${server.address().port}`;
 try {
  assert.equal((await fetch(base+'/demo/stats')).status, 401);
  const login = async role => (await fetch(base+'/demo/login/'+role,{method:'POST'})).headers.get('set-cookie').split(';')[0];
  const admin = await login('admin'), company = await login('company'), user = await login('user');
  await stats.record(db,{type:'card_view', actorId:'another-user', placeId:'another-place'});
  assert.equal((await fetch(base+'/demo/event/card_view',{method:'POST',headers:{cookie:user}})).status,200);
  const read = async cookie => (await fetch(base+'/demo/stats',{headers:{cookie}})).json();
  assert.equal((await read(admin)).counts.card_view,2);
  assert.equal((await read(company)).counts.card_view,1);
  assert.equal((await read(user)).counts.card_view,1);
  assert.equal((await fetch(base+'/demo/event/unexpected',{method:'POST',headers:{cookie:user}})).status,400);
 } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});
