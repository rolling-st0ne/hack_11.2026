import { KPI, STAGES, canAccessDepartment, departmentOwner } from './seed.mjs';
import { REGIONS } from './regions.mjs';
import { enrichFacts, reportingWindow, staffReport, responseDistribution, DAY_MS, shiftHours, REPORTING_TZ, slaStatistics } from './reporting.mjs';
import {seedBusinessSources,businessContext,allocateShift} from './business.mjs';
import {inspectSources,sourceTime} from './data-contract.mjs';

export const DEPARTMENTS=[{id:'books',name:'Фотокниги'},{id:'photo',name:'Фотопечать'},{id:'gifts',name:'Фотосувениры'}];
export const PRODUCTS=[{id:'book',name:'Фотокнига',department:'books'},{id:'prints',name:'Фотографии',department:'photo'},{id:'canvas',name:'Холст',department:'gifts'},{id:'calendar',name:'Календарь',department:'gifts'},{id:'cards',name:'Открытки',department:'photo'}];
const sum=(rows,key)=>rows.reduce((n,o)=>n+(typeof key==='function'?key(o):o[key]),0);
const pct=(n,d)=>d?Math.round(n/d*1000)/10:null;
const fmt=v=>v==null?'—':Number.isInteger(v)?v.toLocaleString('ru-RU'):v.toLocaleString('ru-RU',{maximumFractionDigits:1});

export function generateFacts(now=Date.now()) {
  let seed=48271;const rand=()=>((seed=seed*16807%2147483647)-1)/2147483646;
  const customers=Array.from({length:360},(_,i)=>({id:'CUS-'+String(i+1).padStart(4,'0'),segment:i%4===0?'b2b':'b2c',channel:['Сайт','CRM','Партнёры'][i%3],createdAt:new Date(now-(i%70)*86400000).toISOString()}));
  const orders=Array.from({length:1800},(_,i)=>{
    const p=PRODUCTS[i%5],age=Math.floor(i/32.15),units=1+Math.floor(rand()*6),cost=20+Math.floor(rand()*180),stage=age<2?2+Math.floor(rand()*6):7;
    const inModeration=p.id==='book'&&i<235;
    const currentStage=inModeration?3:stage;
    return {id:'ORD-'+String(i+1).padStart(5,'0'),customerId:customers[(Math.floor(i/2)*7)%360].id,productId:p.id,department:p.department,channel:['Сайт','CRM','Партнёры'][i%3],createdAt:new Date(inModeration?now-(i%6)*3600000:now-age*86400000-(i%23)*3600000).toISOString(),stage:currentStage,units,revenue:cost*units,currency:'BYN',cost:Math.round(cost*units*(.62+rand()*.12)),completed:currentStage>=5,onTime:rand()>.075,defect:rand()<.018,moderationMinutes:20+Math.floor(rand()*150),leadHours:8+Math.floor(rand()*60),downtimeMinutes:Math.floor(rand()*8),paymentStatus:i%17===0?'pending':'paid',financeStatus:i%17===0?'pending':'paid',sourceEventId:'erp-order-'+i};
  });
  const interactions=Array.from({length:800},(_,i)=>({id:'INT-'+i,orderId:orders[i%orders.length].id,customerId:orders[i%orders.length].customerId,department:orders[i%orders.length].department,createdAt:new Date(now-(i%56)*86400000).toISOString(),firstReplyMinutes:i%19===0?null:i%13===0?24:3+i%12,channel:['Чат','Email','Телефон'][i%3],topic:['Сроки','Макет','Доставка','Возврат'][i%4],status:i%19===0?'open':i%5?'resolved':'open'}));
  for(const c of customers){const first=Math.min(...orders.filter(o=>o.customerId===c.id).map(o=>Date.parse(o.createdAt)));if(Number.isFinite(first))c.createdAt=new Date(Math.min(Date.parse(c.createdAt),first-86400000)).toISOString();}
  for(const o of orders){o.promisedAt=new Date(Date.parse(o.createdAt)+48*3600000).toISOString();o.completedAt=o.completed?new Date(Math.min(now,Date.parse(o.createdAt)+o.leadHours*3600000)).toISOString():null;if(o.completed)o.leadHours=Math.round((Date.parse(o.completedAt)-Date.parse(o.createdAt))/360000)/10;o.onTime=o.completed?Date.parse(o.completedAt)<=Date.parse(o.promisedAt):false;o.reprinted=o.defect&&o.completed;}
  for(const t of interactions){const o=orders.find(o=>o.id===t.orderId);t.createdAt=new Date(Math.max(Date.parse(t.createdAt),Date.parse(o.createdAt))).toISOString();}
  return seedBusinessSources(enrichFacts({generatedAt:new Date(now).toISOString(),customers,orders,interactions,staff:DEPARTMENTS.map((d,i)=>({department:d.id,planned:12+i*4,actual:10+i*4,absent:1,openVacancies:2,availableHours:180+i*60,leads:320+i*80}))}));
}

