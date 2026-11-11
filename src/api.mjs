import { ACTORS, OWNERS, KPI, STAGES } from './seed.mjs';
import { analytics } from './analytics.mjs';

export class ApiError extends Error {
  constructor(status, message, code='validation_error') { super(message); this.status=status; this.code=code; }
}
const fail = (status,message,code) => { throw new ApiError(status,message,code); };
const json = (body,status=200,headers={}) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const cookieToken = request => (request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('contour_session='))?.split('=')[1];
const log = (state,actor,action,object,result,success=true) => state.audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),actor:actor.id,actorName:actor.name,action,object,result,success});
const text = (v,max=300) => typeof v==='string' ? v.trim().slice(0,max) : '';
const ownerOf = id => OWNERS.find(o=>o.id===id);
const manage = actor => { if(actor.role==='operator') fail(403,'Это действие доступно руководителю.','forbidden'); };

function project(state,actor,filters={}) {
  if(actor.scope!=='all'&&filters.department&&filters.department!=='all'&&filters.department!==actor.scope)fail(403,'Показатели другого подразделения недоступны.','forbidden');
  const a=analytics(state,actor,filters);
  if(actor.role==='operator') {a.kpis=a.kpis.filter(k=>!['revenue','margin'].includes(k.id));a.finance=null;a.averageIndex=null;}
  const inScope=o=>(a.filters.department==='all'||o.department===a.filters.department)&&(!o.productId||a.filters.product==='all'||o.productId===a.filters.product);
  const operational = actor.role==='operator';
  const signals=state.signals.filter(inScope).filter(s=>a.filters.product==='all'||({books:'book',photo:'prints',gifts:'calendar'}[s.department]===a.filters.product)).map(s=>{
    const k=a.kpis.find(k=>k.id===s.metric);
    return {...s,currentValue:k.raw,currentState:k.state};
  });
  const tasks=state.tasks.filter(t=>inScope(t)&&(!operational||t.owner===actor.id));
  const orders=[...state.orders.filter(inScope).map(o=>actor.role==='executive'?{...o,client:'Данные доступны руководителю функции',product:o.product.split(' • ')[0],events:[]}:o),...a.flow.filter(o=>!operational||o.owner===actor.id)];
  const allowedObjects=new Set([...tasks.map(t=>t.id),...signals.map(s=>s.id),actor.role]);
  const audit=state.audit.filter(e=>actor.scope==='all'||e.actor===actor.id||allowedObjects.has(e.object));
  return {...a,actor,roles:Object.values(ACTORS),owners:OWNERS,stages:STAGES,signals,tasks,orders,connectors:state.connectors.filter(c=>actor.scope==='all'||['erp','crm','support'].includes(c.id)),audit:audit.slice(0,250),checks:state.checks.filter(c=>tasks.some(t=>t.id===c.taskId)),lastUpdated:state.lastUpdated,period:a.filters.period,demo:true};
}

