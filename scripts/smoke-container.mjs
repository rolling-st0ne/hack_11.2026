import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';

const mode=process.argv[2]||'prepare';
assert.ok(['prepare','verify'].includes(mode),'Use prepare or verify');
const origin=process.env.CONTOUR_URL||'http://127.0.0.1:3000';
const root=resolve(import.meta.dirname,'..'),authDir=process.env.CONTOUR_AUTH||resolve(root,'.data/auth');
const filesDir=process.env.CONTOUR_FILES||resolve(root,'.data/filesystem');
const receipt=resolve(root,'.data/container-verification.json');
const digest=data=>createHash('sha256').update(data).digest('hex');
const accounts=Object.fromEntries([...readFileSync(resolve(authDir,'ACCESS.txt'),'utf8').matchAll(/Логин: (.+)\nПароль: (.+)/g)].map(m=>[m[1],m[2]]));
// Use a LAN Host not present on a container interface to exercise port publishing.
const authority='192.168.100.83:3300';let cookie='',csrf='';
function wire(path,{method='GET',headers={},body}={}){
  // node:http sends the supplied Host verbatim. Fetch may replace it with the
  // connection authority, which would not test Docker/LAN host validation.
  return new Promise((resolve,reject)=>{
    const request=httpRequest(new URL(path,origin),{method,headers,timeout:20000},upstream=>{
      const chunks=[];upstream.on('data',chunk=>chunks.push(chunk));upstream.on('error',reject);
      upstream.on('end',()=>{
        const headers=new Headers();for(const [key,value] of Object.entries(upstream.headers))for(const part of Array.isArray(value)?value:[value])if(part!==undefined)headers.append(key,part);
        resolve(new Response(Buffer.concat(chunks),{status:upstream.statusCode,headers}));
      });
    });
    request.on('error',reject);request.on('timeout',()=>request.destroy(new Error('HTTP smoke timeout')));request.end(body);
  });
}
async function call(path,method='GET',body){
  const response=await wire(path,{method,headers:{host:authority,origin:'http://'+authority,cookie,'content-type':'application/json','x-csrf-token':csrf,'idempotency-key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const value=await response.json();if(value.csrf)csrf=value.csrf;
  return {status:response.status,body:value};
}
async function login(username){assert.equal((await call('/api/auth/login','POST',{username,password:accounts[username]})).status,200);}
async function logout(){assert.equal((await call('/api/auth/logout','POST',{})).status,200);cookie='';csrf='';}
function persisted(){
  const current=resolve(filesDir,readFileSync(resolve(filesDir,'CURRENT'),'utf8').trim());
  const csv=Object.fromEntries(readdirSync(current).filter(n=>n.endsWith('.csv')&&!['audit.csv','metadata.csv'].includes(n)).sort().map(n=>[n,digest(readFileSync(resolve(current,n)))]));
  const config=JSON.parse(readFileSync(resolve(root,'.data/metabase/config.json'),'utf8'));
  return {csv,accounts:digest(readFileSync(resolve(authDir,'users.json'))),metabase:{databaseId:config.databaseId,dashboardId:config.dashboardId,metricCardId:config.metricCardId,cards:config.cards,credentials:digest(config.password+config.secret)}};
}
assert.equal((await call('/api/health')).body.mode,'authenticated');
assert.equal((await call('/api/bootstrap')).status,401);
assert.equal((await wire('/',{headers:{host:'untrusted.example'}})).status,403);
assert.equal((await wire('/')).status,200);
assert.equal((await wire('/.data/auth/ACCESS.txt')).status,404);
await login('maxim');
assert.equal((await call('/api/bootstrap?department=books')).status,403);
let view=(await call('/api/bootstrap?period=custom&from=2026-11-05&to=2026-11-11')).body;
assert.ok(!view.kpis.some(k=>k.id==='revenue'));
assert.equal(view.kpis.find(k=>k.id==='orders').sourceInfo.status,'ok');
await logout();await login('executive');
view=(await call('/api/bootstrap?period=custom&from=2026-11-05&to=2026-11-11')).body;
for(const id of ['orders','revenue','defects']){
  const k=view.kpis.find(k=>k.id===id);assert.equal(k.source,'Metabase');assert.equal(k.sourceInfo.status,'ok',id);assert.ok(Number.isFinite(k.raw),id);
}
const values=Object.fromEntries(view.kpis.map(k=>[k.id,k.raw]));
if(mode==='prepare'){
  const result={...persisted(),auditId:view.audit[0].id,values};
  writeFileSync(receipt,JSON.stringify(result,null,2),{mode:0o600});
  console.log('Container smoke passed: UI, LAN Host, authentication, manager ACL and real Metabase metrics. Persistence checkpoint saved.');
}else{
  const before=JSON.parse(readFileSync(receipt,'utf8'));
  assert.deepEqual(persisted(),{csv:before.csv,accounts:before.accounts,metabase:before.metabase});
  assert.deepEqual(values,before.values);
  assert.ok(view.audit.some(a=>a.id===before.auditId),'Earlier audit entry must survive recreation');
  console.log('Container recreation verified: business CSV, accounts, audit, Metabase configuration and KPI values preserved.');
}
await logout();
