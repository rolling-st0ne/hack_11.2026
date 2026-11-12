import { REGIONS } from './regions.mjs';
import {SOURCE_TABLES} from './data-contract.mjs';

export const REPORTING_TZ='Europe/Minsk';
export const DAY_MS=86400000;
export const EMPLOYEE_DIRECTORY=[
 {id:'mikhail',name:'Михаил Козлов',department:'books',isAgent:false},
 {id:'anna',name:'Анна Смирнова',department:'books',isAgent:false},
 {id:'daria',name:'Дарья Соколова',department:'photo',isAgent:false},
 {id:'olga',name:'Ольга Миронова',department:'photo',isAgent:false},
 {id:'igor',name:'Игорь Петров',department:'gifts',isAgent:false},
 {id:'pavel',name:'Павел Орлов',department:'gifts',isAgent:false},
 {id:'mary',name:'Mary',department:'all',isAgent:true}
];
export const roundReport=n=>Math.round(n*10)/10;
export const reportPercent=(n,d)=>d?roundReport(n/d*100):null;
export function quantile(values,p){if(!values.length)return null;const a=[...values].sort((a,b)=>a-b),i=(a.length-1)*p,lo=Math.floor(i);return roundReport(a[lo]+(a[Math.ceil(i)]-a[lo])*(i-lo));}
export function responseDistribution(values){return {n:values.length,mean:values.length?roundReport(values.reduce((a,b)=>a+b,0)/values.length):null,p50:quantile(values,.5),p90:quantile(values,.9),p95:quantile(values,.95)};}
export function workingTime(iso){const d=new Date(new Date(iso).getTime()+3*3600000);return d.getUTCDay()>0&&d.getUTCDay()<6&&d.getUTCHours()>=9&&d.getUTCHours()<18;}
// One-time expansion of the synthetic v3 fixture. Imported v4 values are never regenerated.
export function enrichFacts(f){
 f.sourceUpdatedAt??=f.generatedAt;
 f.financeEntries??=f.orders.map(o=>({id:'FIN-'+o.id,orderId:o.id,currency:o.currency,createdAt:o.createdAt,paymentStatus:o.financeStatus,plannedIncome:Math.round(o.revenue*1.03),plannedCost:Math.round(o.cost*.97),plannedInflow:o.revenue,plannedOutflow:o.cost,actualIncome:o.revenue,actualCost:o.cost,actualInflow:o.financeStatus==='paid'?o.revenue:0,actualOutflow:o.completed?o.cost:0}));
 if(f.reportingVersion>=4)return enrichPlanning(f);
 f.employees??=structuredClone(EMPLOYEE_DIRECTORY);
 const regionPools={BY:REGIONS.filter(r=>r.market==='BY'),RU:REGIONS.filter(r=>r.market==='RU')};
 const popular=['RU-MOW','RU-MOS','RU-SPE','RU-SMO','RU-BRY','RU-KDA','RU-ROS','RU-NIZ','RU-SVE','RU-TA'];
 f.orders.forEach((o,i)=>{
  const market=i%5<3?'BY':'RU',pool=regionPools[market];
  o.market??=market;o.regionId??=market==='RU'&&i%4?popular[Math.floor(i/5)%popular.length]:pool[Math.floor(i/5)%pool.length].id;
  const people=f.employees.filter(p=>p.department===o.department&&!p.isAgent);
  o.managerId??=people[Math.floor(i/5)%people.length].id;
 });
 const byId=new Map(f.orders.map(o=>[o.id,o]));
 f.interactions.forEach((t,i)=>{const o=byId.get(t.orderId);if(!o)return;t.employeeId??=i%4===0?'mary':o.managerId;t.botAssisted??=i%4===0||i%7===0;t.handedOff??=t.employeeId==='mary'&&i%3===0;});
 f.responses??=f.interactions.flatMap((t,i)=>Array.from({length:1+i%3},(_,j)=>({id:`REP-${i}-${j}`,interactionId:t.id,orderId:t.orderId,employeeId:j&&t.handedOff?byId.get(t.orderId).managerId:t.employeeId,type:j===0?'first_reply':j===1?'clarification':'resolution',createdAt:new Date(Date.parse(t.createdAt)+(t.firstReplyMinutes+j*7)*60000).toISOString()})));
 f.reviews??=f.orders.filter((o,i)=>o.completed&&i%5===0).map((o,i)=>({id:'REV-'+o.id,orderId:o.id,customerId:o.customerId,rating:o.defect?2:i%7===0?3:i%3===0?4:5,topic:o.defect?'Качество':i%7===0?'Доставка':'Сервис',text:o.defect?'Нужна повторная печать: заметны полосы на изображении.':i%7===0?'Печать хорошая, но доставка заняла больше времени.':i%3===0?'Заказ получили, качество соответствует ожиданиям.':'Спасибо за помощь с макетом и качественную печать.',createdAt:new Date(Math.min(Date.parse(f.generatedAt),Date.parse(o.createdAt)+o.leadHours*3600000)).toISOString(),source:'Тестовая анкета'}));
 f.reportingVersion=4;return enrichPlanning(f);
}
export function reportingWindow(filters={},now=Date.now()){
 const day=new Date(now+3*3600000).toISOString().slice(0,10);
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 const period=['today','week','month','custom'].includes(filters.period)?filters.period:'week';
 const to=period==='custom'?filters.to:day;
 const from=period==='custom'?filters.from:new Date(Date.parse(day+'T00:00:00+03:00')-({today:0,week:6,month:27}[period])*DAY_MS+3*3600000).toISOString().slice(0,10);
 if(!validDate(from)||!validDate(to))throw new RangeError('Укажите корректные даты начала и конца периода.');
 const start=Date.parse(from+'T00:00:00+03:00'),end=Date.parse(to+'T00:00:00+03:00')+DAY_MS,days=(end-start)/DAY_MS;
 if(days<1||days>366)throw new RangeError('Период должен быть от 1 до 366 дней; начало не позже конца.');
 const market=filters.market||'all',region=filters.region||'all';
 if(!['all','BY','RU'].includes(market))throw new RangeError('Неизвестный рынок.');
 if(region!=='all'&&!REGIONS.some(r=>r.id===region&&(market==='all'||r.market===market)))throw new RangeError('Регион не относится к выбранному рынку.');
 return {period,from,to,start,end,days,market,region,timezone:REPORTING_TZ};
}
export function staffReport(f,orders,tickets,start,end,actor,relevant){
 if(!['executive','manager'].includes(actor.role))return null;
 const ids=new Set(tickets.map(t=>t.id));
 const replies=f.responses.filter(r=>ids.has(r.interactionId)&&Date.parse(r.createdAt)>=start&&Date.parse(r.createdAt)<end);
 const slice=(ts,rs,os)=>{
  const work=ts.filter(t=>workingTime(t.createdAt)),times=ts.map(t=>t.firstReplyMinutes).filter(Number.isFinite);
  return {tickets:ts.length,resolved:ts.filter(t=>t.status==='resolved').length,sla:reportPercent(ts.filter(t=>t.firstReplyMinutes<=15).length,ts.length),response:responseDistribution(times),replies:rs.length,workingReplies:rs.filter(r=>workingTime(r.createdAt)).length,workingTickets:work.length,workingSla:reportPercent(work.filter(t=>t.firstReplyMinutes<=15).length,work.length),orders:os.length,types:['first_reply','clarification','resolution'].map(type=>({type,count:rs.filter(r=>r.type===type).length})),topics:[...new Set(ts.map(t=>t.topic))].map(topic=>{const rows=ts.filter(t=>t.topic===topic);return {topic,count:rows.length,sla:reportPercent(rows.filter(t=>t.firstReplyMinutes<=15).length,rows.length),response:responseDistribution(rows.map(t=>t.firstReplyMinutes))};})};
 };
 const members=f.employees.filter(e=>e.isAgent||relevant({department:e.department})).map(e=>({...e,...slice(tickets.filter(t=>t.employeeId===e.id),replies.filter(r=>r.employeeId===e.id),orders.filter(o=>o.managerId===e.id))}));
 const people=members.filter(e=>!e.isAgent).sort((a,b)=>(b.sla??-1)-(a.sla??-1)||(a.response.mean??Infinity)-(b.response.mean??Infinity)||b.tickets-a.tickets);
 const bots=members.filter(e=>e.isAgent).map(e=>{const ts=tickets.filter(t=>t.employeeId===e.id);return {...e,autonomous:ts.filter(t=>t.status==='resolved'&&!t.handedOff).length,handoffs:ts.filter(t=>t.handedOff).length,autonomousShare:reportPercent(ts.filter(t=>t.status==='resolved'&&!t.handedOff).length,ts.length)};});
 const daily=[];for(let a=start;a<end;a+=DAY_MS){const b=a+DAY_MS,ts=tickets.filter(t=>Date.parse(t.createdAt)>=a&&Date.parse(t.createdAt)<b);daily.push({date:new Date(a+3*3600000).toISOString().slice(0,10),...slice(ts,replies.filter(r=>Date.parse(r.createdAt)>=a&&Date.parse(r.createdAt)<b),orders.filter(o=>Date.parse(o.createdAt)>=a&&Date.parse(o.createdAt)<b))});}
 return {people,bots,daily,summary:slice(tickets,replies,orders),ranking:'Доля SLA ↓, затем среднее время ответа ↑, затем число обращений ↓. Сотрудники без обращений — вне рейтинга.',workSchedule:'Пн–пт, 09:00–18:00, Europe/Minsk (UTC+3). SLA: первый ответ ≤ 15 календарных минут. Рабочий SLA — по обращениям, поступившим в рабочее время.',replyScope:'Ответы за период по обращениям, созданным в этом же периоде.'};
}