export async function handleApi(request,store) {
  const url=new URL(request.url), path=url.pathname, method=request.method;
  let authenticatedActor=null;
  try {
    if(path==='/api/health'&&method==='GET') return json({status:'ok',mode:'demo',persistence:store.kind});
    if(!['GET','POST','PATCH'].includes(method)) return json({error:'Метод не поддерживается',code:'method_not_allowed'},405,{'allow':'GET, POST, PATCH'});
    if(method!=='GET') {
      if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin) fail(403,'Запрос с другого сайта отклонён.','origin_mismatch');
      if(Number(request.headers.get('content-length'))>65536) fail(413,'Запрос слишком большой.');
    }
    let body={};
    if(method!=='GET') { const raw=await request.text(); if(raw.length>65536) fail(413,'Запрос слишком большой.'); try {body=raw?JSON.parse(raw):{};}catch{fail(400,'Некорректный JSON.');} if(!body||Array.isArray(body)||typeof body!=='object')fail(400,'Ожидается JSON-объект.'); }
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
    const session=state.sessions[cookieToken(request)];
    if(!session||session.expires<Date.now()) fail(401,'Сессия истекла. Выберите демороль повторно.','unauthorized');
    const actor=ACTORS[session.role];
    authenticatedActor=actor;
    if(path==='/api/bootstrap'&&method==='GET') return json(project(state,actor,Object.fromEntries(url.searchParams)));
    if(path==='/api/export'&&method==='GET') {
      manage(actor);
      return json({exportedAt:new Date().toISOString(),mode:'demo',...project(state,actor,Object.fromEntries(url.searchParams))});
    }
    if(method==='GET') fail(404,'Маршрут не найден.','not_found');
    const key=text(request.headers.get('idempotency-key'),128);
    if(!key||key.length<8) fail(400,'Для записи нужен заголовок Idempotency-Key (от 8 символов).','missing_idempotency_key');
    const fingerprint=JSON.stringify({path,method,body});
    let result;
    await store.update(s=>{
      const idKey=actor.id+':'+key;
      const cached=s.idempotency[idKey];
      if(cached){if(cached.fingerprint!==fingerprint)fail(409,'Этот ключ уже использован для другого запроса.','idempotency_conflict');result={...cached.result,replayed:true};return;}
      if(path==='/api/tasks'&&method==='POST') {
        manage(actor);
        const title=text(body.title,160),description=text(body.description,1200),owner=ownerOf(body.owner);
        if(title.length<5) fail(400,'Название решения должно содержать минимум 5 символов.');
        if(!owner) fail(400,'Выберите ответственного из списка.');
        const due=new Date(body.dueAt);
        if(!Number.isFinite(due.getTime())||due.getTime()<Date.now()-60000)fail(400,'Выберите срок в будущем.');
        const signal=body.signalId?s.signals.find(x=>x.id===body.signalId):null;
        if(body.signalId&&!signal)fail(404,'Сигнал не найден.');
        if(signal&&actor.scope!=='all'&&signal.department!==actor.scope)fail(403,'Сигнал другого подразделения недоступен.','forbidden');
        if(signal?.status==='resolved')fail(409,'Сигнал уже закрыт.');
        if(signal&&s.tasks.some(t=>t.signalId===signal.id&&t.status!=='done'))fail(409,'Для этого сигнала уже есть активное решение.','duplicate_task');
        const priority=['high','medium','low'].includes(body.priority)?body.priority:'medium';
        const task={id:'DEC-'+String(22+s.tasks.length-2).padStart(3,'0'),title,description,impact:text(body.impact,500),cause:signal?.cause||text(body.cause,500),priority,owner:owner.id,department:signal?.department||(actor.scope==='all'?'books':actor.scope),dueAt:due.toISOString(),status:'new',signalId:signal?.id||null,orderId:signal?.orderId||null,createdAt:new Date().toISOString(),createdBy:actor.id,result:null};
        s.tasks.unshift(task);if(signal)signal.status='assigned';
        log(s,actor,'create',task.id,`Назначено решение «${title}» → ${owner.name}`);
        result={task};
      } else if(/^\/api\/tasks\/[^/]+\/status$/.test(path)&&method==='PATCH') {
        const id=path.split('/')[3],task=s.tasks.find(t=>t.id===id);
        if(!task)fail(404,'Решение не найдено.');
        if(actor.scope!=='all'&&task.department!==actor.scope)fail(403,'Решение другого подразделения недоступно.','forbidden');
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
        if(actor.scope!=='all'&&task.department!==actor.scope)fail(403,'Решение другого подразделения недоступно.','forbidden');
        if(task.status!=='review')fail(409,'Проверить можно только выполненное решение со статусом «На проверке».');
        if(!['recovered','unchanged'].includes(body.scenario))fail(400,'Выберите сценарий ответа mock-источника.');
        const signal=s.signals.find(x=>x.id===task.signalId);
        const connector=signal?s.connectors.find(c=>c.id===signal.source):null;
        if(connector?.failure){log(s,actor,'verify',task.id,'Источник временно недоступен. Проверка не выполнена.',false);result={error:'Источник временно недоступен. Решение сохранено. Повторите проверку после восстановления интеграции.',code:'source_unavailable',httpStatus:503};}
        else {
          const passed=body.scenario==='recovered';
          const before=signal?.value??null;
          if(signal&&passed){
            if(signal.metric==='moderation'){
              const queue=s.facts.orders.filter(o=>o.department===signal.department&&o.stage===3);
              queue.slice(0,Math.max(0,queue.length-24)).forEach(o=>{o.stage=4;o.completed=false;});
            }
            if(signal.metric==='support')s.facts.interactions.filter(t=>t.department===signal.department).forEach(t=>{t.firstReplyMinutes=Math.min(t.firstReplyMinutes,10);});
            if(signal.metric==='delivery')s.facts.orders.filter(o=>o.department===signal.department).forEach(o=>{o.onTime=true;});
          }
          const measured=signal?analytics(s,actor,{period:'week',department:signal.department}).kpis.find(k=>k.id===signal.metric).raw:null;
          const note=signal?`${signal.metric==='moderation'?'Очередь':signal.metric==='support'?'SLA':'Доставка в срок'}: ${measured} ${signal.unit}; цель ${signal.metric==='moderation'?'≤':'≥'} ${signal.target} ${signal.unit}`:text(body.note,1200);
          if(!signal&&note.length<5)fail(400,'Зафиксируйте проверяемый результат (минимум 5 символов).');
          const achieved=signal?(signal.metric==='moderation'?measured<=signal.target:measured>=signal.target):passed;
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
        if(actor.role!=='analyst')fail(403,'Управление источниками доступно аналитику / администратору.','forbidden');
        if(action==='failure'){
          if(typeof body.enabled!=='boolean')fail(400,'Укажите enabled: true или false.');
          c.failure=body.enabled;c.status=c.failure?'error':'connected';
          log(s,actor,'integration',id,c.failure?'Включён тест сбоя mock-источника':'Mock-источник восстановлен');result={connector:c};
        }else if(c.failure){log(s,actor,'sync',id,'Mock API недоступен. Данные и прогресс сохранены.',false);result={error:'Источник недоступен. Сохранённые данные доступны. Восстановите источник и повторите.',code:'source_unavailable',httpStatus:503};}
        else {
          const eventId=text(body.eventId,120)||`${id}-snapshot-${new Date().toISOString().slice(0,10)}`;
          const duplicate=s.sourceEvents.includes(eventId);
          if(!duplicate){s.sourceEvents.push(eventId);c.events+=1;}
          c.lastSync=new Date().toISOString();c.status='connected';
          log(s,actor,'sync',id,duplicate?'Повтор события: данные не дублируются':`Статусы синхронизированы · ${eventId}`);
          result={connector:c,duplicate,eventId};
        }
      } else fail(404,'Маршрут не найден.','not_found');
      s.lastUpdated=new Date().toISOString();
      // Retryable integration failures deliberately do not consume the key.
      if(!result.httpStatus)s.idempotency[idKey]={fingerprint,result:structuredClone(result)};
    });
    return json(result,result.httpStatus||200);
  }catch(error){
    if(error instanceof ApiError){
      if(error.status===403&&authenticatedActor)await store.update(s=>log(s,authenticatedActor,'denied',path,'Отказано в доступе: '+error.message,false));
      return json({error:error.message,code:error.code},error.status);
    }
    console.error('API error',error);
    return json({error:'Не удалось выполнить запрос. Прогресс сохранён; повторите попытку.',code:'internal_error'},500);
  }
}
