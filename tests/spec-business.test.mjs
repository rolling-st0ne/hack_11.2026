import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {analytics} from '../server/analytics.mjs';
import {project} from '../server/api.mjs';
import {ACTORS} from '../server/seed.mjs';
import {normalizeSources,FilesystemAdapter} from '../server/adapters.mjs';
const range={period:'custom',from:'2026-01-10',to:'2026-01-10'},at=(day,hour=12)=>`2026-01-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:00:00+03:00`;
const k=(a,id)=>a.kpis.find(k=>k.id===id);
function base(){const generatedAt=at(12);return normalizeSources({lastUpdated:generatedAt,sessions:{},idempotency:{},orders:[],tasks:[],signals:[],audit:[],checks:[],connectors:[],facts:{generatedAt,sourceUpdatedAt:generatedAt,reportingVersion:4,semanticVersion:1,sourcePresence:{leads:true,production_jobs:true,production_work:true,downtime:true},capacityCoverage:{from:at(1,0),to:at(31,0)},orders:[],customers:[{id:'C1',createdAt:at(1),segment:'b2c',channel:'Сайт'},{id:'C2',createdAt:at(10,8),segment:'b2b',channel:'CRM'}],interactions:[],employees:[{id:'mikhail',department:'books',name:'Тестовый сотрудник',isAgent:false}],responses:[],reviews:[],financeEntries:[],performance:[],staff:[{department:'books',planned:10,actual:8,absent:1,openVacancies:2,availableHours:40,leads:1000}],shifts:[{id:'SHIFT',department:'books',startsAt:at(10,9),endsAt:at(10,17),planned:10,actual:8,absent:1,availableHours:40,plannedUnits:100,productMix:{book:1}}],leads:[],productionJobs:[],productionWork:[],downtime:[]}});}
function order(id,overrides={}){return {id,customerId:'C1',productId:'book',department:'books',market:'BY',regionId:'BY-HM',managerId:'mikhail',channel:'Сайт',createdAt:at(1),stage:7,units:10,revenue:100,cost:60,currency:'BYN',completed:true,completedAt:at(10),promisedAt:at(11),onTime:true,defect:false,reprinted:false,leadHours:999,downtimeMinutes:999,moderationQueuedAt:at(1),moderatedAt:at(2),paymentStatus:'paid',financeStatus:'paid',...overrides};}
function job(id,orderId,overrides={}){return {id,orderId,queuedAt:at(8),startedAt:at(9),completedAt:at(10),cancelledAt:null,producedUnits:10,defectiveUnits:0,goodUnits:10,reprintUnits:0,...overrides};}
const analyze=s=>analytics(s,ACTORS.executive,range);
function render(s,page,extra=''){const bootstrap=project(s,ACTORS.executive,range),code=readFileSync(new URL('../client/app.js',import.meta.url),'utf8').replace(/^init\(\);$/m,'');return runInNewContext(code+`\ndata=bootstrap;page=${JSON.stringify(page)};${extra};renderPage();`,{bootstrap,crypto,URLSearchParams,location:{hash:''},document:{addEventListener(){},documentElement:{dataset:{theme:'dark'}}},window:{addEventListener(){}},setTimeout,clearTimeout});}

