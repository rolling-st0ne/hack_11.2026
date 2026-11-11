import { KPI, STAGES, canAccessDepartment, departmentOwner } from './seed.mjs';

export const DEPARTMENTS=[{id:'books',name:'Фотокниги'},{id:'photo',name:'Фотопечать'},{id:'gifts',name:'Фотосувениры'}];
export const PRODUCTS=[{id:'book',name:'Фотокнига',department:'books'},{id:'prints',name:'Фотографии',department:'photo'},{id:'canvas',name:'Холст',department:'gifts'},{id:'calendar',name:'Календарь',department:'gifts'},{id:'cards',name:'Открытки',department:'photo'}];
const sum=(rows,key)=>rows.reduce((n,o)=>n+(typeof key==='function'?key(o):o[key]),0);
const pct=(n,d)=>d?Math.round(n/d*1000)/10:0;
const fmt=v=>Number.isInteger(v)?v.toLocaleString('ru-RU'):v.toLocaleString('ru-RU',{maximumFractionDigits:1});

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
  return {generatedAt:new Date(now).toISOString(),customers,orders,interactions,staff:DEPARTMENTS.map((d,i)=>({department:d.id,planned:12+i*4,actual:10+i*4,absent:1,openVacancies:2,availableHours:180+i*60,leads:320+i*80}))};
}

