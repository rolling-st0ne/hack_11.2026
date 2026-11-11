import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createSeed,ACTORS} from '../src/seed.mjs';
import {normalizeSources} from '../src/adapters.mjs';
import {handleApi} from '../src/api.mjs';
test('all role pages and metric detail charts render without runtime errors',async()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^init\(\);$/m,'');
 for(const role of Object.keys(ACTORS)){
  const state=normalizeSources(createSeed());state.sessions.test={role,expires:Date.now()+10000};
  const response=await handleApi(new Request('http://localhost/api/bootstrap',{headers:{cookie:'contour_session=test'}}),{read:async()=>state});const bootstrap=await response.json();
  const context={bootstrap,console,URLSearchParams,crypto,location:{hash:''},document:{addEventListener(){},documentElement:{dataset:{theme:'dark'}}},window:{addEventListener(){}},setTimeout,clearTimeout};
  const results=runInNewContext(source+`\ndata=bootstrap;({pages:data.actor.pages.map(id=>{page=id;return renderPage();}),charts:data.kpis.map(k=>metricDetailChart(k))});`,context);
  for(const html of [...results.pages,...results.charts]){assert.equal(typeof html,'string');assert.ok(!html.includes('NaN'),role);assert.ok(!html.includes('undefined'),role);}
 }
});
