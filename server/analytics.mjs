import { KPI, STAGES, canAccessDepartment, departmentOwner } from './seed.mjs';
import { REGIONS } from './regions.mjs';
import { enrichFacts, reportingWindow, staffReport, responseDistribution, DAY_MS, shiftHours, REPORTING_TZ } from './reporting.mjs';
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
    const p=PRODUCTS[i%5],age=Math.floor(i/32.15),units=1+Math.floor(rand()*6),cost=20+Math.floor(rand()*180),stage=age<2?Math.floor(rand()*8):7;
    const inModeration=p.id==='book'&&i<235;
    const currentStage=inModeration?3:stage;
    return {id:'ORD-'+String(i+1).padStart(5,'0'),customerId:customers[(Math.floor(i/2)*7)%360].id,productId:p.id,department:p.department,channel:['Сайт','CRM','Партнёры'][i%3],createdAt:new Date(inModeration?now-(i%6)*3600000:now-age*86400000-(i%23)*3600000).toISOString(),stage:currentStage,units,revenue:cost*units,currency:'BYN',cost:Math.round(cost*units*(.62+rand()*.12)),completed:currentStage>=5,onTime:rand()>.075,defect:rand()<.018,moderationMinutes:20+Math.floor(rand()*150),leadHours:8+Math.floor(rand()*60),downtimeMinutes:Math.floor(rand()*8),paymentStatus:i%17===0?'pending':'paid',financeStatus:i%17===0?'pending':'paid',sourceEventId:'erp-order-'+i};
  });
  const interactions=Array.from({length:800},(_,i)=>({id:'INT-'+i,orderId:orders[i%orders.length].id,customerId:orders[i%orders.length].customerId,department:orders[i%orders.length].department,createdAt:new Date(now-(i%56)*86400000).toISOString(),firstReplyMinutes:i%13===0?24:3+i%12,channel:['Чат','Email','Телефон'][i%3],topic:['Сроки','Макет','Доставка','Возврат'][i%4],status:i%5?'resolved':'open'}));
  for(const c of customers){const first=Math.min(...orders.filter(o=>o.customerId===c.id).map(o=>Date.parse(o.createdAt)));if(Number.isFinite(first))c.createdAt=new Date(Math.min(Date.parse(c.createdAt),first-86400000)).toISOString();}
  for(const o of orders){o.promisedAt=new Date(Date.parse(o.createdAt)+48*3600000).toISOString();o.completedAt=o.completed?new Date(Math.min(now,Date.parse(o.createdAt)+o.leadHours*3600000)).toISOString():null;if(o.completed)o.leadHours=Math.round((Date.parse(o.completedAt)-Date.parse(o.createdAt))/360000)/10;o.onTime=o.completed?Date.parse(o.completedAt)<=Date.parse(o.promisedAt):false;o.reprinted=o.defect&&o.completed;}
  for(const t of interactions){const o=orders.find(o=>o.id===t.orderId);t.createdAt=new Date(Math.max(Date.parse(t.createdAt),Date.parse(o.createdAt))).toISOString();}
  return enrichFacts({generatedAt:new Date(now).toISOString(),customers,orders,interactions,staff:DEPARTMENTS.map((d,i)=>({department:d.id,planned:12+i*4,actual:10+i*4,absent:1,openVacancies:2,availableHours:180+i*60,leads:320+i*80}))});
}

