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
  for (const name of ['search','search_no_results','card_walk','card_event','favorite_added','like_added','route_requested','share_initiated']) {
   assert.equal((await fetch(base+'/demo/event/'+name,{method:'POST',headers:{cookie:user}})).status,200, name);
  }
  const read = async cookie => (await fetch(base+'/demo/stats',{headers:{cookie}})).json();
  assert.equal((await read(admin)).counts.card_view,4);
  assert.equal((await read(company)).counts.card_view,3);
  assert.equal((await read(user)).counts.card_view,3);
  const own = await read(user);
  assert.deepEqual(own.categories,{cafe:1,walk:1,event:1});
  for (const name of ['search','search_no_results','favorite_added','like_added','route_requested','share_initiated']) assert.equal(own.counts[name],1,name);
  assert.equal((await fetch(base+'/demo/event/unexpected',{method:'POST',headers:{cookie:user}})).status,400);
 } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});
