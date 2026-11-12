// Shared data contract: imports, diagnostics and source freshness use the same rules.
export const SOURCE_TABLES={orders:'orders',customers:'customers',interactions:'interactions',staff:'staff',performance:'performance',employees:'employees',responses:'responses',reviews:'reviews',finance_entries:'financeEntries',shifts:'shifts',leads:'leads',production_jobs:'productionJobs',production_work:'productionWork',downtime:'downtime'};
const REQUIRED={
 orders:['id','customerId','productId','department','createdAt','currency','market','regionId','managerId'],
 customers:['id','segment','channel','createdAt'],interactions:['id','orderId','customerId','department','createdAt','employeeId','topic','channel','status'],
 staff:['department'],performance:['id','name','direction'],employees:['id','name','department'],
 responses:['id','interactionId','orderId','employeeId','type','createdAt'],reviews:['id','orderId','customerId','createdAt','source'],
 finance_entries:['id','orderId','currency','createdAt','paymentStatus'],shifts:['id','department','startsAt','endsAt'],leads:['id','customerId','department','productId','market','regionId','channel','createdAt'],production_jobs:['id','orderId'],production_work:['id','jobId','orderId','startedAt','endedAt'],downtime:['id','department','productId','machineId','startedAt','endedAt','reason']
};
export function sourceTime(f,files){if(files.some(file=>f.sourcePresence?.[file.replace('.csv','')]===false))return null;const times=files.map(file=>f.sourceTimes?.[file]||f.sourceUpdatedAt||f.generatedAt).filter(Boolean);return times.length?times.sort()[0]:null;}
export function touchSources(f,files,at=new Date().toISOString()){f.sourceTimes??={};for(const file of files)f.sourceTimes[file]=at;f.sourceUpdatedAt=Object.values(f.sourceTimes).filter(Boolean).sort().at(-1)||at;}
export function inspectSources(f){
 const reports=[],issues=[];
 const add=(table,row,field,kind,message)=>issues.push({file:table+'.csv',row:row+2,field,kind,message});
 for(const [table,key] of Object.entries(SOURCE_TABLES)){
  const rows=f[key]||[],seen=new Set(),start=issues.length;if(f.sourcePresence?.[table]===false)add(table,-1,'источник','unavailable','Набор данных не предоставлен');
  rows.forEach((r,i)=>{
   const id=r.id||r.department;if(seen.has(id))add(table,i,'id','duplicate','Повторяющийся идентификатор');seen.add(id);
   for(const field of REQUIRED[table])if(r[field]==null||String(r[field]).trim()==='')add(table,i,field,'missing','Обязательное поле не заполнено');
   for(const [field,value] of Object.entries(r)){
    if(typeof value==='number'&&(!Number.isFinite(value)||value<0))add(table,i,field,'invalid','Ожидается конечное неотрицательное число');
    if(/At$/.test(field)&&value!=null&&(!Number.isFinite(Date.parse(value))||!/(Z|[+-]\d\d:\d\d)$/.test(value)))add(table,i,field,'invalid','Нужна дата ISO 8601 с часовым поясом');
   }
   if(r.currency&&r.currency!=='BYN')add(table,i,'currency','invalid','Ожидаются суммы в BYN');
   if(r.department&&!['books','photo','gifts',...(table==='employees'?['all']:[])].includes(r.department))add(table,i,'department','invalid','Неизвестное подразделение');
   if(table==='orders'){
    if(!['book','prints','canvas','calendar','cards'].includes(r.productId))add(table,i,'productId','invalid','Неизвестный продукт');
    if(!Number.isInteger(r.stage)||r.stage<0||r.stage>7)add(table,i,'stage','invalid','Этап от 0 до 7');
    if(r.completedAt&&Date.parse(r.completedAt)<Date.parse(r.createdAt))add(table,i,'completedAt','invalid','Завершение раньше создания');
   }
   if(table==='leads'){
    if(r.convertedAt&&!r.orderId)add(table,i,'orderId','reference','Выигранный лид должен ссылаться на заказ');
    const chain=['createdAt','qualifiedAt','quotedAt','convertedAt'].filter(k=>r[k]);for(let n=1;n<chain.length;n++)if(Date.parse(r[chain[n]])<Date.parse(r[chain[n-1]]))add(table,i,chain[n],'invalid','Нарушен порядок событий воронки');
    if(r.convertedAt&&(!r.quotedAt||!r.qualifiedAt)||r.quotedAt&&!r.qualifiedAt)add(table,i,'qualifiedAt','missing','Пропущено предыдущее событие воронки');
   }
   if(table==='production_jobs'){
    const chain=['queuedAt','startedAt','completedAt'].filter(k=>r[k]);for(let n=1;n<chain.length;n++)if(Date.parse(r[chain[n]])<Date.parse(r[chain[n-1]]))add(table,i,chain[n],'invalid','Нарушен порядок производственных событий');
    if(r.completedAt&&(!r.queuedAt||!r.startedAt)||r.startedAt&&!r.queuedAt)add(table,i,'queuedAt','missing','Нет начала производственного цикла');
    if(r.defectiveUnits>r.producedUnits||r.goodUnits!==r.producedUnits-r.defectiveUnits||r.reprintUnits>r.producedUnits)add(table,i,'producedUnits','invalid','Не согласованы выпуск, годные, дефектные и перепечатанные единицы');
   }
   if(['production_work','downtime'].includes(table)&&Date.parse(r.endedAt)<=Date.parse(r.startedAt))add(table,i,'endedAt','invalid','Окончание должно быть позже начала');
   if(table==='shifts'&&r.productMix){const mix=r.productMix;if(Array.isArray(mix)||typeof mix!=='object'||Object.values(mix).some(v=>!Number.isFinite(v)||v<0)||Math.abs(Object.values(mix).reduce((n,v)=>n+v,0)-1)>1e-9)add(table,i,'productMix','invalid','Доли продуктов должны быть неотрицательными и в сумме давать 1');}
   if(table==='shifts'&&!Number.isInteger(r.plannedUnits))add(table,i,'plannedUnits','invalid','План выпуска — целое число единиц');
   if(table==='shifts'&&(Date.parse(r.endsAt)<=Date.parse(r.startsAt)||r.actual>r.planned||r.absent>r.actual))add(table,i,'endsAt','invalid','Некорректные интервалы или состав смены');
  });
  reports.push({file:table+'.csv',available:f.sourcePresence?.[table]!==false,rows:rows.length,updatedAt:sourceTime(f,[table+'.csv']),issues:issues.slice(start)});
 }
 const maps=Object.fromEntries(Object.entries(SOURCE_TABLES).map(([table,key])=>[table,new Map((f[key]||[]).map(r=>[r.id||r.department,r]))]));
 const fk=(table,field,target)=>{(f[SOURCE_TABLES[table]]||[]).forEach((r,i)=>{if(!maps[target].has(r[field]))add(table,i,field,'reference','Связанная запись не найдена');});};
 for(const [table,field,target] of [['orders','customerId','customers'],['orders','managerId','employees'],['interactions','orderId','orders'],['interactions','customerId','customers'],['interactions','employeeId','employees'],['reviews','orderId','orders'],['reviews','customerId','customers'],['responses','orderId','orders'],['responses','interactionId','interactions'],['responses','employeeId','employees'],['finance_entries','orderId','orders'],['shifts','department','staff'],['leads','customerId','customers'],['production_jobs','orderId','orders'],['production_work','jobId','production_jobs'],['production_work','orderId','orders']])fk(table,field,target);
 for(const [i,l] of (f.leads||[]).entries())if(l.orderId&&!maps.orders.has(l.orderId))add('leads',i,'orderId','reference','Заказ лида не найден');
 for(const [i,w] of (f.productionWork||[]).entries())if(maps.production_jobs.get(w.jobId)?.orderId!==w.orderId)add('production_work',i,'orderId','reference','Заказ не соответствует заданию');
 for(const report of reports){report.issues=issues.filter(i=>i.file===report.file);report.missing=report.issues.filter(i=>i.kind==='missing').length;report.duplicates=report.issues.filter(i=>i.kind==='duplicate').length;report.invalid=report.issues.filter(i=>!['missing','duplicate'].includes(i.kind)).length;}
 return {sources:reports,issues,missing:issues.filter(i=>i.kind==='missing').length,duplicates:issues.filter(i=>i.kind==='duplicate').length,invalid:issues.filter(i=>!['missing','duplicate'].includes(i.kind)).length};
}
export function validateSources(f){const q=inspectSources(f);const fatal=q.issues.filter(i=>i.kind!=='unavailable');if(fatal.length){const e=fatal[0];throw new Error(`${e.file}, строка ${e.row}, ${e.field}: ${e.message}`);}return q;}