export function analytics(state,actor,filters={}) {
  const scoped=actor.scope!=='all';
  const department=scoped&&actor.departments.length===1?actor.departments[0]:(filters.department||'all');
  const product=filters.product||'all',period=['today','week','month'].includes(filters.period)?filters.period:'week';
  const days={today:1,week:7,month:28}[period],now=Date.now(),start=now-days*86400000,previous=start-days*86400000;
  const f=state.facts;
  const relevant=o=>canAccessDepartment(actor,o.department)&&(actor.role!=='operator'||departmentOwner(o.department)===actor.id)&&(department==='all'||o.department===department)&&(product==='all'||o.productId===product);
  const rows=f.orders.filter(o=>relevant(o)&&new Date(o.createdAt).getTime()>=start);
  const prev=f.orders.filter(o=>relevant(o)&&new Date(o.createdAt).getTime()>=previous&&new Date(o.createdAt).getTime()<start);
  const orderIds=new Set(rows.map(o=>o.id));
  const tickets=f.interactions.filter(t=>orderIds.has(t.orderId)&&new Date(t.createdAt).getTime()>=start);
  const customers=new Set(rows.map(o=>o.customerId));
  const newClients=f.customers.filter(c=>customers.has(c.id)&&new Date(c.createdAt).getTime()>=start).length;
  const staff=f.staff.filter(s=>canAccessDepartment(actor,s.department)&&(department==='all'||s.department===department));
  const productFactor=product==='all'?1:.5;
  const completed=rows.filter(o=>o.completed);
  const revenue=sum(rows,'revenue'),prevRevenue=sum(prev,'revenue'),cost=sum(rows,'cost');
  const queue=rows.filter(o=>o.stage===3).length;
  const moderation=queue;
  const support=pct(tickets.filter(t=>t.firstReplyMinutes<=15).length,tickets.length);
  const delivery=pct(completed.filter(o=>o.onTime).length,completed.length);
  const customerCounts={};rows.forEach(o=>customerCounts[o.customerId]=(customerCounts[o.customerId]||0)+1);
  const repeat=pct(Object.values(customerCounts).filter(n=>n>1).length,customers.size);
  const actualStaff=sum(staff,'actual')*productFactor,plannedStaff=sum(staff,'planned')*productFactor;
  const capacity=sum(staff,'availableHours')*days/7*productFactor,load=sum(rows,'units')*.8;
  const production=pct(load,capacity);
  const quality=pct(rows.filter(o=>!o.defect).length,rows.length);
  const revPlan=prevRevenue*1.08||revenue||1;
  const revenueIndex=Math.round(revenue/revPlan*1000)/10;
  const margin=pct(revenue-cost,revenue);
  const conversion=pct(rows.length,sum(staff,'leads')*days/7*productFactor);
  const lead=rows.length?Math.round(sum(rows,'leadHours')/rows.length*10)/10:0;
  const values={customers:customers.size,orders:rows.length,moderation,production,quality,support,delivery,team:actualStaff};
  const kpis=KPI.map(k=>{
    const value=values[k.id];
    const threshold={moderation:30,production:90,quality:98,support:95,delivery:98,team:plannedStaff};
    const bad=k.id==='moderation'?value>30:['quality','support','delivery'].includes(k.id)?value<threshold[k.id]:k.id==='production'?value>90:false;
    let plan=threshold[k.id]??(k.id==='orders'?Math.round(prev.length*1.08):Math.round(customers.size*.95));
    const forecast=['customers','orders'].includes(k.id)?Math.round(value*1.08):value;
    return {...k,value:fmt(value),raw:value,unit:k.id==='team'?'/ '+fmt(plannedStaff):k.unit,plan,forecast:fmt(forecast),updatedAt:state.lastUpdated,state:bad?'Требует внимания':'В норме',trend:bad?'negative':'positive',change:k.id==='orders'?(prev.length?((rows.length/prev.length-1)*100).toFixed(1).replace('.',',')+'%':'Нет базы'):bad?'Ниже цели':'В норме',formula:k.id==='team'?'Сотрудники на смене в выбранном подразделении / план смены':k.formula,source:'Filesystem / '+(k.id==='support'?'interactions.csv':k.id==='team'?'staff.csv':'orders.csv'),sourceAt:state.lastUpdated};
  });
  const extra=(id,label,value,unit,icon,formula,source,plan,description,good=true)=>({id,label,value:fmt(value),raw:value,unit,icon,formula,source:'Filesystem / orders.csv',plan,forecast:fmt(value),description,state:good?'В норме':'Требует внимания',trend:good?'positive':'negative',change:good?'В норме':'Ниже цели',series:[25,31,28,36,33,39,40,45,42,46,44,51],updatedAt:state.lastUpdated,sourceAt:state.lastUpdated,owner:'Анна Смирнова'});
  kpis.push(
    extra('revenue','Оборот · индекс',revenueIndex,'','chart','Выручка периода / план выручки × 100; план = выручка прошлого периода × 1,08','1С / ERP',100,'план = 100',revenueIndex>=100),
    extra('margin','Валовая маржа',margin,'%','percent','(Выручка − себестоимость) / выручка × 100%','1С / Финансы',32,'доля в обороте',margin>=32),
    extra('newCustomers','Новые клиенты',newClients,'','userPlus','Клиенты с первым зарегистрированным контактом в выбранном периоде','CRM / Битрикс24',Math.ceil(customers.size*.1),'в выбранном периоде'),
    extra('defects','Брак / перепечатка',Math.round((100-quality)*10)/10,'%','scan','Заказы с браком / все заказы × 100%','ERP / Производство',2,'цель не более 2%',quality>=98),
    extra('repeat','Повторная покупка',repeat,'%','repeat','Клиенты с 2+ заказами в периоде / активные клиенты × 100%','CRM / ERP',25,'доля повторных клиентов',repeat>=25),
    extra('conversion','Конверсия',conversion,'%','filter','Принятые заказы / лиды за период × 100%','CRM / ERP',25,'из лида в заказ',conversion>=25),
    extra('leadTime','Lead time',lead,' ч','clock','Сумма длительностей заказов / количество заказов','ERP / Производство',36,'среднее время исполнения',lead<=36),
    extra('staffing','Обеспеченность',pct(actualStaff,plannedStaff),'%','team','Факт сотрудников смены / план сотрудников × 100%','HR / Персонал',85,'ресурс смены',pct(actualStaff,plannedStaff)>=85),
  );
  const buckets=period==='today'?8:period==='month'?4:7;
  const series=Array.from({length:buckets},(_,i)=>{
    const a=start+i*(now-start)/buckets,b=start+(i+1)*(now-start)/buckets;
    const count=data=>data.filter(o=>{const t=new Date(o.createdAt).getTime();return t>=a&&t<b;});
    const curr=count(rows),prior=prev.filter(o=>{const t=new Date(o.createdAt).getTime()+days*86400000;return t>=a&&t<b;});
    return {label:period==='today'?String(i*3).padStart(2,'0')+':00':period==='month'?`${i*7+1}–${(i+1)*7} дн.`:new Date(a).toLocaleDateString('ru-RU',{weekday:'short'}),orders:curr.length,customers:new Set(curr.map(o=>o.customerId)).size,previous:prior.length};
  });
  // Sparklines are cumulative calculations on the same filtered source rows.
  const microSeries=Array.from({length:12},(_,i)=>{
    const cutoff=start+(i+1)*(now-start)/12;
    const sample=rows.filter(o=>new Date(o.createdAt).getTime()<=cutoff),ids=new Set(sample.map(o=>o.id));
    const ts=tickets.filter(t=>ids.has(t.orderId));
    const done=sample.filter(o=>o.completed),r=sum(sample,'revenue'),sampleCustomers=new Set(sample.map(o=>o.customerId));
    const values={customers:new Set(sample.map(o=>o.customerId)).size,orders:sample.length,moderation:sample.filter(o=>o.stage===3).length,production:pct(sum(sample,'units')*.8,capacity*(i+1)/12),quality:pct(sample.filter(o=>!o.defect).length,sample.length),support:pct(ts.filter(t=>t.firstReplyMinutes<=15).length,ts.length),delivery:pct(done.filter(o=>o.onTime).length,done.length),team:actualStaff,revenue:pct(r,revPlan*(i+1)/12),margin:pct(r-sum(sample,'cost'),r),newCustomers:f.customers.filter(c=>sampleCustomers.has(c.id)&&new Date(c.createdAt).getTime()>=start).length,defects:pct(sample.filter(o=>o.defect).length,sample.length),repeat:repeat,conversion:pct(sample.length,sum(staff,'leads')*days/7*productFactor*(i+1)/12),leadTime:sample.length?sum(sample,'leadHours')/sample.length:0,staffing:pct(actualStaff,plannedStaff)};
    return values;
  });
  for(const k of kpis)k.series=microSeries.map(values=>values[k.id]||0);
  const unavailable={customers:!rows.length,orders:!rows.length,quality:!rows.length,support:!tickets.length,delivery:!completed.length,revenue:!prevRevenue,margin:!revenue,defects:!rows.length,repeat:!customers.size,leadTime:!rows.length};
  for(const k of kpis)if(unavailable[k.id])Object.assign(k,{value:'—',forecast:'—',state:'Нет данных',trend:'neutral',change:'Нет базы расчёта'});
  const weeklyDemand=Math.round(sum(rows,'units')*7/days)||0,weeklyCapacity=Math.round(sum(staff,'availableHours')/0.8*productFactor);
  const forecast=Array.from({length:4},(_,i)=>{const demand=Math.round(weeklyDemand*(1.06+i*.12)),available=Math.round(weeklyCapacity*(i===2?.9:1)),startAt=new Date(now+(i+1)*7*86400000);return {week:i+1,label:startAt.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}),demand,capacity:available,gap:available-demand};});
  const stageCounts=STAGES.map((name,i)=>({name,count:rows.filter(o=>o.stage===i).length}));
  const flow=rows.map(o=>({id:o.id,customerId:o.customerId,client:actor.role==='executive'?'Клиент '+o.customerId:'Тестовый клиент '+o.customerId,product:PRODUCTS.find(p=>p.id===o.productId).name,productId:o.productId,stage:o.stage,owner:o.department==='books'?'mikhail':o.department==='photo'?'daria':'igor',status:STAGES[o.stage],department:o.department,payment:o.paymentStatus==='paid'?'Оплачен':'Ожидает оплаты',createdAt:o.createdAt,updatedAt:o.createdAt,events:[]}));
  const channels=['Сайт','CRM','Партнёры'].map(name=>({name,orders:rows.filter(o=>o.channel===name).length,share:pct(rows.filter(o=>o.channel===name).length,rows.length)}));
  const segments=[{id:'b2b',name:'Бизнес'},{id:'b2c',name:'Частные клиенты'}].map(s=>({...s,count:f.customers.filter(c=>customers.has(c.id)&&c.segment===s.id).length}));
  const averageIndex=prev.length&&prevRevenue?Math.round((revenue/(rows.length||1))/(prevRevenue/prev.length)*1000)/10:100;
  const finance={revenueIndex,margin,costIndex:revenue?pct(cost,revenue):0,bdr:{plan:100,fact:revenueIndex},bdds:{plan:100,fact:revenue?pct(sum(rows.filter(o=>o.paymentStatus==='paid'),'revenue'),revenue):0},reconciliation:{matched:rows.filter(o=>o.paymentStatus===o.financeStatus).length,total:rows.length,mismatched:rows.filter(o=>o.paymentStatus!==o.financeStatus).length,status:'matched'},staff:plannedStaff,actual:actualStaff,vacancies:sum(staff,'openVacancies')*productFactor,absent:sum(staff,'absent')*productFactor};
  const qualityReport={orders:scoped?rows.length:f.orders.length,customers:scoped?customers.size:f.customers.length,interactions:scoped?tickets.length:f.interactions.length,missing:rows.filter(o=>!o.customerId||!o.productId).length,duplicates:rows.length-new Set(rows.map(o=>o.id)).size,reconciled:finance.reconciliation,generatedAt:f.generatedAt};
  const performance=actor.role==='executive'?managerPerformance(f.performance,days):null;
  const seriesForecast=Array.from({length:4},(_,i)=>({label:`+${i+1}`,orders:Math.round(rows.length/buckets*(1.06+i*.12)),customers:Math.round(customers.size/buckets*(1.06+i*.12))}));
  return {kpis,series,seriesForecast,forecast,performance,stageCounts,flow,channels,segments,finance,qualityReport,averageIndex,repeat,conversion,lead,productionPlan:Math.round(capacity/.8),productionFact:sum(rows,'units'),downtime:sum(rows,'downtimeMinutes'),filters:{period,department,product},departments:DEPARTMENTS.filter(d=>canAccessDepartment(actor,d.id)),products:PRODUCTS.filter(p=>canAccessDepartment(actor,p.department)&&(department==='all'||p.department===department)),totals:{orders:rows.length,customers:customers.size,tickets:tickets.length},empty:rows.length===0};
}

function managerPerformance(records,days){
  if(!records?.length)return null;
  const scaled=records.map(p=>({...p,hours:p.hours*days/7,completed:p.completed*days/7,rate:p.hours?p.completed/p.hours:0}));
  const employees=scaled.filter(p=>!p.isAgent),mary=scaled.find(p=>p.isAgent);
  const hours=employees.reduce((n,p)=>n+p.hours,0),averageRate=hours?employees.reduce((n,p)=>n+p.completed,0)/hours:0;
  return {employees,agent:mary,averageRate,multiplier:averageRate?mary.rate/averageRate:0,mode:'csv',formula:'Завершённые задачи / рабочие часы; сравнение со средневзвешенной производительностью сотрудников'};
}
