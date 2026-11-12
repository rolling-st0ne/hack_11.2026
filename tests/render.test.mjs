import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createSeed,ACTORS} from '../server/seed.mjs';
import {normalizeSources} from '../server/adapters.mjs';
import {handleApi} from '../server/api.mjs';
test('all role pages and metric detail charts render without runtime errors',async()=>{
 const source=readFileSync(new URL('../client/app.js',import.meta.url),'utf8').replace(/^init\(\);$/m,'');
 for(const role of Object.keys(ACTORS)){
  const state=normalizeSources(createSeed());state.sessions.test={role,expires:Date.now()+10000};
  const response=await handleApi(new Request('http://localhost/api/bootstrap',{headers:{cookie:'contour_session=test'}}),{read:async()=>state});const bootstrap=await response.json();
  const context={bootstrap,console,URLSearchParams,crypto,location:{hash:''},document:{addEventListener(){},documentElement:{dataset:{theme:'dark'}}},window:{addEventListener(){}},setTimeout,clearTimeout};
  const results=runInNewContext(source+`\ndata=bootstrap;({pages:data.actor.pages.map(id=>{page=id;return renderPage();}),charts:data.kpis.map(k=>metricDetailChart(k))});`,context);
  for(const html of [...results.pages,...results.charts]){assert.equal(typeof html,'string');assert.ok(!html.includes('NaN'),role);assert.ok(!html.includes('undefined'),role);}
 }
});

test('authenticated metric, layout and proposal interfaces render custom formulas without missing data',async()=>{
 const {project}=await import('../server/api.mjs');const {previewMetric}=await import('../server/metric-config.mjs');
 const state=normalizeSources(createSeed()),actor=ACTORS.executive;
 const definition={id:'custom_preview',label:'P90 исполнения',source:'orders',expression:{op:'percentile',field:'leadHours',p:90},unit:'hours',scope:{type:'company'},target:40,better:'lower',description:'Проверка'};
 state.metricDefinitions.push({...definition,version:1,ownerId:actor.id,ownerName:actor.name});
 const bootstrap=project(state,actor),preview=previewMetric(state,actor,definition),proposal={id:'review-test',kind:'metric',operation:'metric',payload:definition,preview,baseVersion:0,status:'pending',author:'agent',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+10000).toISOString()};
 const source=readFileSync(new URL('../client/app.js',import.meta.url),'utf8').replace(/^init\(\);$/m,'');
 const outputs=await runInNewContext(source+`\ndata=bootstrap;secureAuth=true;fromDate=data.filters.from;toDate=data.filters.to;const output=[];showDialog=html=>{output.push(html);return {};};api=async()=>({proposal,canConfirm:true,confirmationToken:'test'});(async()=>{openMetric('custom_preview');openDashboardEditor();await openProposal('review-test');return output;})()`,{bootstrap,proposal,console,URLSearchParams,crypto,location:{hash:''},document:{addEventListener(){},documentElement:{dataset:{theme:'dark'}}},window:{addEventListener(){}},setTimeout,clearTimeout});
 for(const html of outputs){assert.ok(!html.includes('undefined'));assert.ok(!html.includes('NaN'));}
 assert.ok(outputs[2].includes('Подтверждаю изменение'));assert.ok(outputs[0].includes('P90'));
});
