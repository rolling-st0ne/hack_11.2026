import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=mkdtempSync(resolve(tmpdir(),'contour-clean-audit-'));
const env={...process.env,CONTOUR_BI:'off',API_PORT:'18180',PORT:'13100',CLIENT_HOST:'127.0.0.1',CONTOUR_FILES:resolve(dir,'files'),CONTOUR_AUTH:resolve(dir,'auth')};
const base='http://127.0.0.1:13100',started=Date.now();let api,client,cookie='',csrf='',logs='';const report={};
function launch(file){const child=spawn(process.execPath,[file],{cwd:root,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);return child;}
async function stop(child){if(!child||child.exitCode!==null)return;await new Promise(r=>{child.once('exit',r);child.kill('SIGTERM');setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');},2000).unref();});}
async function ready(){for(let i=0;i<150;i++){try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)});if(r.status===200)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Readiness failed: '+logs);}
async function call(path,method='GET',body){const r=await fetch(base+path,{method,headers:{cookie,origin:base,'x-csrf-token':csrf,'content-type':'application/json','idempotency-key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();if(value.csrf)csrf=value.csrf;return {status:r.status,body:value};}
try{
 api=launch('server/server.mjs');client=launch('client/dev-server.mjs');await ready();report.readyMs=Date.now()-started;
 const credentials=Object.fromEntries([...readFileSync(resolve(dir,'auth/ACCESS.txt'),'utf8').matchAll(/Логин: (.+)\nПароль: (.+)/g)].map(m=>[m[1],m[2]]));
 for(const role of ['maxim','executive']){assert.equal((await call('/api/auth/login','POST',{username:role,password:credentials[role]})).status,200);const view=await call('/api/bootstrap');assert.equal(view.status,200);report[role]={actor:view.body.actor.id,kpis:view.body.kpis.length,departments:view.body.departments.map(d=>d.id)};if(role==='maxim')assert.equal((await call('/api/bootstrap?department=books')).status,403);}
 let r=await call('/api/tasks','POST',{title:'Контрольная проверка очереди',description:'Назначить ресурс и проверить результат',impact:'Сократить просроченные заказы',owner:'mikhail',dueAt:new Date(Date.now()+3600000).toISOString(),signalId:'SIG-1042',priority:'high'});assert.equal(r.status,200);const id=r.body.task.id;
 assert.equal((await call(`/api/tasks/${id}/status`,'PATCH',{status:'in_progress'})).status,200);
 assert.equal((await call(`/api/tasks/${id}/status`,'PATCH',{status:'review',note:'Ресурс выделен; результат проверяется по данным'})).status,200);
 r=await call(`/api/tasks/${id}/verify`,'POST',{scenario:'unchanged'});assert.equal(r.body.check.passed,false);
 r=await call(`/api/tasks/${id}/verify`,'POST',{scenario:'recovered'});assert.equal(r.body.check.passed,true);assert.equal(r.body.task.status,'done');report.flow={taskId:id,status:'done',checkValue:r.body.check.value};
 await stop(api);api=launch('server/server.mjs');await ready();const rebooted=(await call('/api/bootstrap')).body;assert.equal(rebooted.tasks.find(t=>t.id===id).status,'done');assert.ok(rebooted.audit.some(a=>a.object===id));report.persistenceAfterRestart=true;report.totalMs=Date.now()-started;report.uiTest=false;report.metabaseTest=false;console.log(JSON.stringify(report,null,2));
}finally{await stop(client);await stop(api);rmSync(dir,{recursive:true,force:true});}
