import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../drizzle/0000_contour.sql',import.meta.url),'utf8'));
const DB={prepare(sql){const stmt=sqlite.prepare(sql);let args=[];return {bind(...a){args=a;return this;},async first(){return stmt.get(...args);},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}};}};}};
let cookie='';
async function request(path,method='GET',body){const r=await worker.fetch(new Request('https://site.test'+path,{method,headers:{cookie,'content-type':'application/json','idempotency-key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})}),{DB});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;}
try{
 for(const path of ['/','/app.js','/styles.css','/favicon.svg'])assert.equal((await request(path)).status,200);
 assert.equal((await request('/api/bootstrap')).status,401);
 assert.equal((await request('/api/session','POST',{role:'executive'})).status,200);
 const all=await (await request('/api/bootstrap')).json();assert.equal(all.kpis.length,18);assert.equal(all.geography.length,90);assert.ok(all.employeeStats.people.length);
 const by=await (await request('/api/bootstrap?market=BY')).json();assert.equal(by.geography.length,7);assert.ok(by.orders.every(o=>o.market==='BY'));
 assert.equal((await request('/api/dashboard','POST',{metricIds:['orders','support']})).status,200);
 assert.deepEqual((await (await request('/api/bootstrap')).json()).dashboard.metrics.slice(0,2),['orders','support']);
 assert.equal((await request('/api/session','POST',{role:'operator'})).status,200);
 const op=await (await request('/api/bootstrap')).json();assert.equal(op.employeeStats,null);assert.equal(op.finance,null);assert.equal((await request('/api/files/finance_entries.csv')).status,403);
 console.log('Worker smoke passed: assets, authentication, 18 KPIs, markets, saved dashboard, server permissions.');
}finally{sqlite.close();}
