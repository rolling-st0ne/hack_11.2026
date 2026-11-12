import {canAccessDepartment} from './seed.mjs';
import {DEPARTMENTS,PRODUCTS} from './analytics.mjs';
import {reportingWindow} from './reporting.mjs';
import {sourceTime} from './data-contract.mjs';
import {fail} from './protocol.mjs';
const FIELDS={
  orders:{units:['number','count'],stage:['number','count'],completed:['boolean'],onTime:['boolean'],defect:['boolean'],leadHours:['number','hours'],moderationMinutes:['number','minutes'],revenue:['number','BYN'],cost:['number','BYN'],market:['string'],regionId:['string'],department:['string'],productId:['string'],channel:['string']},
  interactions:{firstReplyMinutes:['number','minutes'],botAssisted:['boolean'],handedOff:['boolean'],topic:['string']},
  reviews:{rating:['number','score']}
};
const UNIT_LABEL={count:'',BYN:' BYN',percent:'%',ratio:'',minutes:' мин',hours:' ч',score:' / 5'};
export const mayEdit=actor=>['executive','manager'].includes(actor.role);
export function availableFields(actor){
  const financial=['executive','analyst'].includes(actor.role)||actor.key==='sergey';
  return Object.entries(FIELDS).map(([source,fields])=>({source,file:source+'.csv',fields:Object.entries(fields).filter(([name])=>financial||!['revenue','cost'].includes(name)).map(([name,[type,unit]])=>({name,type,unit:unit||null}))}));
}
const shape=(value,allowed)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail(422,'Недопустимая структура определения.','invalid_definition');};
export function validateScope(actor,scope,edit=false){
  shape(scope,['type','department']);
  if(scope.type==='company'&&scope.department===undefined){if(edit&&actor.role!=='executive')fail(403,'Общий контур изменяет только директор.','forbidden');return;}
  if(scope.type!=='department'||!DEPARTMENTS.some(d=>d.id===scope.department))fail(422,'Укажите company или существующее department.','invalid_scope');
  if(!canAccessDepartment(actor,scope.department))fail(403,'Направление недоступно.','forbidden');
}
export function validateMetric(actor,input,{edit=true}={}){
  if(edit&&!mayEdit(actor))fail(403,'Метрики изменяют только директор и руководители направлений.','forbidden');
  shape(input,['id','label','source','expression','unit','scope','target','better','description']);
  if(typeof input.id!=='string'||!/^custom_[a-z][a-z0-9_]{1,48}$/.test(input.id))fail(422,'ID: custom_ и 2–49 латинских букв, цифр или _. Встроенные KPI защищены.','invalid_metric_id');
  if(typeof input.label!=='string'||input.label.trim().length<3||input.label.length>100||/[<>]/.test(input.label))fail(422,'Название: 3–100 символов без HTML.');
  if(typeof input.description!=='undefined'&&(typeof input.description!=='string'||input.description.length>500))fail(422,'Описание до 500 символов.');
  validateScope(actor,input.scope,edit);
  const source=availableFields(actor).find(s=>s.source===input.source);if(!source)fail(422,'Неизвестный источник.','invalid_source');
  if(!Object.hasOwn(UNIT_LABEL,input.unit))fail(422,'Неизвестная единица измерения.','invalid_unit');
  if(input.target!=null&&(!Number.isFinite(input.target)||Math.abs(input.target)>1e12))fail(422,'Цель должна быть конечным числом.');
  if(input.better&&!['higher','lower'].includes(input.better))fail(422,'better: higher или lower.');
  let nodes=0;const dependencies=new Set();
  function field(name){const found=source.fields.find(f=>f.name===name);if(!found)fail(403,'Поле недоступно: '+String(name).slice(0,80),'forbidden_field');dependencies.add(name);return found;}
  function walk(node,depth=0){
    if(++nodes>64||depth>8)fail(422,'Формула превышает предел сложности (64 узла, глубина 8).','formula_complexity');
    if(['add','subtract','multiply','divide'].includes(node?.op)){
      shape(node,['op','left','right']);const a=walk(node.left,depth+1),b=walk(node.right,depth+1);
      if(['add','subtract'].includes(node.op)){if(a!==b)fail(422,'Складывать и вычитать можно одинаковые единицы.','unit_mismatch');return a;}
      if(node.op==='multiply'){if(a!=='ratio'&&b!=='ratio')fail(422,'Умножение допускается только на безразмерное число.','unit_mismatch');return a==='ratio'?b:a;}
      if(a===b)return 'ratio';if(b==='ratio')return a;fail(422,'Недопустимые единицы деления.','unit_mismatch');
    }
    if(node?.op==='constant'){shape(node,['op','value']);if(!Number.isFinite(node.value)||Math.abs(node.value)>1e9)fail(422,'Константа должна быть числом в пределах ±1e9.');return 'ratio';}
    shape(node,['op','field','where','p']);
    if(!['count','sum','avg','min','max','percentile'].includes(node.op))fail(422,'Неизвестная операция. SQL, JavaScript и произвольный код запрещены.','invalid_operation');
    if(node.where!==undefined){if(!Array.isArray(node.where)||node.where.length>10)fail(422,'where: до 10 условий.');for(const test of node.where){shape(test,['field','op','value']);const f=field(test.field);if(!['eq','ne','lt','lte','gt','gte'].includes(test.op)||typeof test.value!==f.type||typeof test.value==='number'&&!Number.isFinite(test.value)||typeof test.value==='string'&&test.value.length>80||f.type!=='number'&&!['eq','ne'].includes(test.op))fail(422,'Некорректное условие отбора.');}}
    if(node.op==='count'){if(node.field!==undefined||node.p!==undefined)fail(422,'count не принимает field или p.');return 'count';}
    const f=field(node.field);if(f.type!=='number')fail(422,'Агрегация требует числового поля.');
    if(node.op==='percentile'){if(![50,90,95,99].includes(node.p))fail(422,'Допустимы P50/P90/P95/P99.');}else if(node.p!==undefined)fail(422,'p применяется только к percentile.');
    return f.unit;
  }
  const unit=walk(input.expression);
  if(unit!==input.unit&&!(unit==='ratio'&&input.unit==='percent'))fail(422,`Формула возвращает ${unit}, а указано ${input.unit}.`,'unit_mismatch');
  return {...structuredClone(input),label:input.label.trim(),target:input.target??null,better:input.better||'higher',description:input.description||'',dependencies:[...dependencies]};
}
export function metricInput(record){return Object.fromEntries(['id','label','source','expression','unit','scope','target','better','description'].map(k=>[k,record[k]]));}
export function visibleMetric(actor,record){try{validateMetric(actor,metricInput(record),{edit:false});return true;}catch{return false;}}
export function metricRows(state,actor,definition,filters={}){
  const w=reportingWindow(filters),department=filters.department||'all',product=filters.product||'all';
  if(department!=='all'&&!DEPARTMENTS.some(d=>d.id===department)||product!=='all'&&!PRODUCTS.some(p=>p.id===product))fail(422,'Неизвестный фильтр.','invalid_filters');
  if(department!=='all'&&!canAccessDepartment(actor,department))fail(403,'Направление фильтра недоступно.','forbidden');
  const orders=state.facts.orders.filter(o=>canAccessDepartment(actor,o.department)&&(definition.scope.type==='company'||o.department===definition.scope.department)&&(department==='all'||o.department===department)&&(product==='all'||o.productId===product)&&(w.market==='all'||o.market===w.market)&&(w.region==='all'||o.regionId===w.region)&&(actor.role!=='operator'||o.managerId===actor.id));
  const ids=new Set(orders.map(o=>o.id));
  const rows=(definition.source==='orders'?orders:state.facts[definition.source].filter(r=>ids.has(r.orderId))).filter(r=>Date.parse(r.createdAt)>=w.start&&Date.parse(r.createdAt)<w.end);
  return {rows,window:w};
}
const matches=(row,conditions=[])=>conditions.every(c=>{const a=row[c.field],b=c.value;return {eq:()=>a===b,ne:()=>a!==b,lt:()=>a<b,lte:()=>a<=b,gt:()=>a>b,gte:()=>a>=b}[c.op]();});
export function evaluateExpression(expression,rows,warnings=new Set()){
  const node=expression;
  if(node.op==='constant')return node.value;
  if(['add','subtract','multiply','divide'].includes(node.op)){
    const a=evaluateExpression(node.left,rows,warnings),b=evaluateExpression(node.right,rows,warnings);if(a===null||b===null)return null;
    if(node.op==='divide'&&b===0){warnings.add('division_by_zero');return null;}
    const value={add:()=>a+b,subtract:()=>a-b,multiply:()=>a*b,divide:()=>a/b}[node.op]();if(!Number.isFinite(value)||Math.abs(value)>1e15){warnings.add('numeric_overflow');return null;}return value;
  }
  const selected=rows.filter(r=>matches(r,node.where));if(node.op==='count')return selected.length;
  const values=selected.map(r=>r[node.field]).filter(Number.isFinite);if(values.length!==selected.length)warnings.add('missing_values');
  if(!values.length){warnings.add('empty_sample');return null;}
  if(node.op==='sum'||node.op==='avg'){const n=values.reduce((a,b)=>a+b,0)/(node.op==='avg'?values.length:1);if(!Number.isFinite(n)||Math.abs(n)>1e15){warnings.add('numeric_overflow');return null;}return n;}
  if(node.op==='min')return Math.min(...values);if(node.op==='max')return Math.max(...values);
  values.sort((a,b)=>a-b);const i=(values.length-1)*node.p/100,lo=Math.floor(i);return values[lo]+(values[Math.ceil(i)]-values[lo])*(i-lo);
}
export function describeExpression(n){if(n.op==='constant')return String(n.value);if(n.left)return `(${describeExpression(n.left)} ${{add:'+',subtract:'−',multiply:'×',divide:'÷'}[n.op]} ${describeExpression(n.right)})`;return `${n.op==='percentile'?'P'+n.p:n.op}(${n.field||'*'}${n.where?.length?' where '+n.where.map(w=>`${w.field} ${w.op} ${JSON.stringify(w.value)}`).join(' AND '):''})`;}
export function previewMetric(state,actor,input,filters={},options={}){
  const definition=validateMetric(actor,input,options),{rows,window:w}=metricRows(state,actor,definition,filters),warnings=new Set();
  const value=evaluateExpression(definition.expression,rows,warnings),updatedAt=sourceTime(state.facts,[definition.source+'.csv',...(definition.source==='orders'?[]:['orders.csv'])]);
  return {definition,value:value===null?null:Math.round(value*10000)/10000,unit:definition.unit,sampleSize:rows.length,formula:describeExpression(definition.expression),sources:[{adapter:'filesystem',file:definition.source+'.csv',fields:definition.dependencies,updatedAt:sourceTime(state.facts,[definition.source+'.csv'])},...(definition.source==='orders'?[]:[{adapter:'filesystem',file:'orders.csv',fields:['id','department','productId','market','regionId'],updatedAt:sourceTime(state.facts,['orders.csv'])}])],freshness:{updatedAt,ageSeconds:Math.max(0,Math.floor((Date.now()-Date.parse(updatedAt))/1000)),stale:Date.now()-Date.parse(updatedAt)>86400000},filters:{...filters,from:w.from,to:w.to,start:w.start,end:w.end,timezone:'Europe/Minsk',departments:actor.departments},warnings:[...warnings],sourceVersion:state.sourceVersion||0};
}
export function customKpis(state,actor,filters={}){
  return (state.metricDefinitions||[]).filter(m=>!m.deleted&&visibleMetric(actor,m)).map(m=>{
    const p=previewMetric(state,actor,metricInput(m),filters,{edit:false}),{rows,window:w}=metricRows(state,actor,m,filters),series=[],labels=[];
    for(let t=w.start;t<w.end;t+=86400000){series.push(evaluateExpression(m.expression,rows.filter(r=>Date.parse(r.createdAt)>=t&&Date.parse(r.createdAt)<t+86400000)));labels.push(new Date(t+10800000).toISOString().slice(5,10));}
    const before=previewMetric(state,actor,metricInput(m),{...filters,period:'custom',from:new Date(w.start-(w.end-w.start)+10800000).toISOString().slice(0,10),to:new Date(w.start-86400000+10800000).toISOString().slice(0,10)},{edit:false});
    const priorRows=metricRows(state,actor,m,{...filters,period:'custom',from:before.filters.from,to:before.filters.to}).rows;const previousSeries=[],cumulativeSeries=[];for(let t=w.start;t<w.end;t+=86400000){const a=t-(w.end-w.start);previousSeries.push(evaluateExpression(m.expression,priorRows.filter(r=>Date.parse(r.createdAt)>=a&&Date.parse(r.createdAt)<a+86400000)));cumulativeSeries.push(evaluateExpression(m.expression,rows.filter(r=>Date.parse(r.createdAt)<t+86400000)));}
    const bad=m.target!=null&&p.value!==null&&(m.better==='lower'?p.value>m.target:p.value<m.target),unit=UNIT_LABEL[m.unit];
    return {id:m.id,label:m.label,custom:true,version:m.version,raw:p.value,value:p.value===null?'—':p.value.toLocaleString('ru-RU',{maximumFractionDigits:2}),unit,icon:'chart',description:m.description||'Пользовательская метрика',formula:p.formula,source:p.sources.map(s=>s.file).join(' + '),sourceAt:p.freshness.updatedAt,owner:m.ownerName,plan:m.target??'—',planRaw:m.target,forecast:'—',forecastRaw:null,fact:p.value,previous:before.value,previousRaw:before.value,change:p.value!==null&&before.value!==null?(p.value-before.value).toFixed(2):'—',trend:bad?'negative':'positive',state:p.value===null?'Нет данных':bad?'Отклонение':'В норме',series,seriesLabels:labels,previousSeries,cumulativeSeries,delta:p.value===null||before.value===null?null:p.value-before.value,forecastMethod:'Прогноз для пользовательской формулы не задан.',breakdowns:{market:[],department:[],channel:[]},sampleSize:p.sampleSize,distribution:null,warnings:p.warnings,preview:p};
  });
}