// Add an explicitly synthetic schedule to legacy fixtures without rewriting imported facts.
export function enrichPlanning(f){
 f.sourceTimes??={};for(const file of Object.keys(SOURCE_TABLES))f.sourceTimes[file+'.csv']??=f.sourceUpdatedAt||f.generatedAt;
 if(!f.shifts){
  const day=Date.parse(new Date(Date.parse(f.generatedAt)+10800000).toISOString().slice(0,10)+'T00:00:00+03:00');
  f.shifts=[];
  for(let offset=-70;offset<=35;offset++){
   const d=new Date(day+offset*DAY_MS+10800000),weekday=d.getUTCDay();if(!weekday||weekday===6)continue;
   const date=d.toISOString().slice(0,10);
   for(const s of f.staff){const startsAt=date+'T09:00:00+03:00',endsAt=date+'T18:00:00+03:00',availableHours=s.availableHours/5*(offset>=15&&offset<=21?.9:1);
    f.shifts.push({id:'SHIFT-'+date+'-'+s.department,department:s.department,startsAt,endsAt,planned:s.planned,actual:s.actual,absent:s.absent,availableHours,plannedUnits:Math.round(availableHours/.8),source:'Синтетический календарь, норма 0,8 ч/ед.'});
   }
  }
 }
 return f;
}
export function shiftHours(shifts,start,end){return shifts.reduce((total,s)=>{const a=Date.parse(s.startsAt),b=Date.parse(s.endsAt);return total+Math.max(0,Math.min(end,b)-Math.max(start,a))/(b-a)*s.availableHours;},0);}