const METRIC_RULES={
 customers:['Уникальные customerId в заказах, созданных за период','orders.csv + customers.csv'],
 orders:['Количество уникальных orderId, созданных за период','orders.csv'],
 moderation:['Заказы, поступившие на модерацию до конца периода и ещё не прошедшие её на этот момент','orders.csv'],
 production:['Фактические занятые машино-часы production_work, пересекающие период / доступные часы смен × 100%','production_work.csv + production_jobs.csv + orders.csv + shifts.csv'],
 quality:['Годные единицы / все выпущенные единицы заданий, завершённых в периоде × 100%','production_jobs.csv + orders.csv'],
 support:['Первый ответ ≤ 15 мин / обращения периода с ответом либо истёкшим сроком SLA × 100%; ожидающие в пределах срока исключены','interactions.csv + orders.csv'],
 delivery:['Заказы, доставленные в периоде не позже promisedAt / все доставленные в периоде с известным сроком × 100%; дата доставки = completedAt','orders.csv'],
 team:['Σ actual по выбранным подразделениям × доля продукта; план = Σ planned × доля продукта','staff.csv'],
 revenue:['Σ revenue заказов выбранного периода, BYN. План = выручка предыдущего равного периода × 1,08','orders.csv'],
 margin:['(Σ revenue − Σ cost) / Σ revenue × 100%','orders.csv'],
 newCustomers:['Клиенты, зарегистрированные в периоде и связанные с разрешёнными заказами или лидами выбранного среза','customers.csv + orders.csv + leads.csv'],
 defects:['Дефектные единицы / все выпущенные единицы заданий, завершённых в периоде × 100%','production_jobs.csv + orders.csv'],
 repeat:['Покупатели периода, имеющие более раннюю покупку в выбранном срезе / активные покупатели периода × 100%','orders.csv + customers.csv'],
 conversion:['Фактические лиды, созданные в периоде и выигранные к его концу / все лиды когорты × 100%; выигрыш связан с orderId','leads.csv + orders.csv'],
 leadTime:['Среднее (completedAt − queuedAt) производственных заданий, завершённых в периоде; незавершённые исключены','production_jobs.csv + orders.csv'],
 staffing:['Σ actual / Σ planned × 100% в выбранных подразделениях','staff.csv'],
 responseTime:['Σ firstReplyMinutes / число обращений периода; перцентили по firstReplyMinutes','interactions.csv + orders.csv'],
 reviewScore:['Σ rating / число отзывов, созданных за период, по доступным заказам','reviews.csv + orders.csv'],
 output:['Σ goodUnits заданий по дате выпуска completedAt. План = Σ plannedUnits смен по дате endsAt; доля продукта применяется только к плану направления','production_jobs.csv + orders.csv + shifts.csv'],
 queue:['Задания, поставленные в производственную очередь до конца периода и ещё не начатые/отменённые/завершённые на эту дату','production_jobs.csv + orders.csv'],
 reprint:['Σ reprintUnits завершённых в периоде производственных заданий — зарегистрированные перепечатанные единицы','production_jobs.csv + orders.csv'],
 downtime:['Длительность пересечения интервалов простоя с периодом, минуты; выделенные линии продукта, без разбивки по рынку','downtime.csv']
};
const EXTRA_METRICS=[
 ['revenue','Оборот',' BYN','chart',null,'выручка заказов'],['margin','Валовая маржа','%','percent',32,'доля в обороте'],
 ['newCustomers','Новые клиенты','','userPlus',null,'в выбранном периоде'],['defects','Брак','%','scan',2,'цель не более 2%'],
 ['repeat','Повторная покупка','%','repeat',25,'доля повторных клиентов'],['conversion','Конверсия','%','filter',25,'из фактического лида в заказ'],
 ['leadTime','Lead time',' ч','clock',36,'цикл завершённых заданий'],['staffing','Обеспеченность','%','team',85,'ресурс смены'],
 ['responseTime','Время ответа',' мин','clock',15,'среднее · P50 / P90 / P95'],['reviewScore','Оценка клиентов',' / 5','shield',4.5,'отзывы к заказам'],
 ['output','Выпуск годной продукции',' ед.','factory',null,'план / факт выпуска'],['queue','Очередь производства',' заданий','clock',30,'ожидают запуска на конец периода'],['reprint','Перепечатка',' ед.','repeat',0,'зарегистрированный повторный выпуск'],['downtime','Простои',' мин','clock',60,'остановки оборудования в периоде']
];
export function analytics(state,actor,filters={}) {
 const w=reportingWindow(filters),{start,end,days,period,market,region}=w,previous=start-days*DAY_MS;
 const department=actor.scope!=='all'&&actor.departments.length===1?actor.departments[0]:(filters.department||'all'),product=filters.product||'all';
 if(!['all',...DEPARTMENTS.map(d=>d.id)].includes(department)||!['all',...PRODUCTS.map(p=>p.id)].includes(product))throw new RangeError('Неизвестное подразделение или продукт.');
 const f=enrichFacts(state.facts),unique=rows=>[...new Map(rows.map(r=>[r.id||r.department,r])).values()];
 const sourceQuality=inspectSources(f);
 const departmentScope=o=>canAccessDepartment(actor,o.department)&&(department==='all'||o.department===department);
 const relevant=o=>departmentScope(o)&&(product==='all'||o.productId===product)&&(market==='all'||o.market===market)&&(region==='all'||o.regionId===region);
 const allOrders=unique(f.orders).filter(relevant),allIds=new Set(allOrders.map(o=>o.id)),orderMap=new Map(allOrders.map(o=>[o.id,o]));
 const within=(o,a,b)=>Date.parse(o.createdAt)>=a&&Date.parse(o.createdAt)<b;
 const rows=allOrders.filter(o=>within(o,start,end)),prev=allOrders.filter(o=>within(o,previous,start));
 const allTickets=unique(f.interactions).filter(t=>allIds.has(t.orderId)),tickets=allTickets.filter(t=>within(t,start,end)),prevTickets=allTickets.filter(t=>within(t,previous,start));
 const allReviews=unique(f.reviews).filter(r=>allIds.has(r.orderId)),reviews=allReviews.filter(r=>within(r,start,end)),prevReviews=allReviews.filter(r=>within(r,previous,start));
 const resources=unique(f.staff).filter(s=>departmentScope(s)&&(product==='all'||s.department===PRODUCTS.find(p=>p.id===product)?.department)),factor=1;
 const resourceScope=market==='all'&&region==='all';
 const selectedShifts=unique(f.shifts).filter(s=>departmentScope(s)&&(product==='all'||s.department===PRODUCTS.find(p=>p.id===product)?.department)).map(s=>allocateShift(s,product));
 const customerMap=new Map(f.customers.map(c=>[c.id,c]));
 const allLeads=unique(f.leads||[]).filter(relevant).filter(l=>!l.orderId||allIds.has(l.orderId)),allDowntime=unique(f.downtime||[]).filter(d=>departmentScope(d)&&(product==='all'||d.productId===product));
 const contextCache=new Map();
 const context=(dimension=null,id=null)=>{const key=dimension+':'+id;if(contextCache.has(key))return contextCache.get(key);const matches=o=>!dimension||o[dimension]===id,contextOrders=allOrders.filter(matches),contextLeads=allLeads.filter(matches);const ctx=businessContext(f,{orders:contextOrders,leads:contextLeads,resourceScope:resourceScope&&(!dimension||dimension==='department'),shifts:dimension==='department'?selectedShifts.filter(s=>s.department===id):selectedShifts,factor,downtime:dimension==='department'?allDowntime.filter(s=>s.department===id):allDowntime});ctx.orders=contextOrders;ctx.customerIds=new Set([...contextOrders,...contextLeads].map(x=>x.customerId));contextCache.set(key,ctx);return ctx;};
 const domain=context().measure(start,end);
 const measures=new Map();
 const measure=(os,ts,rs,prior,a,b,staff=resources,dimension=null,group=null)=>{
  const cacheKey=[a,b,dimension,group].join(':');if(measures.has(cacheKey))return measures.get(cacheKey);
  const ctx=context(dimension,group),domain=ctx.measure(a,b),sla=slaStatistics(ts,b,sourceTime(f,['interactions.csv']));
  const historical=ctx.orders.filter(o=>Date.parse(o.createdAt)<b),historyCounts=new Map();for(const o of historical)historyCounts.set(o.customerId,(historyCounts.get(o.customerId)||0)+1);
  const duration=(b-a)/DAY_MS,ids=new Set(os.map(o=>o.customerId)),done=os.filter(o=>o.completed),counts={};os.forEach(o=>counts[o.customerId]=(counts[o.customerId]||0)+1);
  const rev=sum(os,'revenue'),pastRev=sum(prior,'revenue'),cost=sum(os,'cost'),actual=sum(staff,'actual')*factor,planned=sum(staff,'planned')*factor,capacity=shiftHours(selectedShifts.filter(s=>staff.some(r=>r.department===s.department)),a,b)*factor;
  const result={customers:ids.size,orders:os.length,moderation:ctx.orders.filter(o=>Date.parse(o.moderationQueuedAt)<b&&(!o.moderatedAt||Date.parse(o.moderatedAt)>=b)).length,production:domain.production,quality:domain.quality,support:sla.percent,delivery:domain.delivery,team:resourceScope&&(!dimension||dimension==='department')?actual:null,revenue:rev,margin:pct(rev-cost,rev),newCustomers:[...ctx.customerIds].filter(id=>within(customerMap.get(id)||{},a,b)).length,defects:domain.defects,repeat:pct([...ids].filter(id=>(historyCounts.get(id)||0)>1).length,ids.size),conversion:domain.conversion,leadTime:domain.leadTime,staffing:resourceScope&&(!dimension||dimension==='department')?pct(actual,planned):null,responseTime:sla.responseMinutes.length?Math.round(sla.responseMinutes.reduce((n,x)=>n+x,0)/sla.responseMinutes.length*10)/10:null,reviewScore:rs.length?Math.round(sum(rs,'rating')/rs.length*10)/10:null,output:domain.productionFact,queue:domain.queue,reprint:domain.reprintCount,downtime:domain.downtime};
  measures.set(cacheKey,result);return result;
 };
 const values=measure(rows,tickets,reviews,prev,start,end),beforePrev=allOrders.filter(o=>within(o,previous-days*DAY_MS,previous));
 const previousValues=measure(prev,prevTickets,prevReviews,beforePrev,previous,start);
 const missing=()=>false;
 const definitions=[...KPI,...EXTRA_METRICS.map(([id,label,unit,icon,plan,description])=>({id,label,unit,icon,plan,description,owner:'Анна Смирнова'}))];
 const plans={revenue:Math.round(sum(prev,'revenue')*1.08),customers:Math.round(previousValues.customers*1.1),orders:Math.round(prev.length*1.08),moderation:30,production:90,quality:98,support:95,delivery:98,team:resourceScope?sum(resources,'planned'):null,newCustomers:Math.max(1,Math.ceil(values.customers*.1)),output:domain.productionPlan};
 const less=new Set(['moderation','defects','leadTime','responseTime','queue','reprint','downtime']),snapshots=new Set(['team','staffing']);
 const kpis=definitions.map(k=>{
  const value=values[k.id],plan=Object.hasOwn(plans,k.id)?plans[k.id]:k.plan??null,noData=value===null||missing(k.id,rows,tickets,reviews,prev),priorMissing=previousValues[k.id]===null||missing(k.id,prev,prevTickets,prevReviews,beforePrev);
  const bad=plan===null?false:less.has(k.id)?value>plan:k.id==='production'?value>90||value<70:value<plan;
  const forecast=['customers','orders','newCustomers','revenue'].includes(k.id)?Math.round(value*1.08):value;
  const distribution=k.id==='leadTime'?responseDistribution(domain.cycleHours):k.id==='responseTime'||k.id==='support'?responseDistribution(slaStatistics(tickets,end,sourceTime(f,['interactions.csv'])).responseMinutes):null;
  const [formula,source]=METRIC_RULES[k.id];
  const scopeNote=['team','staffing','production','output','downtime'].includes(k.id)?'План и мощность продукта берутся из распределения productMix в сменах. Рыночного/регионального распределения ресурсов нет — такой план и загрузка не определены. Штат — текущий снимок всего направления, не явка смены.':'';
  return {...k,raw:value,value:noData?'—':k.id==='revenue'?value.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}):fmt(value),unit:k.id==='team'?'/ '+fmt(plans.team):k.unit,plan,forecast:noData?'—':fmt(forecast),formula,source:'Filesystem / '+source,sourceAt:sourceTime(f,source.split(' + ')),updatedAt:sourceTime(f,source.split(' + ')),sourceTimes:source.split(' + ').map(file=>({file,updatedAt:sourceTime(f,[file])})),state:noData?'Нет данных':bad?'Требует внимания':'В норме',trend:noData?'neutral':bad?'negative':'positive',change:noData?'Нет базы':snapshots.has(k.id)?'Снимок ресурса':priorMissing?'Нет базы сравнения':`${value-previousValues[k.id]>=0?'+':''}${fmt(value-previousValues[k.id])}${k.unit==='%'?' п.п.':''}`,previous:priorMissing||snapshots.has(k.id)?null:previousValues[k.id],delta:priorMissing||snapshots.has(k.id)?null:Math.round((value-previousValues[k.id])*10)/10,distribution,scopeNote,snapshot:snapshots.has(k.id),forecastMethod:['customers','orders','newCustomers','revenue'].includes(k.id)?'Сценарий: факт × 1,08 для следующего равного периода.':'Базовый сценарий: значение сохраняется; это допущение, а не прогноз модели.',sampleSize:k.id==='responseTime'?slaStatistics(tickets,end,sourceTime(f,['interactions.csv'])).responseMinutes.length:k.id==='support'?slaStatistics(tickets,end,sourceTime(f,['interactions.csv'])).eligible:k.id==='reviewScore'?reviews.length:k.id==='delivery'?domain.deliveredCount:['quality','defects','leadTime','output','reprint'].includes(k.id)?domain.releaseRows.length:k.id==='conversion'?domain.leads.length:snapshots.has(k.id)?resources.length:rows.length};
 });
 const bucketCount=days===1?8:Math.min(days,28),step=(end-start)/bucketCount;
 const bucketValues=[],cumulativeValues=[],priorValues=[];
 const mask=(v,os,ts,rs,prior)=>Object.fromEntries(Object.entries(v).map(([id,value])=>[id,value===null?null:value]));
 const series=Array.from({length:bucketCount},(_,i)=>{
  const a=start+i*step,b=a+step,os=rows.filter(o=>within(o,a,b)),prior=prev.filter(o=>within(o,a-days*DAY_MS,b-days*DAY_MS)),ts=tickets.filter(o=>within(o,a,b)),rs=reviews.filter(o=>within(o,a,b));
  const cumOrders=rows.filter(o=>within(o,start,b)),cumTickets=tickets.filter(o=>within(o,start,b)),cumReviews=reviews.filter(o=>within(o,start,b)),cumPrior=prev.filter(o=>within(o,previous,b-days*DAY_MS));
  const priorTs=prevTickets.filter(o=>within(o,a-days*DAY_MS,b-days*DAY_MS)),priorRs=prevReviews.filter(o=>within(o,a-days*DAY_MS,b-days*DAY_MS)),priorPrior=beforePrev.filter(o=>within(o,a-2*days*DAY_MS,b-2*days*DAY_MS));
  bucketValues.push(mask(measure(os,ts,rs,prior,a,b),os,ts,rs,prior));
  cumulativeValues.push(mask(measure(cumOrders,cumTickets,cumReviews,cumPrior,start,b),cumOrders,cumTickets,cumReviews,cumPrior));
  priorValues.push(mask(measure(prior,priorTs,priorRs,priorPrior,a-days*DAY_MS,b-days*DAY_MS),prior,priorTs,priorRs,priorPrior));

  const label=days===1?new Date(a+3*3600000).toISOString().slice(11,16):new Date(a+3*3600000).toLocaleDateString('ru-RU',{timeZone:'UTC',day:'numeric',month:'short'});
  return {label,orders:os.length,customers:new Set(os.map(o=>o.customerId)).size,previous:prior.length};
 });
 for(const k of kpis){k.series=bucketValues.map(v=>v[k.id]);k.cumulativeSeries=cumulativeValues.map(v=>v[k.id]);k.previousSeries=priorValues.map(v=>v[k.id]);k.seriesLabels=series.map(s=>s.label);}
 const dimensions={market:[['BY','Беларусь'],['RU','Россия']],department:DEPARTMENTS.filter(d=>departmentScope({department:d.id})).map(d=>[d.id,d.name]),channel:['Сайт','CRM','Партнёры'].map(c=>[c,c])};
 for(const k of kpis){k.breakdowns={};for(const [dimension,groups] of Object.entries(dimensions))k.breakdowns[dimension]=groups.map(([id,name])=>{const os=rows.filter(o=>o[dimension]===id),prior=prev.filter(o=>o[dimension]===id),ts=tickets.filter(t=>orderMap.get(t.orderId)?.[dimension]===id),rs=reviews.filter(r=>orderMap.get(r.orderId)?.[dimension]===id),staff=dimension==='department'?resources.filter(s=>s.department===id):resources;return {id,name,value:missing(k.id,os,ts,rs,prior)?null:measure(os,ts,rs,prior,start,end,staff,dimension,id)[k.id],orders:os.length,tickets:ts.length,reviews:rs.length};});}
 for(const k of kpis.filter(k=>['team','staffing','production','downtime'].includes(k.id))){k.breakdowns.market=[];k.breakdowns.channel=[];}
 const stageCounts=STAGES.map((name,i)=>({name,count:rows.filter(o=>o.stage===i).length}));
 const flow=rows.map(o=>({id:o.id,customerId:o.customerId,client:'Тестовый клиент '+o.customerId,product:PRODUCTS.find(p=>p.id===o.productId)?.name||'Неизвестный продукт',productId:o.productId,stage:o.stage,owner:departmentOwner(o.department),managerId:o.managerId,status:STAGES[o.stage],department:o.department,market:o.market,regionId:o.regionId,regionName:REGIONS.find(r=>r.id===o.regionId)?.name||'Не указан',payment:o.paymentStatus==='paid'?'Оплачен':'Ожидает оплаты',createdAt:o.createdAt,updatedAt:o.createdAt,promisedAt:o.promisedAt||null,completedAt:o.completedAt||null,events:[],historyMode:'current_status',reviews:f.reviews.filter(r=>r.orderId===o.id),interactions:f.interactions.filter(t=>t.orderId===o.id).map(t=>({id:t.id,topic:t.topic,status:t.status,firstReplyMinutes:t.firstReplyMinutes,createdAt:t.createdAt}))}));
 const channels=['Сайт','CRM','Партнёры'].map(name=>({name,orders:rows.filter(o=>o.channel===name).length,share:pct(rows.filter(o=>o.channel===name).length,rows.length)}));
 const customers=new Set(rows.map(o=>o.customerId)),segments=[{id:'b2b',name:'Бизнес'},{id:'b2c',name:'Частные клиенты'}].map(s=>({...s,count:unique(f.customers).filter(c=>customers.has(c.id)&&c.segment===s.id).length}));
 const revenue=sum(rows,'revenue'),prevRevenue=sum(prev,'revenue');
 const averageCheck=rows.length?Math.round(revenue/rows.length*100)/100:null;
 const averageIndex=rows.length&&prev.length&&prevRevenue?Math.round((revenue/rows.length)/(prevRevenue/prev.length)*1000)/10:null;
 const capacity=shiftHours(selectedShifts,start,end)*factor,weeklyDemand=sum(rows,'units')*7/days;
 const forecast=Array.from({length:4},(_,i)=>{const a=end+i*7*DAY_MS,b=end+(i+1)*7*DAY_MS,known=resourceScope&&f.capacityCoverage&&Date.parse(f.capacityCoverage.from)<=a&&Date.parse(f.capacityCoverage.to)>=b&&selectedShifts.filter(s=>Date.parse(s.endsAt)>a&&Date.parse(s.startsAt)<b).every(s=>Number.isFinite(s.availableHours)),demand=rows.length?Math.round(weeklyDemand*(1.06+i*.12)):null,available=known?Math.round(shiftHours(selectedShifts,a,b)/.8*factor):null;return {week:i+1,label:new Date(a).toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:REPORTING_TZ}),demand,capacity:available,gap:demand===null||available===null?null:available-demand};});
 const ledgerMap=new Map(f.financeEntries.map(e=>[e.orderId,e])),cohortLedger=rows.map(o=>ledgerMap.get(o.id)).filter(Boolean),ledger=unique(f.financeEntries).filter(e=>allIds.has(e.orderId)&&within(e,start,end)),plannedIncome=sum(ledger,'plannedIncome'),plannedCost=sum(ledger,'plannedCost'),plannedInflow=sum(ledger,'plannedInflow'),plannedOutflow=sum(ledger,'plannedOutflow');
 const income=sum(ledger,'actualIncome'),financialCost=sum(ledger,'actualCost'),inflow=sum(ledger,'actualInflow'),outflow=sum(ledger,'actualOutflow');
 const mismatches=rows.filter(o=>{const e=ledgerMap.get(o.id);return !e||e.currency!==o.currency||e.paymentStatus!==o.paymentStatus||e.actualIncome!==o.revenue||e.actualCost!==o.cost;});
 const finance={periodBasis:'БДР/БДДС: дата финансовой записи (createdAt). Сверка ERP/1С: записи заказов, созданных в выбранном периоде.',currency:'BYN',turnover:revenue,cost:sum(rows,'cost'),grossProfit:revenue-sum(rows,'cost'),revenueIndex:pct(revenue,prevRevenue*1.08),margin:values.margin,costIndex:pct(sum(rows,'cost'),revenue),bdr:{plan:plannedIncome,fact:income,index:plannedIncome?pct(income,plannedIncome):null},bdrCost:{plan:plannedCost,fact:financialCost,index:plannedCost?pct(financialCost,plannedCost):null},bdds:{plan:plannedInflow,fact:inflow,index:plannedInflow?pct(inflow,plannedInflow):null},bddsCost:{plan:plannedOutflow,fact:outflow,index:plannedOutflow?pct(outflow,plannedOutflow):null},reconciliation:{erpIncome:revenue,financeIncome:sum(cohortLedger,'actualIncome'),erpCost:sum(rows,'cost'),financeCost:sum(cohortLedger,'actualCost'),matched:rows.length-mismatches.length,total:rows.length,mismatched:mismatches.length,status:mismatches.length?'mismatch':'matched',erpIncomeIndex:revenue?100:null,financeIncomeIndex:revenue?pct(sum(cohortLedger,'actualIncome'),revenue):null,erpCostIndex:sum(rows,'cost')?100:null,financeCostIndex:sum(rows,'cost')?pct(sum(cohortLedger,'actualCost'),sum(rows,'cost')):null},staff:plans.team,actual:values.team,vacancies:resourceScope?sum(resources,'openVacancies'):null,absent:resourceScope?sum(resources,'absent'):null};

 const geography=REGIONS.filter(r=>market==='all'||r.market===market).map(r=>{const os=rows.filter(o=>o.regionId===r.id),prior=prev.filter(o=>o.regionId===r.id);return {...r,orders:os.length,customers:new Set(os.map(o=>o.customerId)).size,share:pct(os.length,rows.length),previous:prior.length,delta:os.length-prior.length};});
 const employeeStats=staffReport(f,rows,tickets,start,end,actor,departmentScope);
 const performance=actor.role==='executive'&&f.performance?.length?legacyPerformance(f.performance,7):null;
 return {kpis,leadFunnel:domain.funnel,leadRows:domain.leads.slice(0,40),productionQueue:domain.queue,workInProgress:domain.inProgress,productionQueueRows:domain.queueRows.slice(0,40).map(j=>({...j,product:PRODUCTS.find(p=>p.id===orderMap.get(j.orderId)?.productId)?.name||'—',department:orderMap.get(j.orderId)?.department})),machineHours:domain.machineHours,availableHours:domain.availableHours,staffSnapshotAt:sourceTime(f,['staff.csv']),modelWarnings:[...(f.sourcePresence?.leads===false?['Нет записей фактических лидов: воронка и конверсия недоступны.']:[]),...(f.sourcePresence?.production_jobs===false?['Нет производственных заданий: показатели выпуска и качества недоступны.']:[])],series,seriesForecast:Array.from({length:4},(_,i)=>({label:'+'+(i+1),orders:Math.round(rows.length/bucketCount*(1.06+i*.12)),customers:Math.round(customers.size/bucketCount*(1.06+i*.12))})),forecast,performance,employeeStats,geography,reviews:reviews.map(r=>({...r,market:orderMap.get(r.orderId)?.market,regionId:orderMap.get(r.orderId)?.regionId})),stageCounts,flow,channels,segments,finance,shifts:selectedShifts.filter(s=>Date.parse(s.endsAt)>start&&Date.parse(s.startsAt)<end),qualityReport:{...sourceQuality,orders:allOrders.length,customers:new Set(allOrders.map(o=>o.customerId)).size,interactions:allTickets.length,reconciled:finance.reconciliation,generatedAt:f.generatedAt},averageIndex,averageCheck,churn:pct([...new Set(prev.map(o=>o.customerId))].filter(id=>!customers.has(id)).length,new Set(prev.map(o=>o.customerId)).size),reprintCount:domain.reprintCount,repeat:values.repeat,conversion:values.conversion,lead:values.leadTime,productionPlan:domain.productionPlan,productionFact:domain.productionFact,downtime:domain.downtime,filters:{...w,department,product},departments:DEPARTMENTS.filter(d=>canAccessDepartment(actor,d.id)),products:PRODUCTS.filter(p=>canAccessDepartment(actor,p.department)&&(department==='all'||p.department===department)),totals:{orders:rows.length,customers:customers.size,tickets:tickets.length,reviews:reviews.length},empty:!rows.length};
}
function legacyPerformance(records,days){const scaled=records.map(p=>({...p,hours:p.hours*days/7,completed:p.completed*days/7,rate:p.hours?p.completed/p.hours:0})),employees=scaled.filter(p=>!p.isAgent),mary=scaled.find(p=>p.isAgent);if(!mary)return null;const hours=sum(employees,'hours'),averageRate=hours?sum(employees,'completed')/hours:0;return {employees,agent:mary,averageRate,multiplier:averageRate?mary.rate/averageRate:0,mode:'csv',formula:'Завершённые задачи / рабочие часы; недельный демонстрационный сценарий'};}
