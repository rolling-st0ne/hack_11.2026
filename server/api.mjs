import { ACTORS, OWNERS, KPI, STAGES, canAccessDepartment, departmentOwner } from './seed.mjs';
import { analytics } from './analytics.mjs';
import {criticalFromKpis} from './alerts.mjs';
import { FilesystemAdapter } from './adapters.mjs';

import {ApiError,fail,json,log} from './protocol.mjs';
import {customKpis} from './metric-config.mjs';
import {touchSources} from './data-contract.mjs';
import {handleConfiguration,dashboardConfiguration} from './config-api.mjs';
export {ApiError} from './protocol.mjs';
const cookieToken = request => (request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('contour_session='))?.split('=')[1];
const text = (v,max=300) => typeof v==='string' ? v.trim().slice(0,max) : '';
const ownerOf = id => OWNERS.find(o=>o.id===id);
const manage = actor => { if(!['executive','manager'].includes(actor.role)) fail(403,'Это действие доступно руководителю.','forbidden'); };

export function project(state,actor,filters={}) {
  if(actor.scope!=='all'&&filters.department&&filters.department!=='all'&&!canAccessDepartment(actor,filters.department))fail(403,'Показатели другого подразделения недоступны.','forbidden');
  const a=analytics(state,actor,filters);
  const allowedMetrics=['executive','analyst'].includes(actor.role)?null:actor.key==='maxim'?['customers','orders','support','delivery','newCustomers','repeat','conversion','responseTime','reviewScore']:actor.role==='manager'?['customers','orders','moderation','production','quality','delivery','team','revenue','margin','newCustomers','defects','repeat','conversion','leadTime','staffing','responseTime','reviewScore','output','queue','reprint','downtime']:actor.id==='daria'?['orders','support','delivery']:actor.id==='igor'?['orders','delivery','quality']:['orders','moderation','quality','production'];
  if(allowedMetrics)a.kpis=a.kpis.filter(k=>allowedMetrics.includes(k.id));
  if(actor.role==='operator'||actor.key==='maxim'){a.finance=null;a.averageIndex=null;a.qualityReport.reconciled=null;}
  if(!['executive','analyst'].includes(actor.role)){a.qualityReport.sources=[];a.qualityReport.issues=[];}
  if(actor.role==='operator'){a.shifts=[];a.forecast=[];a.channels=[];a.segments=[];a.productionPlan=null;a.productionFact=null;a.downtime=null;a.repeat=null;a.conversion=null;}
  if(!actor.pages.includes('sales')){a.leadFunnel=null;a.leadRows=[];a.churn=null;}
  if(!actor.pages.includes('production')){a.productionQueueRows=[];a.productionQueue=null;a.workInProgress=null;a.machineHours=null;a.availableHours=null;a.reprintCount=null;}
  a.performance=actor.role==='executive'?a.performance:null;
  if(actor.role==='operator'){a.employeeStats=null;a.reviews=[];a.geography=[];}
  if(actor.role==='operator')a.averageCheck=null;
  a.dashboard={title:'Дашборд',focus:actor.focus,level:actor.level,metrics:['executive','analyst'].includes(actor.role)?['revenue','margin','delivery','defects','newCustomers','customers','support','production','staffing','orders']:actor.key==='maxim'?['customers','newCustomers','support','repeat']:actor.role==='manager'?['revenue','orders','production','margin']:allowedMetrics};
  a.kpis.push(...customKpis(state,actor,filters));a.criticalDeviations=criticalFromKpis(a.kpis);
  const saved=state.dashboardLayouts?.find(l=>l.actorId===actor.id);
  a.dashboard.defaults=[...a.dashboard.metrics];
  if(saved)a.dashboard.metrics=saved.metricIds.filter(id=>a.kpis.some(k=>k.id===id));
  a.dashboard.savedAt=saved?.updatedAt||null;
  a.dashboard={...a.dashboard,...dashboardConfiguration(state,actor,a.kpis,a.filters.department)};
  const inScope=o=>canAccessDepartment(actor,o.department)&&(a.filters.department==='all'||o.department===a.filters.department);
  const operational = actor.role==='operator';
  const orderContext=new Map([...state.facts.orders,...state.orders].map(o=>[o.id,o]));
  const inEventSlice=(record,withPeriod=true)=>{
    const signal=record.signalId&&state.signals.find(s=>s.id===record.signalId);
    const order=orderContext.get(record.orderId||signal?.orderId);
    return (!withPeriod||Date.parse(record.createdAt)<a.filters.end&&(!record.resolvedAt||Date.parse(record.resolvedAt)>=a.filters.start))
      &&(a.filters.product==='all'||(record.productId||order?.productId)===a.filters.product)
      &&(a.filters.market==='all'||order?.market===a.filters.market)
      &&(a.filters.region==='all'||order?.regionId===a.filters.region);
  };
  const signals=state.signals.filter(inScope).filter(s=>inEventSlice(s,true)).filter(s=>a.kpis.some(k=>k.id===s.metric));
  const tasks=state.tasks.filter(t=>inScope(t)&&inEventSlice(t,false)&&(!operational||t.owner===actor.id)).map(t=>({...t,history:state.audit.filter(e=>e.object===t.id)}));
  const orders=[...state.orders.filter(inScope).filter(o=>a.filters.product==='all'||o.productId===a.filters.product).filter(o=>(a.filters.market==='all'||o.market===a.filters.market)&&(a.filters.region==='all'||o.regionId===a.filters.region)&&Date.parse(o.createdAt)>=a.filters.start&&Date.parse(o.createdAt)<a.filters.end).filter(o=>!operational||o.owner===actor.id).map(o=>actor.role==='executive'?{...o,client:'Данные доступны руководителю функции',product:o.product.split(' • ')[0],events:[]}:o),...a.flow.filter(o=>!operational||o.owner===actor.id)];
  const allowedObjects=new Set([...tasks.map(t=>t.id),...signals.map(s=>s.id),actor.role]);
  const audit=state.audit.filter(e=>actor.scope==='all'||e.actor===actor.id||allowedObjects.has(e.object));
  return {...a,actor,roles:Object.values(ACTORS),owners:OWNERS.filter(o=>actor.scope==='all'||actor.departments.some(d=>departmentOwner(d)===o.id)).map(o=>({...o,departments:Object.values(ACTORS).find(a=>a.id===o.id)?.departments||[],assignable:Object.values(ACTORS).some(a=>a.id===o.id&&a.role==='operator')})),stages:STAGES,signals,tasks,orders,connectors:state.connectors,source:{active:'filesystem',format:'CSV',files:['executive','analyst'].includes(actor.role)?FilesystemAdapter.files(state).map(f=>({...f,writable:actor.role==='executive'&&f.writable})):[],updatedAt:state.facts.sourceUpdatedAt},audit:audit.slice(0,250),checks:state.checks.filter(c=>tasks.some(t=>t.id===c.taskId)),lastUpdated:state.lastUpdated,period:a.filters.period,demo:true};
}

