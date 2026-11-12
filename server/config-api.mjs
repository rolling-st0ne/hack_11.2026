import {ACTORS,canAccessDepartment} from './seed.mjs';
import {availableFields,mayEdit,validateScope,metricInput,visibleMetric,previewMetric} from './metric-config.mjs';
import {fail,json,log} from './protocol.mjs';
export function configurationDefaults(actor){return ['executive','analyst'].includes(actor.role)?['revenue','margin','delivery','defects','newCustomers','customers','support','production','staffing','orders']:actor.key==='maxim'?['customers','newCustomers','support','repeat']:actor.role==='manager'?['revenue','orders','production','margin']:actor.id==='daria'?['orders','support','delivery']:actor.id==='igor'?['orders','delivery','quality']:['orders','moderation','quality','production'];}
export function dashboardConfiguration(state,actor,available,department='all'){
  const ids=new Set(available.map(k=>k.id)),required=configurationDefaults(actor).filter(id=>ids.has(id));
  const personalRecord=state.configLayouts?.find(l=>l.id==='personal:'+actor.id);
  const personal=personalRecord&&!personalRecord.deleted?personalRecord:null;
  const dept=department!=='all'?department:actor.departments.length===1?actor.departments[0]:null;
  const shared=dept&&state.configLayouts?.find(l=>l.id==='department:'+dept&&!l.deleted)||state.configLayouts?.find(l=>l.id==='company'&&!l.deleted);
  const selected=personal||shared,legacy=state.dashboardLayouts?.find(l=>l.actorId===actor.id);
  return {metrics:[...new Set([...(selected?.metricIds||legacy?.metricIds||required).filter(id=>ids.has(id)),...required])],required,defaults:required,version:personalRecord?.version||0,layoutId:'personal:'+actor.id,appliedLayoutId:selected?.id||'default',appliedVersion:selected?.version||0,savedAt:selected?.updatedAt||legacy?.updatedAt||null,editable:mayEdit(actor)};
}
function layoutScope(actor,id,edit=false){
  if(id==='personal:'+actor.id)return;
  if(id==='company'){if(edit&&actor.role!=='executive')fail(403,'Общий дашборд изменяет только директор.','forbidden');return;}
  if(typeof id==='string'&&id.startsWith('department:'))return validateScope(actor,{type:'department',department:id.slice(11)},edit);
  fail(403,'Этот дашборд недоступен.','forbidden');
}
function configResource(state,actor,resource,edit=false){
  if(typeof resource!=='string')fail(422,'Нужен resource.');
  const [kind,id,...extra]=resource.split('/');if(extra.length)fail(422,'Некорректный resource.');
  if(kind==='metric'){
    const record=state.metricDefinitions.find(m=>m.id===id);if(!record)fail(404,'Метрика не найдена.','not_found');
    if(!visibleMetric(actor,record))fail(403,'Метрика недоступна.','forbidden');if(edit)validateScope(actor,record.scope,true);
    return {kind,record};
  }
  if(kind==='layout'){layoutScope(actor,id,edit);return {kind,record:state.configLayouts.find(l=>l.id===id)||{id,version:0,deleted:true}};}
  fail(422,'resource: metric/{id} или layout/{id}.');
}
function validateLayout(state,actor,input,project){
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['id','metricIds'].includes(k)))fail(422,'Layout содержит только id, metricIds.');
  layoutScope(actor,input.id,true);
  const target=input.id.startsWith('department:')?(input.id==='department:photo'?ACTORS.maxim:ACTORS.sergey):actor;
  const available=project(state,target).kpis.map(k=>k.id),ids=input.metricIds,required=configurationDefaults(target);
  if(!Array.isArray(ids)||!ids.length||ids.length>32||new Set(ids).size!==ids.length)fail(422,'Выберите 1–32 уникальные метрики.','invalid_layout');
  if(ids.some(id=>!available.includes(id)))fail(403,'В дашборде есть недоступная метрика.','forbidden');
  if(required.some(id=>!ids.includes(id)))fail(422,'Обязательные KPI нельзя убрать: '+required.filter(id=>!ids.includes(id)).join(', '),'required_metrics');
  return {id:input.id,metricIds:[...ids],required};
}
const cleanProposal=p=>{const {ownerId,ownerRole,confirmationToken,...publicValue}=p;return publicValue;};
export async function handleConfiguration(request,store,state,identity,body,{project,auth}){
  const url=new URL(request.url),path=url.pathname,method=request.method,actor=identity.actor;
  if(!path.startsWith('/api/v1/'))return null;
  if(identity.kind==='agent'&&!identity.scopes.includes(method==='GET'?'catalog:read':'changes:propose'))fail(403,'Токен не имеет нужного разрешения.','insufficient_scope');
  const filters=Object.fromEntries(url.searchParams);
  if(method==='GET'){
    if(path==='/api/v1/catalog'){
      const p=project(state,actor,filters);
      return json({actor:{id:actor.id,role:actor.role,departments:actor.departments},metrics:p.kpis.map(k=>({id:k.id,label:k.label,version:k.version||1,builtin:!k.custom,editable:!!k.custom&&mayEdit(actor)&&((state.metricDefinitions.find(m=>m.id===k.id)?.scope.type==='department')||actor.role==='executive'),formula:k.formula,source:k.source,sourceUpdatedAt:k.sourceAt,unit:k.unit,value:k.raw,state:k.state,sampleSize:k.sampleSize,plan:k.plan,definition:k.custom?metricInput(state.metricDefinitions.find(m=>m.id===k.id)):null})),filters:p.filters,dashboard:p.dashboard,sourceVersion:state.sourceVersion||0});
    }
    if(path==='/api/v1/fields')return json({sources:availableFields(actor),operations:['count','sum','avg','min','max','percentile','constant','add','subtract','multiply','divide'],percentiles:[50,90,95,99],limits:{depth:8,nodes:64,where:10},units:['count','BYN','percent','ratio','minutes','hours','score'],sourceUpdatedAt:state.facts.sourceUpdatedAt});
    if(path==='/api/v1/dashboards')return json({dashboard:project(state,actor,filters).dashboard,layouts:state.configLayouts.filter(l=>{try{layoutScope(actor,l.id);return true;}catch{return false;}}).map(l=>({...l,metricIds:l.metricIds?.filter(id=>project(state,actor).kpis.some(k=>k.id===id))})),targets:['personal:'+actor.id,...(actor.role==='executive'?['company']:[]),...actor.departments.map(d=>'department:'+d)]});
    if(path==='/api/v1/proposals')return json({proposals:state.configProposals.filter(p=>p.ownerId===actor.id).slice(-100).reverse().map(cleanProposal)});
    if(/^\/api\/v1\/proposals\/[^/]+$/.test(path)){
      const proposal=state.configProposals.find(p=>p.id===path.split('/')[4]&&p.ownerId===actor.id);if(!proposal)fail(404,'Предложение не найдено.','not_found');
      // Review content is bound to the exact version and source snapshot saved in the proposal.
      return json({proposal:cleanProposal(proposal),canConfirm:identity.kind==='browser'&&proposal.status==='pending'&&Date.parse(proposal.expiresAt)>Date.now(),...(identity.kind==='browser'?{confirmationToken:proposal.confirmationToken}:{})});
    }
    if(path==='/api/v1/history'){
      const resource=url.searchParams.get('resource');configResource(state,actor,resource);
      return json({resource,revisions:state.configRevisions.filter(r=>r.resource===resource&&(resource.startsWith('layout/')||[r.before,r.after].filter(Boolean).every(m=>visibleMetric(actor,m)))).map(r=>({version:r.version,at:r.at,actorId:r.actorId,operation:r.operation,before:r.before,after:r.after,proposalId:r.proposalId}))});
    }
    fail(404,'Маршрут не найден.','not_found');
  }
  if(method!=='POST')fail(405,'Используйте POST.','method_not_allowed');
  if(!mayEdit(actor))fail(403,'Изменения доступны директору и руководителям направлений.','forbidden');
  const key=request.headers.get('idempotency-key');if(!key||key.length<8||key.length>128)fail(400,'Нужен Idempotency-Key длиной 8–128 символов.','missing_idempotency_key');
  const isConfirmation=/\/confirm$/.test(path),isCancel=/\/cancel$/.test(path);
  if(isConfirmation||isCancel)auth.requireBrowser(request,identity);
  const cacheKey=`config:${identity.kind}:${identity.id}:${key}`,fingerprint=JSON.stringify({path,body});let result,status=200;
  await store.update(s=>{
    // Revocation, expiration, and version checks happen inside the same serialized commit.
    const session=s.sessions[identity.id];if(!session||session.revoked||session.expires<=Date.now())fail(401,'Сессия или токен истекли.','unauthorized');
    const cached=s.idempotency[cacheKey];if(cached){if(cached.fingerprint!==fingerprint)fail(409,'Ключ использован для другого запроса.','idempotency_conflict');result={...cached.result,replayed:true};status=cached.status;return;}
    if(path==='/api/v1/metrics/preview'){
      result=previewMetric(s,actor,body.definition,body.filters||{});log(s,actor,'metric_preview',result.definition.id,'Проверена формула; источники: '+result.sources.map(x=>x.file).join(', '));
    }else if(path==='/api/v1/proposals'){
      if(!Number.isInteger(body.baseVersion)||body.baseVersion<0)fail(422,'baseVersion — целое число ≥ 0.','version_required');
      let resource,payload,preview,before,operation=body.kind;
      if(body.kind==='metric'){
        preview=previewMetric(s,actor,body.definition,body.filters||{});payload=metricInput(preview.definition);resource='metric/'+payload.id;before=s.metricDefinitions.find(m=>m.id===payload.id)||null;
        if(before){if(!visibleMetric(actor,before))fail(403,'Метрика недоступна.','forbidden');validateScope(actor,before.scope,true);if(JSON.stringify(before.scope)!==JSON.stringify(payload.scope))fail(422,'Область существующей метрики неизменна. Создайте новую метрику.','immutable_scope');}
      }else if(body.kind==='layout'){
        payload=validateLayout(s,actor,body.layout,project);resource='layout/'+payload.id;before=s.configLayouts.find(l=>l.id===payload.id)||null;preview={layout:payload,labels:payload.metricIds.map(id=>({id,label:project(s,actor).kpis.find(k=>k.id===id)?.label||id})),sourceUpdatedAt:s.facts.sourceUpdatedAt};
      }else if(body.kind==='rollback'){
        resource=body.resource;const current=configResource(s,actor,resource,true);before=current.record;
        if(!Number.isInteger(body.targetVersion)||body.targetVersion<0||body.targetVersion>=before.version)fail(422,'targetVersion должен предшествовать текущей версии.');
        const history=s.configRevisions.filter(r=>r.resource===resource);
        const target=body.targetVersion===0?history.find(r=>r.version===1)?.before:history.find(r=>r.version===body.targetVersion)?.after;
        if(body.targetVersion!==0&&!target)fail(404,'Версия не найдена.','not_found');
        if(!target||target.deleted){
          if(current.kind==='metric'&&s.configLayouts.some(l=>!l.deleted&&l.metricIds.includes(before.id)))fail(409,'Метрика используется в дашборде. Сначала измените его.','metric_in_use');
          payload={...before,deleted:true};preview={removal:true,label:before.label||before.id};
        }else if(current.kind==='metric'){payload=metricInput(target);preview=previewMetric(s,actor,payload,body.filters||{});}
        else{payload=validateLayout(s,actor,{id:target.id,metricIds:target.metricIds},project);preview={layout:payload};}
      }else fail(422,'kind: metric, layout или rollback.');
      if((before?.version||0)!==body.baseVersion)fail(409,'Версия изменилась. Обновите данные и подготовьте предложение заново.','version_conflict');
      if(s.configProposals.filter(p=>p.ownerId===actor.id&&p.status==='pending'&&Date.parse(p.expiresAt)>Date.now()).length>=50)fail(429,'Слишком много ожидающих предложений. Отмените старые.');
      const proposal={id:crypto.randomUUID(),ownerId:actor.id,ownerRole:actor.key,author:identity.kind,resource,kind:resource.split('/')[0],operation,baseVersion:body.baseVersion,targetVersion:body.targetVersion??null,before:before?structuredClone(before):null,payload,preview,filters:preview.filters?{...(body.filters||{}),period:'custom',from:preview.filters.from,to:preview.filters.to}:body.filters||{},sourceVersion:s.sourceVersion||0,sourceFingerprint:s.sourceFingerprint||null,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString(),status:'pending',confirmationToken:crypto.randomUUID()};
      s.configProposals.push(proposal);log(s,actor,'config_proposed',resource,`${operation}; предложение ${proposal.id}; версия ${body.baseVersion}`);
      result={proposal:cleanProposal(proposal),reviewUrl:`/?proposal=${proposal.id}#overview`};status=201;
    }else if(/^\/api\/v1\/proposals\/[^/]+\/(confirm|cancel)$/.test(path)){
      const p=s.configProposals.find(p=>p.id===path.split('/')[4]&&p.ownerId===actor.id);if(!p)fail(404,'Предложение не найдено.','not_found');
      if(p.status!=='pending')fail(409,'Предложение уже обработано.','proposal_closed');
      if(isCancel){p.status='cancelled';log(s,actor,'config_cancelled',p.resource,'Отменено предложение '+p.id);result={proposal:cleanProposal(p)};}
      else{
        if(body.confirmationToken!==p.confirmationToken||body.confirm!==true)fail(422,'Просмотрите предложение и явно подтвердите его.','confirmation_required');
        if(Date.parse(p.expiresAt)<=Date.now())fail(410,'Срок предложения истёк. Подготовьте новое.','proposal_expired');
        if((s.sourceVersion||0)!==p.sourceVersion||(s.sourceFingerprint||null)!==p.sourceFingerprint)fail(409,'Источники изменились после предпросмотра. Подготовьте новое предложение.','source_changed');
        const table=p.kind==='metric'?s.metricDefinitions:s.configLayouts,current=table.find(r=>r.id===p.payload.id);
        if((current?.version||0)!==p.baseVersion)fail(409,'Версия изменилась после предпросмотра.','version_conflict');
        if(p.kind==='metric'){
          if(current){if(!visibleMetric(actor,current))fail(403,'Метрика недоступна.','forbidden');validateScope(actor,current.scope,true);}
          validateScope(actor,p.payload.scope,true);
          if(!p.payload.deleted)previewMetric(s,actor,metricInput(p.payload),p.filters);
          else if(s.configLayouts.some(l=>!l.deleted&&l.metricIds.includes(p.payload.id)))fail(409,'Метрика используется в дашборде.','metric_in_use');
        }else {layoutScope(actor,p.payload.id,true);if(!p.payload.deleted)validateLayout(s,actor,{id:p.payload.id,metricIds:p.payload.metricIds},project);}
        const at=new Date().toISOString(),after={...p.payload,version:p.baseVersion+1,ownerId:current?.ownerId||actor.id,ownerName:current?.ownerName||actor.name,updatedAt:at,deleted:!!p.payload.deleted};
        if(current)table[table.indexOf(current)]=after;else table.push(after);
        s.configRevisions.push({resource:p.resource,version:after.version,at,actorId:actor.id,operation:p.operation,before:current||null,after,proposalId:p.id});p.status='applied';p.appliedAt=at;p.appliedVersion=after.version;
        log(s,actor,'config_confirmed',p.resource,`Пользователь подтвердил ${p.id}; версия ${after.version}; ${p.operation}`);result={resource:p.resource,version:after.version,record:after,proposalId:p.id};
      }
    }else fail(404,'Маршрут не найден.','not_found');
    s.idempotency[cacheKey]={fingerprint,result:structuredClone(result),status};
  });
  return json(result,status);
}
