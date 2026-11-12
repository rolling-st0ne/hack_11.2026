import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {handleApi,project} from '../server/api.mjs';
import {createSeed,ACTORS} from '../server/seed.mjs';
import {normalizeSources} from '../server/adapters.mjs';
import {canViewMetabase,syncMetabaseSnapshot,createMetabase} from '../server/metabase.mjs';

test('BI requires a personal browser session and company-wide data access',async()=>{
 const state=normalizeSources(createSeed()),store={read:async()=>state,update:async fn=>fn(state)};let calls=0;
 const metabase={available:canViewMetabase,embed:async(s,actor,filters)=>{calls++;return {actor:actor.key,filters};}};
 const req=path=>new Request('http://localhost:3000'+path);
 assert.equal((await handleApi(req('/api/metabase/embed'),store,{metabase})).status,401);
 for(const role of Object.keys(ACTORS)){
  const auth={handle:async()=>null,authenticate:async()=>({role,kind:'browser',expires:Date.now()+60000})};
  const response=await handleApi(req('/api/metabase/embed?period=custom&from=2026-01-01&to=2026-01-02&market=BY'),store,{auth,metabase});
  assert.equal(response.status,['executive','analyst'].includes(role)?200:403,role);
  if(response.ok){const body=await response.json();assert.equal(body.filters.market,'BY');assert.equal(new Date(body.filters.start).toISOString(),'2025-12-31T21:00:00.000Z');}
 }
 assert.equal(calls,2);
 const auth={handle:async()=>null,authenticate:async()=>({role:'executive',kind:'agent',expires:Date.now()+60000})};
 assert.equal((await handleApi(req('/api/metabase/embed'),store,{auth,metabase})).status,403);
 auth.authenticate=async()=>({role:'executive',kind:'browser',expires:Date.now()+60000});
 assert.equal((await handleApi(req('/api/metabase/embed?market=invalid'),store,{auth,metabase})).status,400);
 assert.equal(calls,2);
});

test('Metabase snapshot refreshes changed facts without copying credentials or customer data',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fotoprint-bi-'));
 try{
  const state=normalizeSources(createSeed());state.sourceFingerprint='one';
  const original=syncMetabaseSnapshot(dir,state);
  const db=new DatabaseSync(join(dir,'analytics.sqlite'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM orders').get().n,state.facts.orders.length);
  const columns=db.prepare('PRAGMA table_info(orders)').all().map(c=>c.name);
  assert.ok(!columns.includes('customerId'));assert.ok(!columns.includes('password'));
  assert.equal(syncMetabaseSnapshot(dir,state).synced_at,original.synced_at);
  state.sourceFingerprint='two';state.facts.orders[0].revenue+=123;
  syncMetabaseSnapshot(dir,state);
  assert.equal(db.prepare('SELECT revenue FROM orders WHERE id=?').get(state.facts.orders[0].id).revenue,state.facts.orders[0].revenue);
  db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('container snapshot volume is separate from Metabase credentials and app data',async()=>{
 const configDir=mkdtempSync(join(tmpdir(),'bi-private-')),snapshotDir=mkdtempSync(join(tmpdir(),'bi-shared-'));
 try{
  writeFileSync(join(configDir,'config.json'),JSON.stringify({ready:true,metricCardId:7,url:'http://metabase:3000',secret:'private-test-signing-key'}));
  const state=normalizeSources(createSeed());state.sourceFingerprint='separate-volume';
  const metabase=createMetabase(configDir,{snapshotDirectory:snapshotDir,request:async()=>new Response('Unavailable',{status:503})});
  await metabase.enrich(state,ACTORS.executive,project(state,ACTORS.executive));
  assert.equal(existsSync(join(snapshotDir,'analytics.sqlite')),true);
  assert.equal(existsSync(join(configDir,'analytics.sqlite')),false);
  assert.deepEqual(readdirSync(snapshotDir),['analytics.sqlite']);
  const db=new DatabaseSync(join(snapshotDir,'analytics.sqlite'),{readOnly:true});
  assert.equal(db.prepare('SELECT count(*) AS n FROM orders').get().n,1800);db.close();
 }finally{rmSync(configDir,{recursive:true,force:true});rmSync(snapshotDir,{recursive:true,force:true});}
});
