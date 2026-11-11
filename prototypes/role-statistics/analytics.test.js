'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('./database');
const stats = require('./analytics');
const interval = {from:'2026-11-11T00:00:00.000Z',to:'2026-11-12T00:00:00.000Z'};
const clock = () => new Date('2026-11-11T12:00:00.000Z');
test('все семь метрик и категории подсчитываются с разграничением и границами периода', async () => {
 const db=createDatabase(); await stats.initialize(db);
 try {
  for(const type of stats.EVENT_TYPES) {
   const fields = ['search','search_no_results'].includes(type) ? {} : {placeId:'p1'};
   await stats.record(db,{type,actorId:'u1',...fields,...(type==='card_view'?{category:'cafe'}:{})},clock);
  }
  await stats.record(db,{type:'card_view',actorId:'u2',placeId:'p2',category:'walk'},clock);
  await stats.record(db,{type:'card_view',actorId:'u1',placeId:'p1',category:'event'},()=>new Date(interval.to));
  const admin=await stats.summarize(db,{role:'admin'},interval);
  const user=await stats.summarize(db,{role:'user',userId:'u1'},interval);
  const company=await stats.summarize(db,{role:'company',ownedPlaceIds:['p1']},interval);
  for(const type of stats.EVENT_TYPES) assert.equal(admin.counts[type],type==='card_view'?2:1,type);
  assert.deepEqual(admin.categories,{cafe:1,walk:1,event:0});
  assert.deepEqual(user.categories,{cafe:1,walk:0,event:0});
  assert.deepEqual(company.categories,{cafe:1,walk:0,event:0});
  assert.equal(company.counts.search,0); assert.equal(company.counts.search_no_results,0);
  assert.equal(user.counts.search_no_results,1);
  assert.ok(Object.values((await stats.summarize(db,{role:'company',ownedPlaceIds:[]},interval)).counts).every(x=>x===0));
 } finally {db.close();}
});
test('неизвестные категории и роли, ошибочные данные и интервалы отклоняются',async()=>{
 const db=createDatabase();await stats.initialize(db);
 try {
  await assert.rejects(stats.record(db,{type:'card_view',actorId:'u1',placeId:'p1',category:'secret free text'},clock),TypeError);
  await assert.rejects(stats.record(db,{type:'search',actorId:'u1',category:'cafe'},clock),TypeError);
  await assert.rejects(stats.record(db,{type:'search_no_results',actorId:'u1',placeId:'p1'},clock),TypeError);
  await assert.rejects(stats.record(db,{type:'card_view'},clock),TypeError);
  await assert.rejects(stats.summarize(db,{role:'company',ownedPlaceIds:['']},interval),TypeError);
  await assert.rejects(stats.summarize(db,{role:'nobody'},interval),TypeError);
  await assert.rejects(stats.summarize(db,{role:'admin'},{from:interval.to,to:interval.from}),TypeError);
 } finally {db.close();}
});
