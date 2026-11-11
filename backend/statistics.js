'use strict';
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const express = require('express');

module.exports = function createStatistics(db) {
  const sessions = new Map();
  const router = express.Router();
  const types = new Set(['search','search_no_results','card_view','favorite_added','like_added','route_requested','share_initiated']);
  const needsPlace = new Set(['card_view','favorite_added','like_added','route_requested','share_initiated']);
  const run = (sql, params=[]) => new Promise((resolve,reject)=>db.run(sql,params,function(e){e?reject(e):resolve(this)}));
  const get = (sql, params=[]) => new Promise((resolve,reject)=>db.get(sql,params,(e,r)=>e?reject(e):resolve(r)));
  const all = (sql, params=[]) => new Promise((resolve,reject)=>db.all(sql,params,(e,r)=>e?reject(e):resolve(r)));
  const issue = user => { const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,{...user, expires:Date.now()+12*60*60*1000}); return token; };
  const readToken = req => /^Bearer ([a-f0-9]{64})$/.exec(req.get('Authorization') || '')?.[1];
  function auth(req,res,next) {
    const token=readToken(req), session=sessions.get(token);
    if (!session || session.expires <= Date.now()) { if(token) sessions.delete(token); return res.status(401).json({error:'Требуется вход в аккаунт'}); }
    req.account=session; next();
  }
  router.post('/logout',auth,(req,res)=>{sessions.delete(readToken(req));res.json({ok:true});});
  router.post('/events',auth,async(req,res)=>{
    const {type,placeId}=req.body||{};
    if (!types.has(type) || (needsPlace.has(type) ? typeof placeId !== 'string' || placeId.length > 128 : placeId != null)) return res.status(400).json({error:'Некорректное событие'});
    let place = null;
    if (needsPlace.has(type)) { place=await get('SELECT id, category FROM posts WHERE id=?',[placeId]); if(!place) return res.status(404).json({error:'Место не найдено'}); }
    await run('INSERT INTO local_statistics (type, occurred_at, actor_id, place_id, category) VALUES (?, ?, ?, ?, ?)',[type,new Date().toISOString(),req.account.id,place?.id || null,type==='card_view' ? place.category : null]);
    res.status(201).json({ok:true});
  });
  router.get('/statistics',auth,async(req,res)=>{
    const from=new Date(Date.now()-30*86400000).toISOString(),to=new Date(Date.now()+1000).toISOString();
    let where='occurred_at >= ? AND occurred_at < ?', params=[from,to];
    // На Android администратор использует личную статистику как обычный пользователь.
    const personal = req.account.role === 'admin' && req.query.scope === 'personal';
    if(req.account.role==='user' || personal){where+=' AND actor_id = ?';params.push(req.account.id);}
    else if(req.account.role==='company'){where+=' AND place_id IN (SELECT place_id FROM local_place_owners WHERE owner_id = ?)';params.push(req.account.id);}
    else if(req.account.role!=='admin') return res.status(403).json({error:'Нет доступа'});
    const rows=await all(`SELECT type,COUNT(*) n FROM local_statistics WHERE ${where} GROUP BY type`,params);
    const categories=await all(`SELECT category,COUNT(*) n FROM local_statistics WHERE ${where} AND type='card_view' AND category IS NOT NULL GROUP BY category`,params);
    const counts=Object.fromEntries([...types].map(type=>[type,0])); for(const row of rows) if(Object.hasOwn(counts,row.type)) counts[row.type]=row.n;
    res.json({role:personal?'user':req.account.role,from,to,counts,categories});
  });
  async function initialize(){
    await run('CREATE TABLE IF NOT EXISTS local_statistics (id INTEGER PRIMARY KEY, type TEXT NOT NULL, occurred_at TEXT NOT NULL, actor_id TEXT NOT NULL, place_id TEXT, category TEXT)');
    await run('CREATE INDEX IF NOT EXISTS local_statistics_time ON local_statistics(occurred_at)');
    await run('CREATE TABLE IF NOT EXISTS local_place_owners (place_id TEXT NOT NULL, owner_id TEXT NOT NULL, PRIMARY KEY (place_id, owner_id))');
    if(process.env.LOCAL_DEMO==='1'){
      for(const item of [{email:'user@local.test',name:'Тестовый пользователь',role:'user'},{email:'company@local.test',name:'Тестовая компания',role:'company'}]){
        const existing=await get('SELECT id FROM users WHERE email=?',[item.email]);
        if(!existing) await run('INSERT INTO users(email,name,surname,password,role) VALUES(?,?,NULL,?,?)',[item.email,item.name,await bcrypt.hash('demo1234',10),item.role]);
      }
      const owner=await get('SELECT id FROM users WHERE email=?',['company@local.test']);
      const post=await get('SELECT id FROM posts ORDER BY id LIMIT 1');
      if(owner&&post) await run('INSERT OR IGNORE INTO local_place_owners(place_id,owner_id) VALUES(?,?)',[post.id,String(owner.id)]);
    }
  }
  // Админка использует ту же серверную проверку токена, что и статистика.
  return {router,issue,initialize,auth};
};

