import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const origin=process.env.CONTOUR_URL||'http://localhost:3000';
const accounts=Object.fromEntries([...readFileSync(new URL('../.data/auth/ACCESS.txt',import.meta.url),'utf8').matchAll(/Логин: (.+)\nПароль: (.+)/g)].map(m=>[m[1],m[2]]));
let cookie='',csrf='',issued=null;
async function call(path,method='GET',body,token){const r=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json','idempotency-key':crypto.randomUUID(),...(token?{authorization:'Bearer '+token}:{cookie,'x-csrf-token':csrf})},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();if(value.csrf)csrf=value.csrf;return {status:r.status,body:value};}
try{
 assert.equal((await call('/api/health')).body.mode,'authenticated');assert.equal((await call('/api/bootstrap')).status,401);assert.equal((await call('/api/session','POST',{role:'executive'})).status,403);
 assert.equal((await call('/api/auth/login','POST',{username:'executive',password:accounts.executive})).status,200);
 const catalog=await call('/api/v1/catalog');assert.equal(catalog.status,200);assert.ok(catalog.body.metrics.length>=18);
 const result=await call('/api/auth/tokens','POST',{label:'Integration smoke test',expiresIn:60,scopes:['catalog:read','changes:propose']});assert.equal(result.status,200);issued=result.body;
 assert.equal((await call('/api/v1/catalog?market=BY','GET',undefined,issued.token)).status,200);
 const preview=await call('/api/v1/metrics/preview','POST',{definition:{id:'custom_network_check',label:'Проверка сети',source:'orders',expression:{op:'percentile',field:'leadHours',p:90},scope:{type:'company'},unit:'hours'}},issued.token);assert.equal(preview.status,200,JSON.stringify(preview.body));assert.ok(preview.body.sampleSize>0);
 assert.equal((await call('/api/v1/proposals/does-not-exist/confirm','POST',{confirm:true},issued.token)).status,403);
 await call('/api/auth/tokens/'+issued.id+'/revoke','POST',{});assert.equal((await call('/api/v1/catalog','GET',undefined,issued.token)).status,401);issued=null;
 await call('/api/auth/logout','POST',{});assert.equal((await call('/api/auth/login','POST',{username:'maxim',password:accounts.maxim})).status,200);
 assert.equal((await call('/api/v1/catalog?department=books')).status,403);assert.ok(!(await call('/api/v1/fields')).body.sources.find(s=>s.source==='orders').fields.some(f=>f.name==='revenue'));
 await call('/api/auth/logout','POST',{});console.log('Local HTTP smoke passed: gateway, authentication, ACL, preview, token isolation and revocation. No configuration applied.');
}finally{if(issued)await call('/api/auth/tokens/'+issued.id+'/revoke','POST',{});}