const METRIC_RULES={
 customers:['Уникальные customerId в заказах, созданных за период','orders.csv + customers.csv'],
 orders:['Количество уникальных orderId, созданных за период','orders.csv'],
 moderation:['Количество заказов выбранного периода на этапе «Проверка» (stage = 3)','orders.csv'],
 production:['Σ units × 0,8 ч / (Σ availableHours смен в периоде × доля продукта) × 100%','orders.csv + shifts.csv'],
 quality:['Заказы без признака defect / все заказы выбранного периода × 100%','orders.csv'],
 support:['Обращения, созданные за период, с первым ответом ≤ 15 мин / все обращения периода × 100%','interactions.csv + orders.csv'],
 delivery:['Заказы с completed = true и onTime = true / заказы с completed = true × 100%','orders.csv'],
 team:['Σ actual по выбранным подразделениям × доля продукта; план = Σ planned × доля продукта','staff.csv'],
 revenue:['Σ revenue заказов выбранного периода, BYN. План = выручка предыдущего равного периода × 1,08','orders.csv'],
 margin:['(Σ revenue − Σ cost) / Σ revenue × 100%','orders.csv'],
 newCustomers:['Уникальные клиенты заказов периода, у которых createdAt клиента попадает в этот период','customers.csv + orders.csv'],
 defects:['Заказы с defect = true / все заказы выбранного периода × 100%','orders.csv'],
 repeat:['Клиенты с двумя и более заказами в периоде / уникальные клиенты периода × 100%','orders.csv + customers.csv'],
 conversion:['Заказы / (недельный план лидов × дни / 7 × доля продукта) × 100%; лиды — демопрокси','orders.csv + staff.csv'],
 leadTime:['Σ leadHours / число заказов периода; P50/P90/P95 по распределению leadHours','orders.csv'],
 staffing:['Σ actual / Σ planned × 100% в выбранных подразделениях','staff.csv'],
 responseTime:['Σ firstReplyMinutes / число обращений периода; перцентили по firstReplyMinutes','interactions.csv + orders.csv'],
 reviewScore:['Σ rating / число отзывов, созданных за период, по доступным заказам','reviews.csv + orders.csv']
};
const EXTRA_METRICS=[
 ['revenue','Оборот',' BYN','chart',null,'выручка заказов'],['margin','Валовая маржа','%','percent',32,'доля в обороте'],
 ['newCustomers','Новые клиенты','','userPlus',null,'в выбранном периоде'],['defects','Брак / перепечатка','%','scan',2,'цель не более 2%'],
 ['repeat','Повторная покупка','%','repeat',25,'доля повторных клиентов'],['conversion','Конверсия','%','filter',25,'из плана лидов в заказ'],
 ['leadTime','Lead time',' ч','clock',36,'среднее время исполнения'],['staffing','Обеспеченность','%','team',85,'ресурс смены'],
 ['responseTime','Время ответа',' мин','clock',15,'среднее · P50 / P90 / P95'],['reviewScore','Оценка клиентов',' / 5','shield',4.5,'отзывы к заказам']
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
 const resources=unique(f.staff).filter(s=>departmentScope(s)&&(product==='all'||s.department===PRODUCTS.find(p=>p.id===product)?.department)),factor=product==='all'?1:1/PRODUCTS.filter(p=>p.department===PRODUCTS.find(p=>p.id===product)?.department).length;
 const selectedShifts=unique(f.shifts).filter(s=>departmentScope(s)&&(product==='all'||s.department===PRODUCTS.find(p=>p.id===product)?.department));
 const customerMap=new Map(f.customers.map(c=>[c.id,c]));
 const measure=(os,ts,rs,prior,a,b,staff=resources)=>{
  const duration=(b-a)/DAY_MS,ids=new Set(os.map(o=>o.customerId)),done=os.filter(o=>o.completed),counts={};os.forEach(o=>counts[o.customerId]=(counts[o.customerId]||0)+1);
  const rev=sum(os,'revenue'),pastRev=sum(prior,'revenue'),cost=sum(os,'cost'),actual=sum(staff,'actual')*factor,planned=sum(staff,'planned')*factor,capacity=shiftHours(selectedShifts.filter(s=>staff.some(r=>r.department===s.department)),a,b)*factor;
  return {customers:ids.size,orders:os.length,moderation:os.filter(o=>o.stage===3).length,production:pct(sum(os,'units')*.8,capacity),quality:pct(os.filter(o=>!o.defect).length,os.length),support:pct(ts.filter(t=>t.firstReplyMinutes<=15).length,ts.length),delivery:pct(done.filter(o=>o.onTime).length,done.length),team:actual,revenue:rev,margin:pct(rev-cost,rev),newCustomers:[...ids].filter(id=>within(customerMap.get(id)||{},a,b)).length,defects:pct(os.filter(o=>o.defect).length,os.length),repeat:pct(Object.values(counts).filter(n=>n>1).length,ids.size),conversion:pct(os.length,sum(staff,'leads')*duration/7*factor),leadTime:os.length?Math.round(sum(os,'leadHours')/os.length*10)/10:null,staffing:pct(actual,planned),responseTime:ts.length?Math.round(sum(ts,'firstReplyMinutes')/ts.length*10)/10:null,reviewScore:rs.length?Math.round(sum(rs,'rating')/rs.length*10)/10:null};
 };
 const values=measure(rows,tickets,reviews,prev,start,end),beforePrev=allOrders.filter(o=>within(o,previous-days*DAY_MS,previous));
 const previousValues=measure(prev,prevTickets,prevReviews,beforePrev,previous,start);
 const missing=(id,os,ts,rs,prior)=>['support','responseTime'].includes(id)?!ts.length:id==='reviewScore'?!rs.length:id==='delivery'?!os.some(o=>o.completed):['quality','margin','defects','repeat','leadTime'].includes(id)?!os.length:false;
 const definitions=[...KPI,...EXTRA_METRICS.map(([id,label,unit,icon,plan,description])=>({id,label,unit,icon,plan,description,owner:'Анна Смирнова'}))];
 const plans={revenue:Math.round(sum(prev,'revenue')*1.08),customers:Math.round(previousValues.customers*1.1),orders:Math.round(prev.length*1.08),moderation:30,production:90,quality:98,support:95,delivery:98,team:sum(resources,'planned')*factor,newCustomers:Math.max(1,Math.ceil(values.customers*.1))};
 const less=new Set(['moderation','defects','leadTime','responseTime']),snapshots=new Set(['team','staffing']);
 const kpis=definitions.map(k=>{
  const value=values[k.id],plan=plans[k.id]??k.plan??0,noData=value===null||missing(k.id,rows,tickets,reviews,prev),priorMissing=previousValues[k.id]===null||missing(k.id,prev,prevTickets,prevReviews,beforePrev);
  const bad=less.has(k.id)?value>plan:k.id==='production'?value>90||value<70:value<plan;
  const forecast=['customers','orders','newCustomers','revenue'].includes(k.id)?Math.round(value*1.08):value;
  const distribution=k.id==='leadTime'?responseDistribution(rows.map(o=>o.leadHours)):k.id==='responseTime'||k.id==='support'?responseDistribution(tickets.map(t=>t.firstReplyMinutes)):null;
  const [formula,source]=METRIC_RULES[k.id];
  const scopeNote=['team','staffing','production','conversion'].includes(k.id)?'Мощность, штат и план лидов общие для выбранных подразделений; по рынкам и регионам ресурс не распределён. Доля продукта равна 1 / числу продуктов направления.':'';
  return {...k,raw:value,value:noData?'—':k.id==='revenue'?value.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}):fmt(value),unit:k.id==='team'?'/ '+fmt(plans.team):k.unit,plan,forecast:noData?'—':fmt(forecast),formula,source:'Filesystem / '+source,sourceAt:sourceTime(f,source.split(' + ')),updatedAt:sourceTime(f,source.split(' + ')),sourceTimes:source.split(' + ').map(file=>({file,updatedAt:sourceTime(f,[file])})),state:noData?'Нет данных':bad?'Требует внимания':'В норме',trend:noData?'neutral':bad?'negative':'positive',change:noData?'Нет базы':snapshots.has(k.id)?'Снимок ресурса':priorMissing?'Нет базы сравнения':`${value-previousValues[k.id]>=0?'+':''}${fmt(value-previousValues[k.id])}${k.unit==='%'?' п.п.':''}`,previous:priorMissing||snapshots.has(k.id)?null:previousValues[k.id],delta:priorMissing||snapshots.has(k.id)?null:Math.round((value-previousValues[k.id])*10)/10,distribution,scopeNote,snapshot:snapshots.has(k.id),forecastMethod:['customers','orders','newCustomers','revenue'].includes(k.id)?'Сценарий: факт × 1,08 для следующего равного периода.':'Базовый сценарий: значение сохраняется; это допущение, а не прогноз модели.',sampleSize:['support','responseTime'].includes(k.id)?tickets.length:k.id==='reviewScore'?reviews.length:snapshots.has(k.id)?resources.length:rows.length};
 });
 const bucketCount=days===1?8:Math.min(days,28),step=(end-start)/bucketCount;
 const bucketValues=[],cumulativeValues=[],priorValues=[];
 const mask=(v,os,ts,rs,prior)=>Object.fromEntries(Object.entries(v).map(([id,value])=>[id,missing(id,os,ts,rs,prior)?null:value]));
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
 for(const k of kpis){k.breakdowns={};for(const [dimension,groups] of Object.entries(dimensions))k.breakdowns[dimension]=groups.map(([id,name])=>{const os=rows.filter(o=>o[dimension]===id),prior=prev.filter(o=>o[dimension]===id),ts=tickets.filter(t=>orderMap.get(t.orderId)?.[dimension]===id),rs=reviews.filter(r=>orderMap.get(r.orderId)?.[dimension]===id),staff=dimension==='department'?resources.filter(s=>s.department===id):resources;return {id,name,value:missing(k.id,os,ts,rs,prior)?null:measure(os,ts,rs,prior,start,end,staff)[k.id],orders:os.length,tickets:ts.length,reviews:rs.length};});}
 const stageCounts=STAGES.map((name,i)=>({name,count:rows.filter(o=>o.stage===i).length}));
 const flow=rows.map(o=>({id:o.id,customerId:o.customerId,client:'Тестовый клиент '+o.customerId,product:PRODUCTS.find(p=>p.id===o.productId)?.name||'Неизвестный продукт',productId:o.productId,stage:o.stage,owner:departmentOwner(o.department),managerId:o.managerId,status:STAGES[o.stage],department:o.department,market:o.market,regionId:o.regionId,regionName:REGIONS.find(r=>r.id===o.regionId)?.name||'Не указан',payment:o.paymentStatus==='paid'?'Оплачен':'Ожидает оплаты',createdAt:o.createdAt,updatedAt:o.createdAt,promisedAt:o.promisedAt||null,completedAt:o.completedAt||null,events:[],historyMode:'current_status',reviews:f.reviews.filter(r=>r.orderId===o.id),interactions:f.interactions.filter(t=>t.orderId===o.id).map(t=>({id:t.id,topic:t.topic,status:t.status,firstReplyMinutes:t.firstReplyMinutes,createdAt:t.createdAt}))}));
 const channels=['Сайт','CRM','Партнёры'].map(name=>({name,orders:rows.filter(o=>o.channel===name).length,share:pct(rows.filter(o=>o.channel===name).length,rows.length)}));
 const customers=new Set(rows.map(o=>o.customerId)),segments=[{id:'b2b',name:'Бизнес'},{id:'b2c',name:'Частные клиенты'}].map(s=>({...s,count:unique(f.customers).filter(c=>customers.has(c.id)&&c.segment===s.id).length}));
 const revenue=sum(rows,'revenue'),prevRevenue=sum(prev,'revenue');
 const averageCheck=rows.length?Math.round(revenue/rows.length*100)/100:null;
 const averageIndex=rows.length&&prev.length&&prevRevenue?Math.round((revenue/rows.length)/(prevRevenue/prev.length)*1000)/10:null;
 const capacity=shiftHours(selectedShifts,start,end)*factor,weeklyDemand=sum(rows,'units')*7/days;
 const forecast=Array.from({length:4},(_,i)=>{const demand=Math.round(weeklyDemand*(1.06+i*.12)),available=Math.round(shiftHours(selectedShifts,end+i*7*DAY_MS,end+(i+1)*7*DAY_MS)/.8*factor);return {week:i+1,label:new Date(end+i*7*DAY_MS).toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:REPORTING_TZ}),demand,capacity:available,gap:available-demand};});
 const ledgerMap=new Map(f.financeEntries.map(e=>[e.orderId,e])),cohortLedger=rows.map(o=>ledgerMap.get(o.id)).filter(Boolean),ledger=unique(f.financeEntries).filter(e=>allIds.has(e.orderId)&&within(e,start,end)),plannedIncome=sum(ledger,'plannedIncome'),plannedCost=sum(ledger,'plannedCost'),plannedInflow=sum(ledger,'plannedInflow'),plannedOutflow=sum(ledger,'plannedOutflow');
 const income=sum(ledger,'actualIncome'),financialCost=sum(ledger,'actualCost'),inflow=sum(ledger,'actualInflow'),outflow=sum(ledger,'actualOutflow');
 const mismatches=rows.filter(o=>{const e=ledgerMap.get(o.id);return !e||e.currency!==o.currency||e.paymentStatus!==o.paymentStatus||e.actualIncome!==o.revenue||e.actualCost!==o.cost;});
 const finance={periodBasis:'БДР/БДДС: дата финансовой записи (createdAt). Сверка ERP/1С: записи заказов, созданных в выбранном периоде.',currency:'BYN',turnover:revenue,cost:sum(rows,'cost'),grossProfit:revenue-sum(rows,'cost'),revenueIndex:pct(revenue,prevRevenue*1.08),margin:values.margin,costIndex:pct(sum(rows,'cost'),revenue),bdr:{plan:plannedIncome,fact:income,index:plannedIncome?pct(income,plannedIncome):null},bdrCost:{plan:plannedCost,fact:financialCost,index:plannedCost?pct(financialCost,plannedCost):null},bdds:{plan:plannedInflow,fact:inflow,index:plannedInflow?pct(inflow,plannedInflow):null},bddsCost:{plan:plannedOutflow,fact:outflow,index:plannedOutflow?pct(outflow,plannedOutflow):null},reconciliation:{erpIncome:revenue,financeIncome:sum(cohortLedger,'actualIncome'),erpCost:sum(rows,'cost'),financeCost:sum(cohortLedger,'actualCost'),matched:rows.length-mismatches.length,total:rows.length,mismatched:mismatches.length,status:mismatches.length?'mismatch':'matched',erpIncomeIndex:revenue?100:null,financeIncomeIndex:revenue?pct(sum(cohortLedger,'actualIncome'),revenue):null,erpCostIndex:sum(rows,'cost')?100:null,financeCostIndex:sum(rows,'cost')?pct(sum(cohortLedger,'actualCost'),sum(rows,'cost')):null},staff:plans.team,actual:values.team,vacancies:sum(resources,'openVacancies')*factor,absent:sum(resources,'absent')*factor};

 const geography=REGIONS.filter(r=>market==='all'||r.market===market).map(r=>{const os=rows.filter(o=>o.regionId===r.id),prior=prev.filter(o=>o.regionId===r.id);return {...r,orders:os.length,customers:new Set(os.map(o=>o.customerId)).size,share:pct(os.length,rows.length),previous:prior.length,delta:os.length-prior.length};});
 const employeeStats=staffReport(f,rows,tickets,start,end,actor,departmentScope);
 const performance=actor.role==='executive'&&f.performance?.length?legacyPerformance(f.performance,7):null;
 return {kpis,series,seriesForecast:Array.from({length:4},(_,i)=>({label:'+'+(i+1),orders:Math.round(rows.length/bucketCount*(1.06+i*.12)),customers:Math.round(customers.size/bucketCount*(1.06+i*.12))})),forecast,performance,employeeStats,geography,reviews:reviews.map(r=>({...r,market:orderMap.get(r.orderId)?.market,regionId:orderMap.get(r.orderId)?.regionId})),stageCounts,flow,channels,segments,finance,shifts:selectedShifts.filter(s=>Date.parse(s.endsAt)>start&&Date.parse(s.startsAt)<end),qualityReport:{...sourceQuality,orders:allOrders.length,customers:new Set(allOrders.map(o=>o.customerId)).size,interactions:allTickets.length,reconciled:finance.reconciliation,generatedAt:f.generatedAt},averageIndex,averageCheck,churn:pct([...new Set(prev.map(o=>o.customerId))].filter(id=>!customers.has(id)).length,new Set(prev.map(o=>o.customerId)).size),reprintCount:rows.some(o=>typeof o.reprinted!=='boolean')?null:rows.filter(o=>o.reprinted===true).length,repeat:values.repeat,conversion:values.conversion,lead:values.leadTime,productionPlan:Math.round(capacity/.8),productionFact:sum(rows.filter(o=>o.completed),'units'),downtime:sum(rows,'downtimeMinutes'),filters:{...w,department,product},departments:DEPARTMENTS.filter(d=>canAccessDepartment(actor,d.id)),products:PRODUCTS.filter(p=>canAccessDepartment(actor,p.department)&&(department==='all'||p.department===department)),totals:{orders:rows.length,customers:customers.size,tickets:tickets.length,reviews:reviews.length},empty:!rows.length};
}
function legacyPerformance(records,days){const scaled=records.map(p=>({...p,hours:p.hours*days/7,completed:p.completed*days/7,rate:p.hours?p.completed/p.hours:0})),employees=scaled.filter(p=>!p.isAgent),mary=scaled.find(p=>p.isAgent);if(!mary)return null;const hours=sum(employees,'hours'),averageRate=hours?sum(employees,'completed')/hours:0;return {employees,agent:mary,averageRate,multiplier:averageRate?mary.rate/averageRate:0,mode:'csv',formula:'Завершённые задачи / рабочие часы; недельный демонстрационный сценарий'};}