export async function handleApi(request,store,options={}) {
  const url=new URL(request.url), path=url.pathname, method=request.method;
  let authenticatedActor=null;
  try {
    if(path==='/api/health'&&method==='GET') return json({status:'ok',mode:options.auth?'authenticated':'demo',persistence:store.kind});
    if(!['GET','POST','PATCH'].includes(method)) return json({error:'Метод не поддерживается',code:'method_not_allowed'},405,{'allow':'GET, POST, PATCH'});
    if(method!=='GET') {
      if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin) fail(403,'Запрос с другого сайта отклонён.','origin_mismatch');
      if(Number(request.headers.get('content-length'))>2097152) fail(413,'Запрос слишком большой.');
    }
    let body={};
    if(method!=='GET') { const raw=await request.text(); if(raw.length>2097152) fail(413,'Запрос слишком большой.'); try {body=raw?JSON.parse(raw):{};}catch{fail(400,'Некорректный JSON.');} if(!body||Array.isArray(body)||typeof body!=='object')fail(400,'Ожидается JSON-объект.'); }
    if(options.auth){const response=await options.auth.handle(request,store,body);if(response)return response;}
    if(path==='/api/auth/config'&&method==='GET')return json({mode:'demo'});
    if(path==='/api/session'&&method==='POST') {
      const actor=Object.hasOwn(ACTORS,body.role)?ACTORS[body.role]:null;
      if(!actor) fail(400,'Неизвестная демонстрационная роль.');
      const token=crypto.randomUUID();
      await store.update(state=>{
        const now=Date.now();
        for(const [key,session] of Object.entries(state.sessions)) if(session.expires<now) delete state.sessions[key];
        const old=cookieToken(request); if(old)delete state.sessions[old];
        if(Object.keys(state.sessions).length>1000) fail(429,'Слишком много активных демосессий.');
        state.sessions[token]={role:body.role,expires:now+24*3600000};
        log(state,actor,'session',actor.role,'Открыта демонстрационная сессия: '+actor.title);
      });
      return json({actor,demo:true},200,{'set-cookie':`contour_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${url.protocol==='https:'?'; Secure':''}`});
    }
    const state=await store.read();
    const identity=options.auth?await options.auth.authenticate(request,state):null;
    const session=identity||state.sessions[cookieToken(request)];
    if(!session||session.expires<Date.now())fail(401,'Войдите в свою учётную запись.','unauthorized');
    const actor=ACTORS[session.role];
    if(!actor)fail(401,'Неизвестный пользователь.','unauthorized');
    authenticatedActor=actor;
    if(options.auth&&method!=='GET'&&identity.kind==='browser')options.auth.requireBrowser(request,identity);
    if(path.startsWith('/api/v1/')){
      if(!options.auth)fail(403,'API агента требует локального сервера с авторизацией.','authentication_required');
      const response=await handleConfiguration(request,store,state,identity,body,{project,auth:options.auth});
      if(path==='/api/v1/catalog'&&method==='GET'&&response.ok&&options.metabase?.enrich){
        const catalog=await response.json(),view=await options.metabase.enrich(state,actor,project(state,actor,Object.fromEntries(url.searchParams)));
        catalog.metrics=catalog.metrics.map(m=>{const k=view.kpis.find(k=>k.id===m.id);return {...m,value:k.raw,source:k.source,sourceUpdatedAt:k.sourceAt,...(k.sourceInfo?{sourceInfo:k.sourceInfo}:{}),plan:k.plan};});
        return json(catalog);
      }
      return response;
    }
    if(identity?.kind==='agent')fail(403,'Токен агента действует только в /api/v1.','insufficient_scope');
    if(options.auth&&path==='/api/dashboard'&&method!=='GET')fail(409,'Используйте предложение и подтверждение в /api/v1/proposals.','confirmation_required');
    if(path==='/api/metabase/embed'&&method==='GET'){
      if(!options.auth)fail(403,'Metabase требует персонального входа.','authentication_required');
      if(!options.metabase)fail(503,'Metabase не настроен.','metabase_unconfigured');
      if(!options.metabase.available(actor))fail(403,'BI-образец недоступен для этой роли или ещё не настроен.','forbidden');
      const view=project(state,actor,Object.fromEntries(url.searchParams));
      return json(await options.metabase.embed(state,actor,view.filters));
    }
    if(path==='/api/bootstrap'&&method==='GET') {
      const view=project(state,actor,Object.fromEntries(url.searchParams));
      if(options.auth&&options.metabase?.enrich)await options.metabase.enrich(state,actor,view);
      view.criticalDeviations=criticalFromKpis(view.kpis);return json({...view,authMode:options.auth?'authenticated':'demo'});
    }
    if(/^\/api\/orders\/[^/]+$/.test(path)&&method==='GET'){
      const id=decodeURIComponent(path.split('/')[3]),record=state.facts.orders.find(o=>o.id===id)||state.orders.find(o=>o.id===id);
      if(!record)fail(404,'Заказ не найден.');
      if(!canAccessDepartment(actor,record.department))fail(403,'Заказ другого направления недоступен.','forbidden');
      const day=new Date(Date.parse(record.createdAt)+3*3600000).toISOString().slice(0,10);
      const order=project(state,actor,{period:'custom',from:day,to:day}).orders.find(o=>o.id===id);
      if(!order)fail(403,'Заказ недоступен для текущей роли.','forbidden');
      return json({order});
    }
    if(path==='/api/export'&&method==='GET') {
      if(actor.role!=='analyst')manage(actor);
      const view=project(state,actor,Object.fromEntries(url.searchParams));
      if(options.auth&&options.metabase?.enrich)await options.metabase.enrich(state,actor,view);
      return json({exportedAt:new Date().toISOString(),mode:'demo',...view});
    }
    if(path.startsWith('/api/files/')&&method==='GET') {
      if(!['executive','analyst'].includes(actor.role))fail(403,'Файлы доступны директору и аналитику.','forbidden');
      const name=path.split('/')[3],csv=FilesystemAdapter.encode(state).files[name];
      if(!csv)fail(404,'Файл не найден.');
      return json({name,csv});
    }
    if(method==='GET') fail(404,'Маршрут не найден.','not_found');
    if(actor.role==='analyst'&&path!=='/api/dashboard')fail(403,'Профиль аналитика имеет доступ к данным и решениям только для чтения.','forbidden');
    const key=text(request.headers.get('idempotency-key'),128);
    if(!key||key.length<8) fail(400,'Для записи нужен заголовок Idempotency-Key (от 8 символов).','missing_idempotency_key');
    const fingerprint=JSON.stringify({path,method,body});
    let result;
    await store.update(s=>{
      if(identity){const session=s.sessions[identity.id];if(!session||session.revoked||session.expires<=Date.now())fail(401,'Сессия истекла.','unauthorized');}
      const idKey=actor.id+':'+key;
      const cached=s.idempotency[idKey];
      if(cached){if(cached.fingerprint!==fingerprint)fail(409,'Этот ключ уже использован для другого запроса.','idempotency_conflict');result={...cached.result,replayed:true};return;}
      if(path==='/api/dashboard'&&method==='POST'){
        const available=project(s,actor).kpis.map(k=>k.id),ids=body.metricIds;
        if(!Array.isArray(ids)||!ids.length||ids.length>24||new Set(ids).size!==ids.length)fail(400,'Выберите от 1 до 24 разных метрик.');
        if(ids.some(id=>!available.includes(id)))fail(403,'Выбраны недоступные метрики.','forbidden');
        s.dashboardLayouts??=[];const layout={actorId:actor.id,metricIds:ids,updatedAt:new Date().toISOString()};
        s.dashboardLayouts=s.dashboardLayouts.filter(l=>l.actorId!==actor.id);s.dashboardLayouts.push(layout);
        log(s,actor,'dashboard',actor.id,'Сохранён состав дашборда: '+ids.join(', '));result={layout};
      } else if(path.startsWith('/api/files/')&&method==='POST') {
        if(actor.role!=='executive')fail(403,'Импорт доступен директору.','forbidden');
        const name=path.split('/')[3];
        if(typeof body.csv!=='string')fail(400,'Передайте содержимое CSV.');
        let count;try{count=FilesystemAdapter.import(s,name,body.csv);}catch(error){fail(400,error.message,'invalid_csv');}
        s.connectors.find(c=>c.id==='filesystem').lastSync=s.facts.sourceUpdatedAt;
        log(s,actor,'import',name,`Загружено ${count} записей из CSV`);result={name,rows:count};
      } else if(path==='/api/tasks'&&method==='POST') {
        manage(actor);
        const title=text(body.title,160),description=text(body.description,1200),owner=ownerOf(body.owner);
        if(title.length<5) fail(400,'Название решения должно содержать минимум 5 символов.');
        const ownerActor=Object.values(ACTORS).find(a=>a.id===owner?.id&&a.role==='operator');
        if(!ownerActor) fail(400,'Выберите ответственного с доступной учётной записью.');
        if(actor.role!=='executive'&&!actor.departments.some(d=>departmentOwner(d)===owner.id))fail(403,'Нельзя назначить задачу сотруднику другого направления.','forbidden');
        const due=new Date(body.dueAt);
        if(!Number.isFinite(due.getTime())||due.getTime()<Date.now()-60000)fail(400,'Выберите срок в будущем.');
        const signal=body.signalId?s.signals.find(x=>x.id===body.signalId):null;
        if(body.signalId&&!signal)fail(404,'Сигнал не найден.');
        if(signal&&actor.scope!=='all'&&!canAccessDepartment(actor,signal.department))fail(403,'Сигнал другого подразделения недоступен.','forbidden');
        if(signal?.status==='resolved')fail(409,'Сигнал уже закрыт.');
        if(signal&&s.tasks.some(t=>t.signalId===signal.id&&t.status!=='done'))fail(409,'Для этого сигнала уже есть активное решение.','duplicate_task');
        const taskDepartment=signal?.department||text(body.department)||ownerActor.departments[0];
        if(!canAccessDepartment(actor,taskDepartment)||!canAccessDepartment(ownerActor,taskDepartment))fail(400,'Владелец должен иметь доступ к направлению решения.','incompatible_owner');
        const problem=text(body.problem,500)||signal?.title||'',cause=text(body.cause,500)||signal?.cause||'',impact=text(body.impact,500)||signal?.description||'';
        if([problem,cause,impact].some(v=>v.length<5))fail(400,'Заполните проблему, причину и влияние (минимум 5 символов).','incomplete_decision');
        const priority=['high','medium','low'].includes(body.priority)?body.priority:'medium';
        const task={id:'DEC-'+String(22+s.tasks.length-2).padStart(3,'0'),title,problem,description,impact,cause,priority,owner:owner.id,department:taskDepartment,dueAt:due.toISOString(),status:'new',signalId:signal?.id||null,orderId:signal?.orderId||null,createdAt:new Date().toISOString(),createdBy:actor.id,result:null};
        s.tasks.unshift(task);if(signal)signal.status='assigned';
        log(s,actor,'create',task.id,`Назначено решение «${title}» → ${owner.name}`);
        result={task};
      } else if(/^\/api\/tasks\/[^/]+\/status$/.test(path)&&method==='PATCH') {
        const id=path.split('/')[3],task=s.tasks.find(t=>t.id===id);
        if(!task)fail(404,'Решение не найдено.');
        if(actor.scope!=='all'&&!canAccessDepartment(actor,task.department))fail(403,'Решение другого подразделения недоступно.','forbidden');
        if(actor.role==='operator'&&task.owner!==actor.id)fail(403,'Вы можете менять только свои задачи.','forbidden');
        const next={new:'in_progress',in_progress:'review'}[task.status];
        if(body.status!==next)fail(409,'Недопустимый переход статуса. Сначала выполните предыдущий этап.');
        if(body.status==='review'&&text(body.note,1200).length<5)fail(400,'Опишите выполненное действие (минимум 5 символов).');
        task.status=body.status;
        if(body.note)task.result=text(body.note,1200);
        task.updatedAt=new Date().toISOString();
        log(s,actor,'status',task.id,`Статус: ${body.status==='review'?'На проверке':'В работе'}${task.result?' · '+task.result:''}`);
        result={task};
      } else if(/^\/api\/tasks\/[^/]+\/verify$/.test(path)&&method==='POST') {
        manage(actor);
        const task=s.tasks.find(t=>t.id===path.split('/')[3]);
        if(!task)fail(404,'Решение не найдено.');
        if(actor.scope!=='all'&&!canAccessDepartment(actor,task.department))fail(403,'Решение другого подразделения недоступно.','forbidden');
        if(task.status!=='review')fail(409,'Проверить можно только выполненное решение со статусом «На проверке».');
        if(!['recovered','unchanged'].includes(body.scenario))fail(400,'Выберите сценарий ответа mock-источника.');
        const signal=s.signals.find(x=>x.id===task.signalId);
        const connector=s.connectors.find(c=>c.id==='filesystem');
        if(connector?.failure){log(s,actor,'verify',task.id,'Источник временно недоступен. Проверка не выполнена.',false);result={error:'Источник временно недоступен. Решение сохранено. Повторите проверку после восстановления интеграции.',code:'source_unavailable',httpStatus:503};}
        else {
          const passed=body.scenario==='recovered';
          const before=signal?.value??null;
          if(signal&&passed){
            touchSources(s.facts,signal.metric==='support'?['interactions.csv','responses.csv']:signal.metric==='moderation'?['orders.csv','production_jobs.csv']:['orders.csv']);
            if(signal.metric==='moderation'){
              const queue=s.facts.orders.filter(o=>o.department===signal.department&&o.stage===3);
              queue.slice(0,Math.max(0,queue.length-24)).forEach(o=>{o.stage=4;o.completed=false;o.moderatedAt=new Date().toISOString();const job=s.facts.productionJobs?.find(j=>j.orderId===o.id);if(job)job.queuedAt=o.moderatedAt;});
            }
            if(signal.metric==='support')s.facts.interactions.filter(t=>t.department===signal.department).forEach(t=>{t.firstReplyMinutes=Math.min(Number.isFinite(t.firstReplyMinutes)?t.firstReplyMinutes:10,10);for(const r of s.facts.responses.filter(r=>r.interactionId===t.id&&r.type==='first_reply'))r.createdAt=new Date(Date.parse(t.createdAt)+t.firstReplyMinutes*60000).toISOString();});
            if(signal.metric==='delivery')s.facts.orders.filter(o=>o.department===signal.department&&o.completed).forEach(o=>{if(o.completedAt&&o.promisedAt){o.completedAt=new Date(Math.min(Date.parse(o.completedAt),Date.parse(o.promisedAt))).toISOString();o.leadHours=Math.round((Date.parse(o.completedAt)-Date.parse(o.createdAt))/360000)/10;}o.onTime=true;});
          }
          const measured=signal?analytics(s,actor,{period:'week',department:signal.department}).kpis.find(k=>k.id===signal.metric).raw:null;
          const note=signal?`${signal.metric==='moderation'?'Очередь':signal.metric==='support'?'SLA':'Доставка в срок'}: ${measured} ${signal.unit}; цель ${signal.metric==='moderation'?'≤':'≥'} ${signal.target} ${signal.unit}`:text(body.note,1200);
          if(!signal&&note.length<5)fail(400,'Зафиксируйте проверяемый результат (минимум 5 символов).');
          const achieved=signal?Number.isFinite(measured)&&(signal.metric==='moderation'?measured<=signal.target:measured>=signal.target):passed;
          const check={id:crypto.randomUUID(),taskId:task.id,signalId:signal?.id||null,at:new Date().toISOString(),actor:actor.id,source:signal?.source||'manual',mode:'mock',before,value:measured,target:signal?.target??null,passed:passed&&achieved,evidence:note};
          s.checks.unshift(check);
          if(check.passed){task.status='done';task.verifiedAt=check.at;task.result=note;if(signal){signal.status='resolved';signal.value=measured;signal.resolvedAt=check.at;}}
          log(s,actor,'verify',task.id,(check.passed?'Цель достигнута. ':'Отклонение сохраняется. ')+note,check.passed);
          result={task,check};
        }
      } else if(/^\/api\/integrations\/[^/]+\/(sync|failure)$/.test(path)&&method==='POST') {
        manage(actor);
        const [, , , id,action]=path.split('/'),c=s.connectors.find(c=>c.id===id);
        if(!c)fail(404,'Интеграция не найдена.');
        if(actor.role!=='executive')fail(403,'Управление источниками доступно директору.','forbidden');
        if(id==='bitrix')fail(409,'Битрикс24 не подключён. Активный источник — Filesystem.','adapter_unconfigured');
        if(action==='failure'){
          if(typeof body.enabled!=='boolean')fail(400,'Укажите enabled: true или false.');
          c.failure=body.enabled;c.status=c.failure?'error':'connected';
          log(s,actor,'integration',id,c.failure?'Включён тест сбоя Filesystem':'Filesystem восстановлен');result={connector:c};
        }else if(c.failure){log(s,actor,'sync',id,'Чтение Filesystem недоступно. Данные и прогресс сохранены.',false);result={error:'Источник недоступен. Сохранённые данные доступны. Восстановите источник и повторите.',code:'source_unavailable',httpStatus:503};}
        else {
          const eventId=text(body.eventId,120)||`${id}-snapshot-${new Date().toISOString().slice(0,10)}`;
          const duplicate=s.sourceEvents.includes(eventId);
          if(!duplicate){s.sourceEvents.push(eventId);c.events+=1;}
          c.lastSync=new Date().toISOString();c.status='connected';
          log(s,actor,'sync',id,duplicate?'Повтор события: данные не дублируются':`CSV перечитаны · ${eventId}`);
          result={connector:c,duplicate,eventId};
        }
      } else fail(404,'Маршрут не найден.','not_found');
      s.lastUpdated=new Date().toISOString();s.sourceVersion=(s.sourceVersion||0)+1;
      // Retryable integration failures deliberately do not consume the key.
      if(!result.httpStatus)s.idempotency[idKey]={fingerprint,result:structuredClone(result)};
    });
    return json(result,result.httpStatus||200);
  }catch(error){
    if(error instanceof RangeError)return json({error:error.message,code:'invalid_filters'},400);
    if(error instanceof ApiError){
      if(error.status===403&&authenticatedActor)await store.update(s=>log(s,authenticatedActor,'denied',path,'Отказано в доступе: '+error.message,false));
      return json({error:error.message,code:error.code},error.status);
    }
    console.error('API error',error);
    return json({error:'Не удалось выполнить запрос. Прогресс сохранён; повторите попытку.',code:'internal_error'},500);
  }
}
