import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSeed,ACTORS} from '../server/seed.mjs';
import {normalizeSources,FilesystemAdapter} from '../server/adapters.mjs';
import {createFilesystemStore} from '../server/filesystem-store.mjs';
import {createAuth} from '../server/auth.mjs';
import {handleApi,project} from '../server/api.mjs';
import {analytics} from '../server/analytics.mjs';
import {inspectSources,sourceTime} from '../server/data-contract.mjs';
import {parseCsv,writeCsv} from '../server/csv.mjs';
import {shiftHours,DAY_MS} from '../server/reporting.mjs';
const metric=(a,id)=>a.kpis.find(k=>k.id===id);
const fresh=()=>normalizeSources(createSeed());
const def=(id='custom_fractional',scope={type:'company'})=>({id,label:'Проверка метрики',source:'orders',expression:{op:'count'},unit:'count',scope,target:1e-7});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'contour-compliance-')),state=fresh(),store=createFilesystemStore(join(dir,'files'),FilesystemAdapter.encode(state).files,state),auth=createAuth(join(dir,'auth'));
 const credentials=Object.fromEntries([...readFileSync(join(dir,'auth/ACCESS.txt'),'utf8').matchAll(/Логин: (.+)\nПароль: (.+)/g)].map(m=>[m[1],m[2]]));
 async function client(role){let cookie='',csrf='';async function req(path,method='GET',body){const r=await handleApi(new Request('http://localhost'+path,{method,headers:{cookie,origin:'http://localhost','x-csrf-token':csrf,'idempotency-key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})}),store,{auth});const value=await r.json();if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];if(value.csrf)csrf=value.csrf;return {status:r.status,body:value};}assert.equal((await req('/api/auth/login','POST',{username:role,password:credentials[role]})).status,200);return req;}
 return {dir,store,client,close(){rmSync(dir,{recursive:true,force:true});}};
}
async function propose(req,definition,baseVersion=0){const r=await req('/api/v1/proposals','POST',{kind:'metric',definition,baseVersion});assert.equal(r.status,201,JSON.stringify(r.body));return r.body.proposal;}
async function confirm(req,p){const detail=await req('/api/v1/proposals/'+p.id);return req('/api/v1/proposals/'+p.id+'/confirm','POST',{confirm:true,confirmationToken:detail.body.confirmationToken});}

test('DATA-01: accepted exponent numbers survive authenticated confirmation and cold CSV read; bad output is not activated',async()=>{
 const f=fixture();try{const req=await f.client('executive'),p=await propose(req,def());assert.equal((await confirm(req,p)).status,200);const loaded=await f.store.read();assert.equal(loaded.metricDefinitions[0].target,1e-7);const pointer=readFileSync(join(f.dir,'files/CURRENT'),'utf8');await assert.rejects(f.store.update(s=>s.metricDefinitions[0].target=NaN));assert.equal(readFileSync(join(f.dir,'files/CURRENT'),'utf8'),pointer);assert.equal((await f.store.read()).metricDefinitions[0].target,1e-7);}finally{f.close();}
});
test('ACL-01: real authenticated manager cannot disclose or overwrite a hidden existing financial metric',async()=>{
 const f=fixture();try{const director=await f.client('executive'),manager=await f.client('maxim'),definition={...def('custom_private',{type:'department',department:'photo'}),expression:{op:'sum',field:'cost'},unit:'BYN',target:125000};assert.equal((await confirm(director,await propose(director,definition))).status,200);const attempt=await manager('/api/v1/proposals','POST',{kind:'metric',baseVersion:1,definition:{...definition,expression:{op:'count'},unit:'count'}});assert.equal(attempt.status,403);assert.ok(!JSON.stringify(attempt.body).includes('125000'));assert.equal((await f.store.read()).metricDefinitions[0].version,1);
 const publicDef=def('custom_public',{type:'department',department:'photo'});assert.equal((await confirm(manager,await propose(manager,publicDef))).status,200);const pending=await propose(manager,{...publicDef,target:8},1);await f.store.update(s=>Object.assign(s.metricDefinitions.find(m=>m.id===publicDef.id),{expression:{op:'sum',field:'cost'},unit:'BYN'}));assert.equal((await confirm(manager,pending)).status,403);
 }finally{f.close();}
});
test('TASK-01/02: assigned owner can access own free decision; incompatible owners and incomplete cards are rejected',async()=>{
 const f=fixture();try{const director=await f.client('executive'),owner=await f.client('support_staff'),body={title:'Проверить задержку ответа',problem:'Задержан ответ на обращение',cause:'Причина требует уточнения',impact:'Клиент ждёт ответа по сроку',owner:'daria',dueAt:new Date(Date.now()+3600000).toISOString()};let r=await director('/api/tasks','POST',{...body,signalId:'SIG-1042'});assert.equal(r.status,400);assert.equal(r.body.code,'incompatible_owner');r=await director('/api/tasks','POST',{...body,impact:''});assert.equal(r.status,400);r=await director('/api/tasks','POST',body);assert.equal(r.status,200);assert.equal(r.body.task.department,'photo');assert.ok((await owner('/api/bootstrap')).body.tasks.some(t=>t.id===r.body.task.id));assert.equal((await owner('/api/tasks/'+r.body.task.id+'/status','PATCH',{status:'in_progress'})).status,200);}finally{f.close();}
});
test('M01: every product slice excludes unrelated legacy orders, linked decisions and signals',()=>{
 const s=fresh();for(const product of ['book','prints','canvas','calendar','cards']){const view=project(s,ACTORS.executive,{product});assert.ok(view.orders.every(o=>o.productId===product));const orders=new Map([...s.facts.orders,...s.orders].map(o=>[o.id,o]));for(const t of view.tasks){const signal=s.signals.find(x=>x.id===t.signalId);assert.equal(orders.get(t.orderId||signal?.orderId)?.productId,product);}for(const a of view.signals)assert.equal(orders.get(a.orderId)?.productId,product);}
});
test('M02/M06: missing product or source date cannot be imported; all source diagnostics expose duplicates',()=>{
 const s=fresh(),before=JSON.stringify(s.facts);for(const field of ['productId','createdAt']){const p=parseCsv(FilesystemAdapter.encode(s).files['orders.csv']);p.rows[0][field]='';assert.throws(()=>FilesystemAdapter.import(s,'orders.csv',writeCsv(p.rows,p.headers)),new RegExp(field));assert.equal(JSON.stringify(s.facts),before);}
 s.facts.customers.push({...s.facts.customers[0]});s.facts.interactions.push({...s.facts.interactions[0]});const q=analytics(s,ACTORS.executive).qualityReport;assert.equal(q.sources.find(x=>x.file==='customers.csv').duplicates,1);assert.equal(q.sources.find(x=>x.file==='interactions.csv').duplicates,1);assert.equal(q.duplicates,2);
});
test('M03/M07/M09: null ratios stay null in catalogs and duplicate order IDs do not inflate KPIs',async()=>{
 const s=fresh(),before=analytics(s,ACTORS.executive);s.facts.orders.push({...s.facts.orders[0]});assert.equal(metric(analytics(s,ACTORS.executive),'orders').raw,metric(before,'orders').raw);s.facts.shifts.forEach(x=>x.availableHours=0);s.facts.staff.forEach(x=>{x.planned=0;x.leads=0;});s.facts.orders.forEach(x=>x.revenue=0);const a=analytics(s,ACTORS.executive);for(const id of ['production','conversion','staffing','margin']){assert.equal(metric(a,id).raw,null,id);assert.equal(metric(a,id).value,'—',id);}
 const f=fixture();try{const req=await f.client('executive'),r=await req('/api/v1/catalog?period=custom&from=2020-01-01&to=2020-01-02');assert.equal(r.status,200);for(const id of ['support','delivery','margin','reviewScore']){const k=r.body.metrics.find(k=>k.id===id);assert.equal(k.value,null,id);assert.equal(k.state,'Нет данных');assert.equal(k.sampleSize,0);}}finally{f.close();}
});
test('M04: forecast week labels use reporting timezone independently of server TZ',()=>{
 const s=fresh(),prior=process.env.TZ,filters={period:'custom',from:'2026-11-05',to:'2026-11-11'};try{process.env.TZ='UTC';const a=analytics(s,ACTORS.executive,filters).forecast;process.env.TZ='America/Los_Angeles';assert.deepEqual(analytics(s,ACTORS.executive,filters).forecast,a);assert.match(a[0].label,/12/);}finally{if(prior===undefined)delete process.env.TZ;else process.env.TZ=prior;}
});
test('M05: an unrelated import does not refresh orders; manual file edits refresh only their source',async()=>{
 const f=fixture();try{const req=await f.client('executive'),before=await f.store.read(),ordersTime=sourceTime(before.facts,['orders.csv']);const csv=FilesystemAdapter.encode(before).files['staff.csv'];assert.equal((await req('/api/files/staff.csv','POST',{csv})).status,200);let after=await f.store.read();assert.equal(sourceTime(after.facts,['orders.csv']),ordersTime);assert.notEqual(sourceTime(after.facts,['staff.csv']),ordersTime);const staffTime=sourceTime(after.facts,['staff.csv']),current=readFileSync(join(f.dir,'files/CURRENT'),'utf8').trim();const p=parseCsv(FilesystemAdapter.encode(after).files['orders.csv']);p.rows[0].leadHours=Number(p.rows[0].leadHours)+1;writeFileSync(join(f.dir,'files',current,'orders.csv'),writeCsv(p.rows,p.headers));after=await f.store.read();assert.notEqual(sourceTime(after.facts,['orders.csv']),ordersTime);assert.equal(sourceTime(after.facts,['staff.csv']),staffTime);await f.store.update(s=>s.audit.push({id:'freshness-check',action:'test'}));assert.equal(sourceTime((await f.store.read()).facts,['staff.csv']),staffTime);}finally{f.close();}
});
test('M08: financial plan/fact uses financial event dates, even when an order belongs to another period',()=>{
 const s=fresh(),o=s.facts.orders[0],e=s.facts.financeEntries.find(e=>e.orderId===o.id);o.createdAt='2025-01-01T00:00:00Z';e.createdAt='2026-01-10T12:00:00+03:00';e.actualInflow=1234;e.plannedInflow=1000;const a=analytics(s,ACTORS.executive,{period:'custom',from:'2026-01-10',to:'2026-01-10'});assert.equal(a.finance.bdds.fact,1234);assert.equal(a.finance.bdds.plan,1000);assert.equal(a.totals.orders,0);e.createdAt='2020-01-01T00:00:00Z';assert.equal(analytics(s,ACTORS.executive,{period:'custom',from:'2026-01-10',to:'2026-01-10'}).finance.bdds.fact,0);
});
test('DATA-02/03/M10: chronological fixture has deadlines and a joined shift calendar driving capacity',()=>{
 const s=fresh(),f=s.facts,orders=new Map(f.orders.map(o=>[o.id,o])),customers=new Map(f.customers.map(c=>[c.id,c]));assert.equal(inspectSources(f).issues.length,0);assert.ok(f.orders.every(o=>Date.parse(o.createdAt)>=Date.parse(customers.get(o.customerId).createdAt)));assert.ok(f.interactions.every(t=>Date.parse(t.createdAt)>=Date.parse(orders.get(t.orderId).createdAt)));assert.ok(f.orders.every(o=>o.promisedAt&&(!o.completed||o.completedAt)));assert.ok(s.signals.every(a=>orders.has(a.orderId)));const a=analytics(s,ACTORS.executive);assert.ok(f.shifts.length>100);a.forecast.forEach((w,i)=>assert.equal(w.capacity,Math.round(shiftHours(f.shifts,a.filters.end+i*7*DAY_MS,a.filters.end+(i+1)*7*DAY_MS)/.8)));assert.equal(FilesystemAdapter.decode(FilesystemAdapter.encode(s)).facts.shifts.length,f.shifts.length);
});

test('section 5.3: churn and reprint indicators have explicit independently checked definitions',()=>{
 const s=fresh(),a=s.facts.orders[0],b=s.facts.orders[2];a.createdAt='2020-01-01T12:00:00+03:00';b.createdAt='2020-01-02T12:00:00+03:00';b.reprinted=true;assert.notEqual(a.customerId,b.customerId);const v=analytics(s,ACTORS.executive,{period:'custom',from:'2020-01-02',to:'2020-01-02'});assert.equal(v.churn,100);assert.equal(v.reprintCount,1);assert.equal(v.repeat,0);
});

test('OT-05: a stalled browser API request is bounded and returns a Russian retry message',async()=>{
 const {runInNewContext}=await import('node:vm');let timeout;
 const code=readFileSync(new URL('../client/app.js',import.meta.url),'utf8').replace(/^init\(\);$/m,'');
 const sandbox={URLSearchParams,crypto,location:{hash:''},document:{addEventListener(){},documentElement:{dataset:{theme:'dark'}}},window:{addEventListener(){}},setTimeout,clearTimeout,AbortSignal:{timeout(ms){timeout=ms;return {}; }},fetch:async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'});}};
 const request=runInNewContext(code+'\napi;',sandbox);await assert.rejects(request('/api/bootstrap'),/Сервер не ответил за 15 секунд.*Черновик сохранён/);assert.equal(timeout,15000);
});
