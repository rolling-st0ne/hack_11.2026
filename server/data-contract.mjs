// Shared data contract: imports, diagnostics and source freshness use the same rules.
export const SOURCE_TABLES={orders:'orders',customers:'customers',interactions:'interactions',staff:'staff',performance:'performance',employees:'employees',responses:'responses',reviews:'reviews',finance_entries:'financeEntries',shifts:'shifts'};
const REQUIRED={
 orders:['id','customerId','productId','department','createdAt','currency','market','regionId','managerId'],
 customers:['id','segment','channel','createdAt'],interactions:['id','orderId','customerId','department','createdAt','employeeId','topic','channel','status'],
 staff:['department'],performance:['id','name','direction'],employees:['id','name','department'],
 responses:['id','interactionId','orderId','employeeId','type','createdAt'],reviews:['id','orderId','customerId','createdAt','source'],
 finance_entries:['id','orderId','currency','createdAt','paymentStatus'],shifts:['id','department','startsAt','endsAt']
};
export function sourceTime(f,files){const times=files.map(file=>f.sourceTimes?.[file]||f.sourceUpdatedAt||f.generatedAt).filter(Boolean);return times.length?times.sort()[0]:null;}
export function touchSources(f,files,at=new Date().toISOString()){f.sourceTimes??={};for(const file of files)f.sourceTimes[file]=at;f.sourceUpdatedAt=Object.values(f.sourceTimes).filter(Boolean).sort().at(-1)||at;}
export function inspectSources(f){
 const reports=[],issues=[];
 const add=(table,row,field,kind,message)=>issues.push({file:table+'.csv',row:row+2,field,kind,message});
 for(const [table,key] of Object.entries(SOURCE_TABLES)){
  const rows=f[key]||[],seen=new Set(),start=issues.length;
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
   if(table==='shifts'&&(Date.parse(r.endsAt)<=Date.parse(r.startsAt)||r.actual>r.planned||r.absent>r.actual))add(table,i,'endsAt','invalid','Некорректные интервалы или состав смены');
  });
  reports.push({file:table+'.csv',rows:rows.length,updatedAt:sourceTime(f,[table+'.csv']),issues:issues.slice(start)});
 }
 const maps=Object.fromEntries(Object.entries(SOURCE_TABLES).map(([table,key])=>[table,new Map((f[key]||[]).map(r=>[r.id||r.department,r]))]));
 const fk=(table,field,target)=>{(f[SOURCE_TABLES[table]]||[]).forEach((r,i)=>{if(!maps[target].has(r[field]))add(table,i,field,'reference','Связанная запись не найдена');});};
 for(const [table,field,target] of [['orders','customerId','customers'],['orders','managerId','employees'],['interactions','orderId','orders'],['interactions','customerId','customers'],['interactions','employeeId','employees'],['reviews','orderId','orders'],['reviews','customerId','customers'],['responses','orderId','orders'],['responses','interactionId','interactions'],['responses','employeeId','employees'],['finance_entries','orderId','orders'],['shifts','department','staff']])fk(table,field,target);
 for(const report of reports){report.issues=issues.filter(i=>i.file===report.file);report.missing=report.issues.filter(i=>i.kind==='missing').length;report.duplicates=report.issues.filter(i=>i.kind==='duplicate').length;report.invalid=report.issues.filter(i=>!['missing','duplicate'].includes(i.kind)).length;}
 return {sources:reports,issues,missing:issues.filter(i=>i.kind==='missing').length,duplicates:issues.filter(i=>i.kind==='duplicate').length,invalid:issues.filter(i=>!['missing','duplicate'].includes(i.kind)).length};
}
export function validateSources(f){const q=inspectSources(f);if(q.issues.length){const e=q.issues[0];throw new Error(`${e.file}, строка ${e.row}, ${e.field}: ${e.message}`);}return q;}
