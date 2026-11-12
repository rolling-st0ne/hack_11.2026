import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {signEmbed} from '../server/metabase.mjs';
import {resolve} from 'node:path';
import {ACTORS} from '../server/seed.mjs';
import {project} from '../server/api.mjs';
import {createFilesystemStore,readCsvDirectory} from '../server/filesystem-store.mjs';
import {METABASE_METRICS} from '../server/metabase-query.mjs';
const origin=process.env.CONTOUR_URL||'http://localhost:3000';
const config=JSON.parse(readFileSync(new URL('../.data/metabase/config.json',import.meta.url),'utf8'));
const accounts=Object.fromEntries([...readFileSync(new URL('../.data/auth/ACCESS.txt',import.meta.url),'utf8').matchAll(/Логин: (.+)\nПароль: (.+)/g)].map(m=>[m[1],m[2]]));
const root=new URL('../',import.meta.url).pathname;
const state=await createFilesystemStore(resolve(root,'.data/filesystem'),readCsvDirectory(resolve(root,'data/filesystem'))).read();
let cookie='',csrf='';
async function call(path,method='GET',body){
 const r=await fetch(origin+path,{method,headers:{origin,cookie,'content-type':'application/json','x-csrf-token':csrf,'idempotency-key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});
 if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
 const value=await r.json();if(value.csrf)csrf=value.csrf;return {status:r.status,body:value};
}
async function login(role){assert.equal((await call('/api/auth/login','POST',{username:role,password:accounts[role]})).status,200);}
async function logout(){if(cookie)await call('/api/auth/logout','POST',{});cookie='';csrf='';}
async function embedded(token,path=''){
 const r=await fetch(config.url+'/api/embed/dashboard/'+token+path);
 const raw=await r.text();let body;
 try{body=JSON.parse(raw);}catch{body=raw;}
 return {status:r.status,body};
}
const close=(actual,expected,tolerance=.01)=>{if(expected===null)assert.equal(actual,null);else assert.ok(Math.abs(actual-expected)<=tolerance,`Expected ${expected}, received ${actual}`);};
try{
 assert.equal((await call('/api/metabase/embed')).status,401);
 for(const role of Object.keys(ACTORS)){
  await login(role);
  for(const filters of [{period:'week'},{period:'month',market:'BY'},{period:'custom',from:'2000-01-01',to:'2000-01-02'}]){
   const r=await call('/api/bootstrap?'+new URLSearchParams(filters));assert.equal(r.status,200);
   const expected=project(state,ACTORS[role],filters),view=r.body;
   assert.ok(!view.actor.pages.includes('bi'));
   assert.ok(!JSON.stringify(view).includes('localhost:3001'));assert.ok(!JSON.stringify(view).includes('/embed/'));
   for(const id of METABASE_METRICS){
    const k=view.kpis.find(k=>k.id===id),before=expected.kpis.find(k=>k.id===id);
    if(!before){assert.equal(k,undefined);continue;}
    assert.equal(k.sourceInfo.status,'ok',role+' '+id);assert.equal(k.source,'Metabase');
    close(k.raw,before.value==='—'?null:before.raw,.01);
    assert.deepEqual(k.series,before.series);assert.deepEqual(k.previousSeries,before.previousSeries);assert.deepEqual(k.cumulativeSeries,before.cumulativeSeries);
   }
  }
  const catalog=await call('/api/v1/catalog');assert.equal(catalog.body.metrics.find(m=>m.id==='orders').source,'Metabase');
  await logout();
 }
 console.log('Main dashboard source passed for all seven roles: actual values, history, source metadata, and no browser dependency on Metabase or localhost.');
 for(const role of ['maxim','sergey','operator','support_staff','growth_staff']){
  await login(role);assert.equal((await call('/api/metabase/embed')).status,403,role);await logout();
 }
 await login('executive');
 for(const query of ['period=week','period=month&market=BY&department=books','period=custom&from=2000-01-01&to=2000-01-02']){
  const report=await call('/api/metabase/embed?'+query);assert.equal(report.status,200);
  const view=(await call('/api/bootstrap?'+query)).body;
  const token=new URL(report.body.url).pathname.split('/').at(-1);
  const dashboard=await embedded(token);assert.equal(dashboard.status,200);assert.equal(dashboard.body.dashcards.length,6);
  const values={};
  for(const [key,id] of Object.entries(config.cards)){
   const card=dashboard.body.dashcards.find(c=>c.card_id===id);
   const result=await embedded(token,`/dashcard/${card.id}/card/${id}`);
   assert.ok([200,202].includes(result.status),key+': HTTP '+result.status);assert.equal(result.body.status,'completed',key+': '+(result.body.error||''));
   values[key]=result.body.data.rows;
  }
  close(values.revenue[0][0],view.kpis.find(k=>k.id==='revenue').raw,.06);
  close(values.orders[0][0],view.totals.orders);
  close(values.average[0][0],view.averageCheck);
  close(values.defects[0][0],view.kpis.find(k=>k.id==='defects').raw,.06);
  close(values.trend.reduce((sum,row)=>sum+row[1],0),values.revenue[0][0],.06);
  close(values.departments.reduce((sum,row)=>sum+row[1],0),values.orders[0][0]);
  const card=dashboard.body.dashcards.find(c=>c.card_id===config.cards.orders);
  const override=await embedded(token,`/dashcard/${card.id}/card/${card.card_id}?department=gifts`);
  if([200,202].includes(override.status))assert.deepEqual(override.body.data.rows,values.orders);else assert.ok(override.status>=400);
  const parts=token.split('.');parts[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(parts[1],'base64url')),params:{department:'gifts'}})).toString('base64url');
  assert.ok((await embedded(parts.join('.'))).status>=400,'tampered JWT accepted');
  const expired=signEmbed({...JSON.parse(Buffer.from(token.split('.')[1],'base64url')),exp:Math.floor(Date.now()/1000)-120},config.secret);
  assert.ok((await embedded(expired)).status>=400,'expired JWT accepted');
  console.log(`Verified six Metabase cards: ${query} · ${view.totals.orders} orders`);
 }
 await logout();await login('analyst');assert.equal((await call('/api/metabase/embed')).status,200);
 console.log('Metabase integration passed at '+origin+': dashboard source, real queries, totals, filters, empty periods, locked parameters, token expiry/tampering, role access.');
}finally{await logout();}