test('5.3 sales: 10 actual leads, 6 qualified, 4 quoted, 2 wins mean 20%; sales plan cannot change conversion',()=>{
 const s=base();s.facts.orders=[order('O1',{createdAt:at(10,13)}),order('O2',{createdAt:at(10,13),customerId:'C2'})];
 s.facts.leads=Array.from({length:10},(_,i)=>({id:'L'+i,customerId:i===1?'C2':'C1',department:'books',productId:'book',market:'BY',regionId:'BY-HM',channel:'Сайт',createdAt:at(10,9),qualifiedAt:i<6?at(10,10):null,quotedAt:i<4?at(10,11):null,convertedAt:i<2?at(10,13):null,lostAt:null,orderId:i<2?'O'+(i+1):null}));
 assert.deepEqual(analyze(s).leadFunnel,[10,6,4,2]);assert.equal(k(analyze(s),'conversion').raw,20);
 s.facts.staff[0].leads=999999;s.facts.orders.push(order('O3',{createdAt:at(10,15)}));assert.equal(k(analyze(s),'conversion').raw,20);
 s.facts.leads[1].convertedAt=at(11,0);assert.deepEqual(analyze(s).leadFunnel,[10,6,4,1]);assert.equal(k(analyze(s),'conversion').raw,10);
});
test('5.3 money and clients: independent 400 BYN turnover, 40% margin, 200 BYN check, 2 active and 1 registered client',()=>{
 const s=base();s.facts.orders=[order('O1',{createdAt:at(10,9),revenue:100,cost:60}),order('O2',{createdAt:at(10,10),customerId:'C2',revenue:300,cost:180})];const a=analyze(s);assert.equal(k(a,'revenue').raw,400);assert.equal(k(a,'margin').raw,40);assert.equal(a.averageCheck,200);assert.equal(k(a,'customers').raw,2);assert.equal(k(a,'newCustomers').raw,1);
 s.facts.orders.forEach(o=>o.revenue=0);assert.equal(k(analyze(s),'margin').raw,null);
});
test('5.3 repeat includes earlier purchases outside period; churn compares actual customer cohorts',()=>{
 const s=base();s.facts.orders=[order('OLD',{createdAt:at(9)}),order('A',{createdAt:at(10)}),order('B',{createdAt:at(10),customerId:'C2'})];assert.equal(analyze(s).repeat,50);assert.equal(analyze(s).churn,0);
 s.facts.customers.push({id:'C3',createdAt:at(1),segment:'b2c',channel:'Сайт'});s.facts.orders.push(order('OLD-C',{createdAt:at(9),customerId:'C3'}));assert.equal(analyze(s).churn,50);
});
test('5.3 production: plan 80+20, output by production date, finished-cycle mean 36h; order creation and leadHours cannot substitute',()=>{
 const s=base();s.facts.orders=[order('OLD'),order('NEW',{createdAt:at(9)}),order('LATER',{createdAt:at(10)})];
 s.facts.shifts[0].plannedUnits=80;s.facts.shifts.push({...s.facts.shifts[0],id:'S2',plannedUnits:20,availableHours:0});
 s.facts.productionJobs=[job('J1','OLD',{goodUnits:80,producedUnits:80}),job('J2','NEW',{queuedAt:at(9),goodUnits:20,producedUnits:20}),job('J3','LATER',{queuedAt:at(10),startedAt:at(11),completedAt:at(12),goodUnits:500,producedUnits:500})];
 let a=analyze(s);assert.equal(a.productionPlan,100);assert.equal(a.productionFact,100);assert.equal(k(a,'leadTime').raw,36);assert.equal(a.totals.orders,1);
 s.facts.shifts[0].plannedUnits=120;a=analyze(s);assert.equal(a.productionPlan,140);assert.equal(a.productionFact,100);
 s.facts.shifts[0].availableHours=400;assert.equal(analyze(s).productionPlan,140);
 s.facts.productionJobs[1].completedAt=at(11);a=analyze(s);assert.equal(a.productionFact,80);assert.equal(k(a,'leadTime').raw,48);
});
test('5.3 production queue includes old unstarted jobs; running, completed and cancelled jobs are separate',()=>{
 const s=base();s.facts.orders=['O1','O2','O3','O4'].map(id=>order(id));s.facts.productionJobs=[job('WAIT','O1',{queuedAt:at(2),startedAt:null,completedAt:null,goodUnits:0,producedUnits:0}),job('RUN','O2',{completedAt:null,goodUnits:0,producedUnits:0}),job('DONE','O3'),job('CANCEL','O4',{startedAt:null,completedAt:null,cancelledAt:at(9),goodUnits:0,producedUnits:0})];
 const a=analyze(s);assert.equal(a.productionQueue,1);assert.equal(a.workInProgress,1);assert.equal(k(a,'queue').raw,1);assert.deepEqual(a.productionQueueRows.map(j=>j.id),['WAIT']);
});
test('5.3 utilization uses measured hours, downtime uses interval overlap; new orders do not create machine activity',()=>{
 const s=base();s.facts.orders=[order('O1')];s.facts.productionJobs=[job('J1','O1')];s.facts.productionWork=[{id:'W',jobId:'J1',orderId:'O1',startedAt:at(10,9),endedAt:at(10,17),machineHours:20}];s.facts.downtime=[{id:'D1',department:'books',productId:'book',machineId:'M',startedAt:'2026-01-09T23:30:00+03:00',endedAt:'2026-01-10T00:30:00+03:00',reason:'Тест'},{id:'D2',department:'books',productId:'book',machineId:'M',startedAt:at(10,12),endedAt:at(10,13),reason:'Тест'}];
 let a=analyze(s);assert.equal(k(a,'production').raw,50);assert.equal(a.downtime,90);
 s.facts.orders.push(order('UNSTARTED',{createdAt:at(10,15),completed:false,completedAt:null,units:10000,downtimeMinutes:10000}));a=analyze(s);assert.equal(k(a,'production').raw,50);assert.equal(a.downtime,90);
 s.facts.productionWork[0]={...s.facts.productionWork[0],startedAt:at(9,23),endedAt:at(10,1),machineHours:2};assert.equal(analyze(s).machineHours,1);
});
test('5.3 quality uses completed production samples; registered reprints are independent of order defect flags',()=>{
 const s=base();s.facts.orders=[order('O1'),order('O2')];s.facts.productionJobs=[job('J1','O1',{producedUnits:10,defectiveUnits:2,goodUnits:8,reprintUnits:1}),job('J2','O2',{producedUnits:20,defectiveUnits:0,goodUnits:20,reprintUnits:3})];let a=analyze(s);assert.equal(k(a,'defects').raw,6.7);assert.equal(a.reprintCount,4);assert.equal(a.productionFact,28);s.facts.orders.forEach(o=>{o.defect=true;o.reprinted=false;});assert.equal(k(analyze(s),'defects').raw,6.7);assert.equal(analyze(s).reprintCount,4);
});
test('5.3 on-time orders use delivery dates and promised dates, not creation cohort or a precomputed flag',()=>{
 const s=base();s.facts.orders=[order('EARLY',{createdAt:at(1),completedAt:at(10,11),promisedAt:at(10,12),onTime:false}),order('LATE',{createdAt:at(2),completedAt:at(10,13),promisedAt:at(10,12),onTime:true}),order('FUTURE',{createdAt:at(10),completedAt:at(11),promisedAt:at(12)})];assert.equal(k(analyze(s),'delivery').raw,50);s.facts.orders[0].completedAt=at(11);assert.equal(k(analyze(s),'delivery').raw,0);
});
test('5.3 SLA excludes waiting-within-deadline; missing answer never counts as a timely answer',()=>{
 const s=base();s.facts.orders=[order('O1')];s.facts.sourceTimes['interactions.csv']=at(10,17);
 s.facts.interactions=[{id:'T1',firstReplyMinutes:10,createdAt:at(10,10)},{id:'T2',firstReplyMinutes:20,createdAt:at(10,11)},{id:'T3',firstReplyMinutes:null,createdAt:at(10,12)},{id:'T4',firstReplyMinutes:null,createdAt:'2026-01-10T16:55:00+03:00'}].map(t=>({...t,orderId:'O1',customerId:'C1',department:'books',employeeId:'mikhail',topic:'Тест',channel:'Чат',status:'open'}));let a=analyze(s);assert.equal(k(a,'support').raw,33.3);assert.equal(k(a,'support').sampleSize,3);assert.equal(k(a,'responseTime').raw,15);assert.equal(a.employeeStats.people[0].topics[0].response.mean,15);
});
test('source presence survives CSV: deliberately empty activity is zero; missing legacy source remains unknown',()=>{
 const s=base();let a=analyze(s);assert.equal(a.machineHours,0);assert.equal(k(a,'production').raw,0);assert.deepEqual(a.leadFunnel,[0,0,0,0]);s.facts.sourcePresence.production_work=false;assert.equal(analyze(s).machineHours,null);const restored=FilesystemAdapter.decode(FilesystemAdapter.encode(s));assert.equal(restored.facts.sourcePresence.production_work,false);assert.equal(analyze(restored).machineHours,null);
});
test('resources have no invented market/channel allocations and known empty schedule days have zero plan',()=>{
 const s=base();s.facts.orders=[order('O1')];s.facts.downtime=[{id:'D',department:'books',productId:'book',machineId:'M',startedAt:at(10,10),endedAt:at(10,11),reason:'Тест'}];let a=analyze(s);assert.deepEqual(k(a,'downtime').breakdowns.market,[]);assert.deepEqual(k(a,'team').breakdowns.channel,[]);a=analytics(s,ACTORS.executive,{...range,market:'BY'});assert.equal(a.productionPlan,null);assert.equal(a.downtime,null);assert.equal(a.finance.actual,null);assert.equal(analytics(s,ACTORS.executive,{period:'custom',from:'2026-01-11',to:'2026-01-11'}).productionPlan,0);
});
test('5.3 registry has no hidden weekly cutoff, has explicit filters and full object history',()=>{
 const s=base();s.tasks=[{id:'OLD-TASK',owner:'mikhail',department:'books',title:'Старое открытое решение',problem:'Тест',cause:'Тест',impact:'Тест',dueAt:at(9),createdAt:'2020-01-01T00:00:00Z',status:'new'}];s.audit=Array.from({length:300},(_,i)=>({id:'A'+i,object:'OTHER',actor:'elena',at:at(10),result:'Другое'}));s.audit.push({id:'OLD-AUDIT',object:'OLD-TASK',actor:'elena',at:at(1),result:'Создано старое решение'});const v=project(s,ACTORS.executive,range);assert.equal(v.tasks.length,1);assert.equal(v.tasks[0].history[0].id,'OLD-AUDIT');const page=render(s,'decisions');assert.match(page,/OLD-TASK/);assert.match(page,/task-owner-filter/);assert.match(page,/task-date-from/);assert.ok(!render(s,'decisions',"taskFrom='2026-01-01'").includes('OLD-TASK'));
});
test('all five required screens expose their required indicators; missing forecast cannot claim capacity is sufficient',()=>{
 const s=base();s.facts.orders=[order('O1',{createdAt:at(10)})];for(const [page,labels] of Object.entries({overview:['Пульс компании','Оборот','Валовая маржа','Критические отклонения'],sales:['Воронка фактических лидов','Конверсия','Средний чек','Повторная покупка','отток','Каналы','сегменты'],production:['Производство и качество','План и факт выпуска','Очередь производства','Lead time','Простои','Перепечатка'],finance:['БДР','БДДС','Себестоимость','Фактический штат','Вакансии','Отсутствуют'],decisions:['Реестр решений','Ответственный','Статус','Создано с']})){const html=render(s,page);for(const text of labels)assert.ok(html.toLowerCase().includes(text.toLowerCase()),page+': '+text);assert.ok(!html.includes('NaN'),page);assert.ok(!html.includes('undefined'),page);}
 const html=render(s,'production');assert.match(html,/Недостаточно данных/);assert.ok(!html.includes('Мощностей достаточно'));assert.ok(!html.includes('Лиды · демоплан'));
});
test('new business detail fields obey role capabilities; production manager receives required production KPIs',()=>{
 const s=base();const op=project(s,ACTORS.operator,range);assert.equal(op.leadFunnel,null);assert.deepEqual(op.leadRows,[]);assert.deepEqual(op.productionQueueRows,[]);const manager=project(s,ACTORS.sergey,range);for(const id of ['output','queue','reprint','downtime'])assert.ok(manager.kpis.some(k=>k.id===id),id);
});
