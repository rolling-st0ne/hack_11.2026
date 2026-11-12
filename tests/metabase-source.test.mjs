import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {runInNewContext} from 'node:vm';
import {ACTORS,createSeed} from '../server/seed.mjs';
import {normalizeSources} from '../server/adapters.mjs';
import {project,handleApi} from '../server/api.mjs';
import {syncMetabaseSnapshot,createMetabase} from '../server/metabase.mjs';
import {metricQuery,METABASE_METRICS,applyMetabaseResult,markMetabaseUnavailable} from '../server/metabase-query.mjs';

function execute(dir,params){
 const db=new DatabaseSync(join(dir,'analytics.sqlite'),{readOnly:true});
 try{
  const rows=db.prepare(metricQuery.replace(/{{(\w+)}}/g,(_,key)=>'$'+key)).all(Object.fromEntries(Object.entries(params).map(([k,v])=>['$'+k,v])));
  const names=Object.keys(rows[0]);
  return {status:'completed',data:{cols:names.map(name=>({name})),rows:rows.map(row=>names.map(name=>row[name]))}};
 }finally{db.close();}
}
function parameters(view,actor){const f=view.filters;return {start:f.start,end:f.end,buckets:f.days===1?8:Math.min(f.days,28),scope:actor.departments.join(','),department:f.department,product:f.product,market:f.market,region:f.region};}
const provenance={dataset:'Фотопринт · демозаказы',upstream:'Filesystem / orders.csv',questionId:7,sourceUpdatedAt:'2026-11-12T00:00:00Z',snapshotAt:'2026-11-12T01:00:00Z',queriedAt:'2026-11-12T02:00:00Z'};

test('Metabase SQL matches scoped metrics, history and breakdowns for all roles and filters',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bi-query-'));
 try{
  const state=normalizeSources(createSeed());syncMetabaseSnapshot(dir,state);
  for(const actor of Object.values(ACTORS))for(const filters of [{period:'today'},{period:'week'},{period:'month',market:'BY'}, {period:'month',product:actor.departments.includes('books')?'book':'prints'}, {period:'custom',from:'2000-01-01',to:'2000-01-02'}, {period:'custom',from:'2026-01-01',to:'2026-12-31'}]){
   const expected=project(state,actor,filters),view=structuredClone(expected);
   applyMetabaseResult(view,execute(dir,parameters(view,actor)),provenance);
   for(const k of view.kpis){
    const before=expected.kpis.find(m=>m.id===k.id);
    if(!METABASE_METRICS.includes(k.id)){assert.deepEqual(k,before);continue;}
    assert.equal(k.raw,before.value==='—'?null:before.raw,actor.key+': '+k.id);
    assert.deepEqual(k.series,before.series,k.id+' series');assert.deepEqual(k.cumulativeSeries,before.cumulativeSeries,k.id+' cumulative');assert.deepEqual(k.previousSeries,before.previousSeries,k.id+' previous');
    for(const dimension of Object.keys(before.breakdowns))assert.deepEqual(k.breakdowns[dimension].map(r=>r.value),before.breakdowns[dimension].map(r=>r.value),k.id+' '+dimension);
    assert.equal(k.source,'Metabase');assert.equal(k.sourceInfo.questionId,7);
   }
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('bootstrap serves Metabase data and provenance on a LAN origin without exposing embed URLs or finance to restricted users',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bi-source-'));
 try{
  const state=normalizeSources(createSeed());state.sourceFingerprint='one';
  writeFileSync(join(dir,'config.json'),JSON.stringify({ready:true,metricCardId:7,url:'http://localhost:3001',secret:'test-only-secret'}));
  let calls=0,lastParams;
  const metabase=createMetabase(dir,{request:async url=>{
   calls++;const token=url.split('/').at(-2);lastParams=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).params;
   return new Response(JSON.stringify(execute(dir,lastParams)),{status:202});
  }});
  const store={read:async()=>state,update:async fn=>fn(state)};
  const auth={handle:async()=>null,authenticate:async()=>({role:'maxim',kind:'browser',expires:Date.now()+60000})};
  const req=()=>new Request('http://192.168.1.20:3000/api/bootstrap?period=week');
  let response=await handleApi(req(),store,{auth,metabase}),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.kpis.find(k=>k.id==='orders').source,'Metabase');assert.equal(body.kpis.find(k=>k.id==='orders').sourceInfo.status,'ok');assert.equal(lastParams.scope,'photo');
  assert.ok(!body.kpis.some(k=>k.id==='revenue'));assert.ok(!body.actor.pages.includes('bi'));
  assert.ok(!JSON.stringify(body).includes('localhost:3001'));assert.ok(!JSON.stringify(body).includes('test-only-secret'));assert.ok(!JSON.stringify(body).includes('/embed/'));
  await handleApi(req(),store,{auth,metabase});assert.equal(calls,1);
  state.sourceFingerprint='two';await handleApi(req(),store,{auth,metabase});assert.equal(calls,2);
  const failed=createMetabase(dir,{request:async()=>new Response('Unavailable',{status:503})});
  body=await (await handleApi(req(),store,{auth,metabase:failed})).json();
  const orders=body.kpis.find(k=>k.id==='orders');assert.equal(orders.raw,null);assert.equal(orders.sourceInfo.status,'unavailable');
  assert.ok(body.kpis.find(k=>k.id==='customers').raw>0);assert.equal(body.connectors.find(c=>c.id==='metabase').status,'error');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('ordinary dashboard cards and metric details show source; no dedicated BI page or localhost dependency remains',()=>{
 const state=normalizeSources(createSeed()),view=project(state,ACTORS.executive);
 markMetabaseUnavailable(view,provenance);
 const source=readFileSync(new URL('../client/app.js',import.meta.url),'utf8').replace(/^init\(\);$/m,'');
 const result=runInNewContext(source+`\ndata=bootstrap;const output=[];showDialog=html=>output.push(html);openMetric('revenue');({card:metricCard(metric('revenue')),detail:output[0],overview:overview(),pages:Object.keys(pageNames)});`,{bootstrap:view,console,URLSearchParams,crypto,location:{hash:''},document:{addEventListener(){},documentElement:{dataset:{theme:'dark'}}},window:{addEventListener(){}},setTimeout,clearTimeout});
 assert.ok(result.card.includes('Metabase'));assert.ok(result.overview.includes('Metabase'));assert.ok(result.detail.includes('Источник: Metabase'));
 assert.ok(result.detail.includes('Источник недоступен'));assert.ok(!result.detail.includes('undefined'));assert.ok(!result.pages.includes('bi'));
 assert.ok(!source.includes('loadMetabase'));assert.ok(!source.includes('localhost:3000/#bi'));assert.ok(!source.includes('<iframe'));
});
