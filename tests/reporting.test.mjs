import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSeed,ACTORS} from '../server/seed.mjs';
import {analytics} from '../server/analytics.mjs';
import {quantile,reportingWindow,workingTime} from '../server/reporting.mjs';
import {normalizeSources,FilesystemAdapter} from '../server/adapters.mjs';
import {handleApi} from '../server/api.mjs';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createFilesystemStore,readCsvDirectory} from '../server/filesystem-store.mjs';
import {parseCsv,writeCsv} from '../server/csv.mjs';
import {runInNewContext} from 'node:vm';
const metric=(a,id)=>a.kpis.find(k=>k.id===id);
function client(state,role='executive'){
 state.sessions.qa={role,expires:Date.now()+3600000};const store={read:async()=>structuredClone(state),update:async fn=>fn(state)};
 return async(path,method='GET',body)=>{const r=await handleApi(new Request('http://localhost'+path,{method,headers:{cookie:'contour_session=qa','idempotency-key':crypto.randomUUID(),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),store);return {status:r.status,body:await r.json()};};
}
test('custom calendar dates use Minsk timezone, validate dates, and exclude end boundary',()=>{
 const w=reportingWindow({period:'custom',from:'2026-11-01',to:'2026-11-02'});assert.equal(w.start,Date.parse('2026-10-31T21:00:00Z'));assert.equal(w.end,Date.parse('2026-11-02T21:00:00Z'));assert.equal(w.days,2);
 for(const q of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-11-03',to:'2026-11-02'},{from:'2025-01-01',to:'2026-11-01'}])assert.throws(()=>reportingWindow({period:'custom',...q}),RangeError);
 const s=normalizeSources(createSeed());s.facts.orders.slice(0,3).forEach((o,i)=>o.createdAt=['2026-10-31T20:59:59Z','2026-10-31T21:00:00Z','2026-11-02T21:00:00Z'][i]);
 const a=analytics(s,ACTORS.executive,{period:'custom',from:'2026-11-01',to:'2026-11-02'});assert.ok(!a.flow.some(o=>o.id===s.facts.orders[0].id));assert.ok(a.flow.some(o=>o.id===s.facts.orders[1].id));assert.ok(!a.flow.some(o=>o.id===s.facts.orders[2].id));
});
test('market and region filters reconcile cards, daily series, geography and staff',()=>{
 const s=normalizeSources(createSeed()),all=analytics(s,ACTORS.executive),by=analytics(s,ACTORS.executive,{market:'BY'}),ru=analytics(s,ACTORS.executive,{market:'RU'});
 assert.equal(by.totals.orders+ru.totals.orders,all.totals.orders);assert.equal(by.totals.tickets+ru.totals.tickets,all.totals.tickets);
 assert.equal(all.geography.length,90);assert.equal(by.geography.length,7);assert.equal(ru.geography.length,83);
 for(const a of [all,by,ru]){assert.equal(a.geography.reduce((n,r)=>n+r.orders,0),a.totals.orders);assert.equal(a.series.reduce((n,r)=>n+r.orders,0),a.totals.orders);assert.equal(a.employeeStats.people.reduce((n,p)=>n+p.orders,0),a.totals.orders);assert.equal([...a.employeeStats.people,...a.employeeStats.bots].reduce((n,p)=>n+p.tickets,0),a.totals.tickets);}
 const r=by.geography.find(r=>r.orders),one=analytics(s,ACTORS.executive,{market:'BY',region:r.id});assert.equal(one.totals.orders,r.orders);assert.ok(one.flow.every(o=>o.regionId===r.id));
});
test('known responses produce exact average, SLA, percentiles and topic statistics',()=>{
 const s=normalizeSources(createSeed()),o=s.facts.orders.find(o=>o.department==='photo'),dates=['2026-11-09T06:00:00Z','2026-11-09T07:00:00Z','2026-11-09T08:00:00Z','2026-11-09T09:00:00Z'];
 s.facts.interactions=[1,5,15,39].map((v,i)=>({id:'X'+i,orderId:o.id,customerId:o.customerId,department:'photo',createdAt:dates[i],firstReplyMinutes:v,employeeId:'daria',topic:'Макет',status:'resolved',botAssisted:false,handedOff:false}));
 s.facts.responses=s.facts.interactions.map(t=>({id:'R'+t.id,interactionId:t.id,orderId:o.id,employeeId:'daria',type:'first_reply',createdAt:new Date(Date.parse(t.createdAt)+t.firstReplyMinutes*60000).toISOString()}));
 const a=analytics(s,ACTORS.executive,{period:'custom',from:'2026-11-09',to:'2026-11-09'}),e=a.employeeStats.people.find(e=>e.id==='daria');
 assert.equal(metric(a,'support').raw,75);assert.equal(metric(a,'responseTime').raw,15);assert.deepEqual(e.response,{n:4,mean:15,p50:10,p90:31.8,p95:35.4});assert.equal(e.workingReplies,4);assert.equal(e.workingSla,75);assert.equal(e.topics[0].sla,75);assert.equal(e.types[0].count,4);
 assert.equal(quantile([], .9),null);assert.equal(quantile([5],.95),5);assert.equal(workingTime('2026-11-09T15:00:00Z'),false);assert.equal(workingTime('2026-11-08T10:00:00Z'),false);
});
test('review linkage survives snapshots, supports old-order details and rejects broken imports',async()=>{
 const s=normalizeSources(createSeed()),r=s.facts.reviews[0],req=client(s);const detail=await req('/api/orders/'+r.orderId);assert.equal(detail.status,200);assert.ok(detail.body.order.reviews.some(x=>x.id===r.id));assert.equal(detail.body.order.revenue,undefined);
 const csv=FilesystemAdapter.encode(s).files['reviews.csv'],parsed=parseCsv(csv);parsed.rows[0].orderId='missing';assert.throws(()=>FilesystemAdapter.import(s,'reviews.csv',writeCsv(parsed.rows)),/связи/);
 assert.equal(FilesystemAdapter.decode(FilesystemAdapter.encode(s)).facts.reviews[0].orderId,r.orderId);
});
test('server excludes foreign staff and private metrics, including direct order lookup',async()=>{
 for(const role of ['maxim','sergey','operator']){const s=normalizeSources(createSeed()),request=client(s,role),a=(await request('/api/bootstrap')).body;
 if(role==='operator'){assert.equal(a.employeeStats,null);assert.deepEqual(a.geography,[]);assert.ok(!a.actor.pages.includes('employees'));}else{assert.ok(a.actor.pages.includes('employees'));assert.ok(a.employeeStats.people.every(e=>ACTORS[role].departments.includes(e.department)));}
 const foreign=s.facts.orders.find(o=>!ACTORS[role].departments.includes(o.department));assert.equal((await request('/api/orders/'+foreign.id)).status,403);
 if(role!=='sergey')assert.equal((await request('/api/dashboard','POST',{metricIds:['revenue']})).status,403);
 }
});
test('dashboard selections persist by user and audit without changing data freshness',async()=>{
 const s=normalizeSources(createSeed()),fresh=s.facts.sourceUpdatedAt,req=client(s);assert.equal((await req('/api/dashboard','POST',{metricIds:['support','orders','reviewScore']})).status,200);
 const a=(await req('/api/bootstrap')).body;assert.deepEqual(a.dashboard.metrics.slice(0,3),['support','orders','reviewScore']);assert.ok(a.dashboard.required.every(id=>a.dashboard.metrics.includes(id)));assert.equal(metric(a,'support').sourceAt,fresh);assert.ok(s.audit.some(e=>e.action==='dashboard'));
 const restored=FilesystemAdapter.decode(FilesystemAdapter.encode(s));assert.deepEqual(restored.dashboardLayouts[0].metricIds,['support','orders','reviewScore']);assert.equal((await req('/api/dashboard','POST',{metricIds:[]})).status,400);assert.equal((await req('/api/dashboard','POST',{metricIds:['orders','orders']})).status,400);
 const m=client(s,'maxim');assert.notDeepEqual((await m('/api/bootstrap')).body.dashboard.metrics,['support','orders','reviewScore']);
});
test('invalid filters are clear 400 errors, empty periods have no fictitious SLA or ratings',async()=>{
 const s=normalizeSources(createSeed()),req=client(s);for(const query of ['period=custom&from=oops&to=2026-11-01','market=US','market=BY&region=RU-MOW'])assert.equal((await req('/api/bootstrap?'+query)).status,400);
 const a=(await req('/api/bootstrap?period=custom&from=2020-01-01&to=2020-01-01')).body;assert.equal(a.totals.orders,0);for(const id of ['support','responseTime','reviewScore','leadTime'])assert.equal(metric(a,id).value,'—');assert.equal(a.employeeStats.summary.sla,null);assert.equal(a.employeeStats.summary.response.p95,null);
});
test('metric dialogs, staff details and dashboard editor render for every allowed role',async()=>{
 const source=readFileSync(new URL('../client/app.js',import.meta.url),'utf8').replace(/^init\(\);$/m,'');
 for(const role of Object.keys(ACTORS)){const s=normalizeSources(createSeed()),bootstrap=(await client(s,role)('/api/bootstrap')).body;
 const html=runInNewContext(source+`\ndata=bootstrap;fromDate=data.filters.from;toDate=data.filters.to;const outputs=[];showDialog=(html)=>{outputs.push(html);return {};};data.kpis.forEach(k=>openMetric(k.id));if(data.employeeStats){[...data.employeeStats.people,...data.employeeStats.bots].forEach(e=>openEmployee(e.id));}openDashboardEditor();outputs;`,{bootstrap,console,URLSearchParams,crypto,location:{hash:''},document:{addEventListener(){},documentElement:{dataset:{theme:'dark'}}},window:{addEventListener(){}},setTimeout,clearTimeout});
 for(const output of html){assert.ok(!output.includes('undefined'),role);assert.ok(!output.includes('NaN'),role);}
 }
});

test('financial plans and facts come from ledger and reconciliation detects amount differences',()=>{
 const s=normalizeSources(createSeed()),o=s.facts.orders[0],entry=s.facts.financeEntries.find(e=>e.orderId===o.id);o.createdAt='2026-01-01T10:00:00Z';o.revenue=1000;o.cost=500;
 Object.assign(entry,{createdAt:o.createdAt,actualIncome:900,plannedIncome:1000,actualCost:550,plannedCost:500,actualInflow:450,plannedInflow:900,actualOutflow:200,plannedOutflow:400});
 const a=analytics(s,ACTORS.executive,{period:'custom',from:'2026-01-01',to:'2026-01-01'});
 assert.deepEqual(a.finance.bdr,{plan:1000,fact:900,index:90});assert.deepEqual(a.finance.bdrCost,{plan:500,fact:550,index:110});assert.deepEqual(a.finance.bdds,{plan:900,fact:450,index:50});assert.deepEqual(a.finance.bddsCost,{plan:400,fact:200,index:50});assert.equal(a.finance.reconciliation.mismatched,1);
 assert.equal(metric(a,'revenue').raw,1000);assert.equal(a.averageCheck,1000);assert.equal(a.finance.grossProfit,500);assert.equal(a.finance.currency,'BYN');
});
test('empty ratio buckets are gaps and current resource snapshots do not invent historical comparisons',()=>{
 const s=normalizeSources(createSeed()),a=analytics(s,ACTORS.executive,{period:'custom',from:'2020-01-01',to:'2020-01-07'});
 assert.ok(metric(a,'support').series.every(v=>v===null));assert.ok(metric(a,'support').previousSeries.every(v=>v===null));assert.equal(metric(a,'staffing').previous,null);assert.equal(metric(a,'staffing').delta,null);
});

test('signals and decisions follow linked order market, region and their own event date',async()=>{
 const s=normalizeSources(createSeed()),req=client(s),linked=s.facts.orders.find(o=>o.id===s.signals[0].orderId);
 s.tasks.push({id:'SLICE-TEST',owner:'mikhail',department:'books',orderId:linked.id,signalId:s.signals[0].id,status:'new',createdAt:s.signals[0].createdAt});
 const selected=(await req('/api/bootstrap?market='+linked.market+'&region='+linked.regionId)).body;
 assert.ok(selected.signals.some(x=>x.id===s.signals[0].id));assert.ok(selected.tasks.some(x=>x.id==='SLICE-TEST'));
 const other=(await req('/api/bootstrap?market='+(linked.market==='BY'?'RU':'BY'))).body;
 assert.ok(!other.signals.some(x=>x.id===s.signals[0].id));assert.ok(!other.tasks.some(x=>x.id==='SLICE-TEST'));
 const historical=(await req('/api/bootstrap?period=custom&from=2020-01-01&to=2020-01-02')).body;
 assert.equal(historical.signals.length,0);assert.equal(historical.tasks.length,0);
});

test('all managers retain the four-week forecast and director retains Mary comparison',async()=>{
 const source=readFileSync(new URL('../client/app.js',import.meta.url),'utf8').replace(/^init\(\);$/m,'');
 for(const role of ['executive','maxim','sergey']){
  const bootstrap=(await client(normalizeSources(createSeed()),role)('/api/bootstrap')).body;
  const html=runInNewContext(source+'\ndata=bootstrap;overview();',{bootstrap,console,URLSearchParams,crypto,location:{hash:''},document:{addEventListener(){},documentElement:{dataset:{theme:'dark'}}},window:{addEventListener(){}},setTimeout,clearTimeout});
  assert.match(html,/Прогноз на 4 недели/);if(role==='executive')assert.match(html,/×3/);
 }
});

test('analyst has a separate third-level read-only profile with source quality and finance',async()=>{
 const s=normalizeSources(createSeed()),req=client(s,'analyst'),a=(await req('/api/bootstrap')).body;
 assert.equal(a.actor.level,3);assert.equal(a.actor.role,'analyst');assert.ok(a.actor.pages.includes('integrations'));assert.equal(a.kpis.length,18);assert.equal(a.finance.currency,'BYN');assert.ok(a.qualityReport.reconciled);assert.equal(a.employeeStats,null);
 assert.equal((await req('/api/export')).status,200);assert.equal((await req('/api/files/finance_entries.csv')).status,200);
 for(const [path,method,body] of [['/api/tasks','POST',{}],['/api/tasks/DEC-021/status','PATCH',{status:'review',note:'Analyst must not execute'}],['/api/tasks/DEC-021/verify','POST',{scenario:'recovered'}],['/api/files/orders.csv','POST',{csv:'id\n1'}],['/api/integrations/filesystem/sync','POST',{}]])assert.equal((await req(path,method,body)).status,403,path);
 assert.equal((await req('/api/dashboard','POST',{metricIds:['revenue','orders']})).status,200);
});
