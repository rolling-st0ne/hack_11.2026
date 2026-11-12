// Business events are separate from orders and plans. These generators run only
// for explicitly synthetic data, never as a replacement for missing imported facts.
const HOUR=3600000,DAY=86400000;
const iso=n=>new Date(n).toISOString();
const instant=s=>s==null?NaN:Date.parse(s);
const inRange=(s,a,b)=>instant(s)>=a&&instant(s)<b;
const before=(s,b)=>Number.isFinite(instant(s))&&instant(s)<b;
const total=(rows,key)=>rows.reduce((v,r)=>v+(Number.isFinite(r[key])?r[key]:0),0);
const percent=(n,d)=>d>0?Math.round(n/d*1000)/10:null;
const distinct=rows=>[...new Map(rows.map(r=>[r.id,r])).values()];
export const BUSINESS_SCHEMAS={
 interactions:{firstReplyMinutes:"number?"},
 leads:{id:'string',customerId:'string',department:'string',productId:'string',market:'string',regionId:'string',channel:'string',createdAt:'string',qualifiedAt:'string?',quotedAt:'string?',convertedAt:'string?',lostAt:'string?',orderId:'string?'},
 production_jobs:{id:'string',orderId:'string',queuedAt:'string?',startedAt:'string?',completedAt:'string?',cancelledAt:'string?',producedUnits:'number',defectiveUnits:'number',reprintUnits:'number',goodUnits:'number'},
 production_work:{id:'string',jobId:'string',orderId:'string',startedAt:'string',endedAt:'string',machineHours:'number'},
 downtime:{id:'string',department:'string',productId:'string',machineId:'string',startedAt:'string',endedAt:'string',reason:'string'}
};
export function seedBusinessSources(f){
 const now=instant(f.generatedAt),products=[...new Map(f.orders.map(o=>[o.productId,{id:o.productId,department:o.department}])).values()];
 f.productionJobs=[];f.productionWork=[];f.leads=[];f.downtime=[];
 for(const [i,o] of f.orders.entries()){
  // This is a synthetic fixture upgrade: monetary facts and identifiers stay intact.
  if(o.stage<2)o.stage=2;
  const created=instant(o.createdAt),elapsed=Math.max(0,now-created),target=Math.min(elapsed,Math.max(8,o.leadHours||24)*HOUR);
  const queued=created+Math.min(target*.1,(o.moderationMinutes||30)*60000),started=created+target*.4,released=created+target*.8;
  o.moderationHoldReason=o.stage===3?(o.moderationHoldReason||'Нет свободного модератора для проверки макета'):null;
  o.moderationQueuedAt=o.stage>=3?o.createdAt:null;o.moderatedAt=o.stage>=4?iso(queued):null;
  o.productionCompletedAt=o.stage>=5?iso(released):null;
  o.completed=o.stage>=6;o.completedAt=o.completed?iso(created+target):null;
  o.promisedAt??=iso(created+48*HOUR);o.onTime=o.completed&&instant(o.completedAt)<=instant(o.promisedAt);
  const job={id:'JOB-'+o.id,orderId:o.id,queuedAt:o.moderatedAt,startedAt:o.stage>=5||o.stage===4&&i%2===0?iso(started):null,completedAt:o.productionCompletedAt,cancelledAt:null,producedUnits:0,defectiveUnits:0,reprintUnits:0,goodUnits:0};
  if(job.completedAt){job.defectiveUnits=o.defect?1:0;job.reprintUnits=o.defect&&i%2===0?1:0;job.producedUnits=o.units+job.reprintUnits;job.goodUnits=job.producedUnits-job.defectiveUnits;}
  f.productionJobs.push(job);
  if(job.startedAt){const end=job.completedAt?instant(job.completedAt):Math.min(now,started+Math.max(.25,o.units*.72)*HOUR);if(end>started)f.productionWork.push({id:'WORK-'+o.id,jobId:job.id,orderId:o.id,startedAt:job.startedAt,endedAt:iso(end),machineHours:Math.round(Math.min((end-started)/HOUR,o.units*(.64+i%7*.03))*100)/100});}
  const leadAt=created-(8+i%24)*HOUR;
  f.leads.push({id:'LEAD-'+o.id,customerId:o.customerId,department:o.department,productId:o.productId,market:o.market,regionId:o.regionId,channel:o.channel,createdAt:iso(leadAt),qualifiedAt:iso(leadAt+HOUR),quotedAt:iso(leadAt+3*HOUR),convertedAt:o.createdAt,lostAt:null,orderId:o.id});
 }
 for(let i=0;i<900;i++){
  const o=f.orders[i%f.orders.length],at=now-(i%56)*DAY-(1+i%18)*HOUR,qualified=i%3!==0,quoted=qualified&&i%2===0;
  f.leads.push({id:'LEAD-OPEN-'+i,customerId:o.customerId,department:o.department,productId:o.productId,market:o.market,regionId:o.regionId,channel:['Сайт','CRM','Партнёры'][i%3],createdAt:iso(at),qualifiedAt:qualified?iso(Math.min(now,at+HOUR)):null,quotedAt:quoted?iso(Math.min(now,at+3*HOUR)):null,convertedAt:null,lostAt:i%5===0?iso(Math.min(now,at+5*HOUR)):null,orderId:null});
 }
 const start=Math.min(...f.orders.map(o=>instant(o.createdAt)));
 for(let i=0,t=start;t<now;t+=2*DAY,i++){const p=products[i%products.length],duration=(20+i%45)*60000;f.downtime.push({id:'DOWN-'+i,department:p.department,productId:p.id,machineId:'LINE-'+p.id,startedAt:iso(t),endedAt:iso(Math.min(now,t+duration)),reason:i%2?'Замена расходного материала':'Незапланированная остановка оборудования'});}
 for(const shift of f.shifts||[]){const ps=products.filter(p=>p.department===shift.department);shift.productMix??=Object.fromEntries(ps.map(p=>[p.id,1/ps.length]));}
 f.sourcePresence={...f.sourcePresence,leads:true,production_jobs:true,production_work:true,downtime:true};f.semanticVersion=1;return f;
}
export function businessContext(f,{orders,leads,shifts,factor=1,downtime,resourceScope=true}){
 const orderMap=new Map(orders.map(o=>[o.id,o])),ids=new Set(orderMap.keys());
 const jobs=distinct(f.productionJobs||[]).filter(j=>ids.has(j.orderId)),jobIds=new Set(jobs.map(j=>j.id));
 const work=distinct(f.productionWork||[]).filter(w=>jobIds.has(w.jobId)&&ids.has(w.orderId));
 const coveredJobs=f.sourcePresence?.production_jobs??Array.isArray(f.productionJobs),coveredLeads=f.sourcePresence?.leads??Array.isArray(f.leads),coveredWork=f.sourcePresence?.production_work??Array.isArray(f.productionWork);
 const overlap=(r,a,b)=>instant(r.endedAt)>instant(r.startedAt)?Math.max(0,Math.min(instant(r.endedAt),b)-Math.max(instant(r.startedAt),a)):0;
 const endMilestone=(r,key,b)=>before(r[key],b);
 function measure(a,b){
  const ls=leads.filter(l=>inRange(l.createdAt,a,b));
  const funnel=[ls.length,ls.filter(l=>endMilestone(l,'qualifiedAt',b)).length,ls.filter(l=>endMilestone(l,'quotedAt',b)).length,ls.filter(l=>endMilestone(l,'convertedAt',b)&&ids.has(l.orderId)).length];
  const released=jobs.filter(j=>inRange(j.completedAt,a,b)&&(!j.cancelledAt||instant(j.cancelledAt)>=instant(j.completedAt)));
  const delivered=orders.filter(o=>o.completed===true&&inRange(o.completedAt,a,b)&&Number.isFinite(instant(o.promisedAt)));
  const queued=jobs.filter(j=>before(j.queuedAt,b)&&!before(j.startedAt,b)&&!before(j.completedAt,b)&&!before(j.cancelledAt,b));
  const inProgress=jobs.filter(j=>before(j.startedAt,b)&&!before(j.completedAt,b)&&!before(j.cancelledAt,b));
  const cycleHours=released.filter(j=>Number.isFinite(instant(j.queuedAt))).map(j=>(instant(j.completedAt)-instant(j.queuedAt))/HOUR);
  const capacityShifts=shifts.filter(s=>instant(s.endsAt)>a&&instant(s.startsAt)<b);
  const scheduleCovered=!!f.capacityCoverage&&instant(f.capacityCoverage.from)<=a&&instant(f.capacityCoverage.to)>=b;
  const available=resourceScope&&scheduleCovered&&capacityShifts.every(s=>Number.isFinite(s.availableHours))?capacityShifts.reduce((n,s)=>n+Math.max(0,Math.min(instant(s.endsAt),b)-Math.max(instant(s.startsAt),a))/(instant(s.endsAt)-instant(s.startsAt))*s.availableHours,0)*factor:null;
  const plannedShifts=shifts.filter(s=>inRange(s.endsAt,a,b));
  const plan=resourceScope&&scheduleCovered&&plannedShifts.every(s=>Number.isFinite(s.plannedUnits))?total(plannedShifts,'plannedUnits')*factor:null;
  const machineHours=coveredWork?work.filter(w=>instant(w.endedAt)>instant(w.startedAt)&&Number.isFinite(w.machineHours)).reduce((n,w)=>n+overlap(w,a,b)/(instant(w.endedAt)-instant(w.startedAt))*w.machineHours,0):null;
  const produced=total(released,'producedUnits'),bad=total(released,'defectiveUnits');
  const downMinutes=resourceScope&&(f.sourcePresence?.downtime??Array.isArray(f.downtime))?downtime.reduce((n,d)=>n+overlap(d,a,b)/60000,0):null;
  return {funnel:coveredLeads?funnel:null,leads:ls,conversion:coveredLeads?percent(funnel[3],funnel[0]):null,productionPlan:plan,productionFact:coveredJobs?total(released,'goodUnits'):null,producedUnits:coveredJobs?produced:null,defectiveUnits:coveredJobs?bad:null,reprintCount:coveredJobs?total(released,'reprintUnits'):null,quality:coveredJobs?percent(produced-bad,produced):null,defects:coveredJobs?percent(bad,produced):null,delivery:percent(delivered.filter(o=>instant(o.completedAt)<=instant(o.promisedAt)).length,delivered.length),deliveredCount:delivered.length,production:machineHours===null||available===null?null:percent(machineHours,available),machineHours,availableHours:available,downtime:downMinutes,queue:coveredJobs?queued.length:null,inProgress:coveredJobs?inProgress.length:null,queueRows:queued,releaseRows:released,cycleHours,leadTime:cycleHours.length?Math.round(cycleHours.reduce((a,b)=>a+b,0)/cycleHours.length*10)/10:null};
 }
 const cache=new Map();return {measure(a,b){const key=a+':'+b;if(!cache.has(key))cache.set(key,measure(a,b));return cache.get(key);},jobs,work,coveredJobs,coveredLeads};
}

export function allocateShift(shift,product){
 if(product==='all')return shift;
 const mix=shift.productMix;if(!mix||!Number.isFinite(mix[product]))return {...shift,availableHours:null,plannedUnits:null};
 const products=Object.keys(mix),last=products.at(-1);const units=product===last?shift.plannedUnits-products.slice(0,-1).reduce((n,id)=>n+Math.round(shift.plannedUnits*mix[id]),0):Math.round(shift.plannedUnits*mix[product]);
 return {...shift,availableHours:shift.availableHours*mix[product],plannedUnits:units};
}
