'use strict';
const { test }=require('node:test'); const assert=require('node:assert/strict');
const { spawn }=require('node:child_process');
const port=32000+Math.floor(Math.random()*20000);
const origin=`http://127.0.0.1:${port}`;
async function request(path,{token,body,method}={}){const response=await fetch(origin+path,{method:method||'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
test('Серверная статистика: роли, собственность, события, запрет анонимного доступа',async()=>{
 const server=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DB_PATH:':memory:',LOCAL_DEMO:'1'},stdio:'ignore'});
 try {
 let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/api')).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready,'тестовый сервер запустился');
 assert.equal((await request('/api/statistics')).status,401);
 assert.equal((await request('/login',{method:'POST',body:{email:'user@local.test',password:'wrong'}})).status,401);
 const login=async email=>(await request('/login',{method:'POST',body:{email,password:'demo1234'}})).data.token;
 const [user,company,admin]=await Promise.all(['user@local.test','company@local.test','admin@local.test'].map(login));
 assert.ok(user&&company&&admin);
 const posts=(await request('/api/posts')).data.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 assert.ok(posts.length>=2);
 const own=String(posts[0].id),other=String(posts[1].id);
 const before=await Promise.all([user,company,admin].map(token=>request('/api/statistics',{token})));
 assert.deepEqual(before.map(x=>x.data.role),['user','company','admin']);
 for(const [type,placeId] of [['card_view',own],['card_view',other],['favorite_added',own],['route_requested',own],['search',null],['search_no_results',null]]){
  const result=await request('/api/events',{token:user,method:'POST',body:{type,...(placeId?{placeId}:{})}});assert.equal(result.status,201,type);
 }
 const after=await Promise.all([user,company,admin].map(token=>request('/api/statistics',{token})));
 assert.equal(after[0].data.counts.card_view-before[0].data.counts.card_view,2);
 assert.equal(after[1].data.counts.card_view-before[1].data.counts.card_view,1);
 assert.equal(after[2].data.counts.card_view-before[2].data.counts.card_view,2);
 assert.equal(after[1].data.counts.search,0);
 assert.equal((await request('/api/events',{token:user,method:'POST',body:{type:'card_view',placeId:'fake'}})).status,404);
 assert.equal((await request('/api/events',{token:user,method:'POST',body:{type:'invalid'}})).status,400);
 await request('/api/logout',{token:user,method:'POST'});
 assert.equal((await request('/api/statistics',{token:user})).status,401);
 } finally {server.kill();}
});

