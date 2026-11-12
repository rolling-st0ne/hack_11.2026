import {existsSync,mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createFilesystemStore,readCsvDirectory} from '../server/filesystem-store.mjs';
import {syncMetabaseSnapshot} from '../server/metabase.mjs';
import {metricQuery,metricQueryParameters} from '../server/metabase-query.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=resolve(root,'.data/metabase'),configPath=resolve(dir,'config.json');
mkdirSync(dir,{recursive:true,mode:0o700});
const config=existsSync(configPath)?JSON.parse(readFileSync(configPath,'utf8')):{url:'http://localhost:3001',email:'admin@fotoprint.local',password:'Fp!'+randomBytes(24).toString('base64url'),secret:randomBytes(32).toString('hex')};
if(process.env.METABASE_URL)config.url=new URL(process.env.METABASE_URL).origin;
const sqlitePath=process.env.METABASE_SQLITE_PATH||resolve(process.env.CONTOUR_METABASE_SNAPSHOT||dir,'analytics.sqlite');
function save(){writeFileSync(configPath,JSON.stringify(config,null,2),{mode:0o600});chmodSync(configPath,0o600);}
save();
let session;
async function api(path,method='GET',body){
 const r=await fetch(config.url+'/api'+path,{method,signal:AbortSignal.timeout(60000),headers:{'content-type':'application/json',...(session?{'X-Metabase-Session':session}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const raw=await r.text();let result=null;
 if(raw){try{result=JSON.parse(raw);}catch{result=raw;}}
 if(!r.ok)throw new Error(`Metabase ${method} ${path}: ${r.status} ${JSON.stringify(result).slice(0,1500)}`);
 return result;
}
console.log('Ожидаем Metabase…');
let ready=false;
for(let i=0;i<180;i++){
 try{const r=await fetch(config.url+'/api/health',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}
 await new Promise(r=>setTimeout(r,1000));
}
if(!ready)throw new Error('Metabase не запустился. Проверьте .data/metabase/metabase.log');
const props=await api('/session/properties');
if(props['setup-token']){
 const result=await api('/setup','POST',{token:props['setup-token'],user:{email:config.email,password:config.password,first_name:'Фотопринт',last_name:'Администратор'},prefs:{site_name:'Фотопринт · BI',allow_tracking:false}});
 session=result.id;
}else session=(await api('/session','POST',{username:config.email,password:config.password})).id;
try{
 const store=createFilesystemStore(process.env.CONTOUR_FILES||resolve(root,'.data/filesystem'),readCsvDirectory(resolve(root,'data/filesystem')));
 const state=await store.read();syncMetabaseSnapshot(process.env.CONTOUR_METABASE_SNAPSHOT||dir,state);
 if(!config.databaseId){
  const db=await api('/database','POST',{engine:'sqlite',name:'Фотопринт · демозаказы',details:{db:sqlitePath},is_full_sync:true});config.databaseId=db.id;save();
 }else{
  const database=await api('/database/'+config.databaseId);
  if(database.details.db!==sqlitePath)await api('/database/'+config.databaseId,'PUT',{details:{...database.details,db:sqlitePath}});
 }
 await api('/setting/enable-embedding','PUT',{value:true});
 await api('/setting/enable-embedding-static','PUT',{value:true});
 await api('/setting/embedding-secret-key','PUT',{value:config.secret});
 await api('/setting/enable-public-sharing','PUT',{value:false});
 const names={from:'Начало периода',to:'Конец периода',department:'Подразделение',product:'Продукт',market:'Рынок',region:'Регион'};
 const tags=Object.fromEntries(Object.entries(names).map(([key,label])=>[key,{id:key,name:key,'display-name':label,type:'text',required:true}]));
 const where=`FROM orders WHERE created_at >= {{from}} AND created_at < {{to}}
 AND ({{department}} = 'all' OR department = {{department}})
 AND ({{product}} = 'all' OR product = {{product}})
 AND ({{market}} = 'all' OR market = {{market}})
 AND ({{region}} = 'all' OR region = {{region}})`;
 const definitions=[
  {key:'revenue',name:'Выручка · BYN',display:'scalar',query:`SELECT round(coalesce(sum(revenue),0),2) AS "Выручка" ${where}`,settings:{'scalar.decimals':2}},
  {key:'orders',name:'Заказы',display:'scalar',query:`SELECT count(*) AS "Заказы" ${where}`,settings:{'scalar.decimals':0}},
  {key:'average',name:'Средний чек · BYN',display:'scalar',query:`SELECT round(avg(revenue),2) AS "Средний чек" ${where}`,settings:{'scalar.decimals':2}},
  {key:'defects',name:'Доля брака · %',display:'scalar',query:`SELECT round(100.0*sum(defect)/nullif(count(*),0),2) AS "Доля брака" ${where}`,settings:{'scalar.decimals':2}},
  {key:'trend',name:'Выручка по дням · BYN',display:'line',query:`SELECT day AS "Дата",round(sum(revenue),2) AS "Выручка" ${where} GROUP BY day ORDER BY day`,settings:{'graph.dimensions':['Дата'],'graph.metrics':['Выручка']}},
  {key:'departments',name:'Заказы по направлениям',display:'bar',query:`SELECT CASE department WHEN 'books' THEN 'Фотокниги' WHEN 'photo' THEN 'Фотопечать' WHEN 'gifts' THEN 'Подарки' ELSE department END AS "Направление",count(*) AS "Заказы" ${where} GROUP BY department ORDER BY count(*) DESC`,settings:{'graph.dimensions':['Направление'],'graph.metrics':['Заказы']}}
 ];
 config.cards??={};
 for(const def of definitions){
  const body={name:def.name,description:'Демоданные Фотопринт. Денежные значения BYN; календарный день Europe/Minsk (UTC+3). Выручка — сумма по всем заказам периода; брак — заказы с defect=true / все заказы периода.',display:def.display,dataset_query:{database:config.databaseId,type:'native',native:{query:def.query,'template-tags':tags}},visualization_settings:def.settings};
  const card=config.cards[def.key]?await api('/card/'+config.cards[def.key],'PUT',body):await api('/card','POST',body);
  config.cards[def.key]=card.id;save();
 }
 if(!config.dashboardId){const dashboard=await api('/dashboard','POST',{name:'Фотопринт · управленческий обзор',description:'Образец Metabase OSS. Фильтры задаются приложением. Только синтетические данные.'});config.dashboardId=dashboard.id;save();}
 const current=await api('/dashboard/'+config.dashboardId);
 const parameters=Object.entries(names).map(([key,name])=>({id:key,slug:key,name,type:'string/='}));
 const dashcards=definitions.map((def,i)=>({id:current.dashcards.find(c=>c.card_id===config.cards[def.key])?.id??-(i+1),card_id:config.cards[def.key],row:i<4?0:4,col:i<4?i*6:(i-4)*12,size_x:i<4?6:12,size_y:i<4?4:9,parameter_mappings:Object.keys(names).map(key=>({parameter_id:key,card_id:config.cards[def.key],target:['variable',['template-tag',key]]})),visualization_settings:{}}));
 await api('/dashboard/'+config.dashboardId,'PUT',{parameters,dashcards,enable_embedding:true,embedding_params:Object.fromEntries(Object.keys(names).map(key=>[key,'locked']))});
 const metricTags=Object.fromEntries(Object.entries(metricQueryParameters).map(([name,type])=>[name,{id:name,name,'display-name':name,type,required:true}]));
 const metricBody={name:'Метрики общего дашборда',description:'Metabase рассчитывает выручку, заказы, брак, историю и разрезы. Область доступа и фильтры подписывает сервер приложения.',display:'table',dataset_query:{database:config.databaseId,type:'native',native:{query:metricQuery,'template-tags':metricTags}},visualization_settings:{},enable_embedding:true,embedding_params:Object.fromEntries(Object.keys(metricQueryParameters).map(key=>[key,'locked']))};
 const metricCard=config.metricCardId?await api('/card/'+config.metricCardId,'PUT',metricBody):await api('/card','POST',metricBody);
 await api('/card/'+metricCard.id,'PUT',{enable_embedding:true,embedding_params:metricBody.embedding_params});
 config.metricCardId=metricCard.id;config.ready=true;save();
 writeFileSync(resolve(dir,'ACCESS.txt'),`Локальный Metabase: ${config.url}\nЛогин: ${config.email}\nПароль: ${config.password}\nДашборд: ${config.url}/dashboard/${config.dashboardId}\nНе публиковать этот файл.\n`,{mode:0o600});
 console.log(`Metabase настроен: ${definitions.length} карточек и источник метрик общего дашборда, ${state.facts.orders.length} демозаказов.\nМетрики доступны через обычный адрес приложения, в том числе по LAN.\nДоступ администратора: .data/metabase/ACCESS.txt`);
}finally{if(session)await api('/session','DELETE',{session_id:session}).catch(()=>{});}
