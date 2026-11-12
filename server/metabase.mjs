import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fail} from './protocol.mjs';
import {sourceTime} from './data-contract.mjs';
import {applyMetabaseResult,markMetabaseUnavailable} from './metabase-query.mjs';

export const canViewMetabase=actor=>['executive','analyst'].includes(actor.role);
export function signEmbed(payload,secret){
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const body=encode({alg:'HS256',typ:'JWT'})+'.'+encode(payload);
  return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
}

// Metabase reads its own snapshot. No SQL or database credentials reach the browser.
export function syncMetabaseSnapshot(directory,state){
  mkdirSync(directory,{recursive:true,mode:0o700});
  const db=new DatabaseSync(resolve(directory,'analytics.sqlite'));
  try{
    db.exec(`PRAGMA busy_timeout=10000;
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, created_at TEXT, day TEXT,
      department TEXT, product TEXT, market TEXT, region TEXT, revenue REAL, completed INTEGER,
      defect INTEGER, on_time INTEGER);
      CREATE TABLE IF NOT EXISTS snapshot (fingerprint TEXT, source_updated_at TEXT, synced_at TEXT);`);
    const columns=db.prepare('PRAGMA table_info(orders)').all().map(c=>c.name);
    const migrated=!columns.includes('epoch_ms')||!columns.includes('channel');
    if(!columns.includes('epoch_ms'))db.exec('ALTER TABLE orders ADD COLUMN epoch_ms REAL');
    if(!columns.includes('channel'))db.exec('ALTER TABLE orders ADD COLUMN channel TEXT');
    const previous=db.prepare('SELECT * FROM snapshot LIMIT 1').get();
    if(!migrated&&state.sourceFingerprint&&previous?.fingerprint===state.sourceFingerprint)return previous;
    db.exec('BEGIN IMMEDIATE');
    try{
      db.exec('DELETE FROM orders; DELETE FROM snapshot;');
      const insert=db.prepare('INSERT INTO orders (id,created_at,day,department,product,market,region,revenue,completed,defect,on_time,epoch_ms,channel) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
      for(const o of new Map(state.facts.orders.map(o=>[o.id,o])).values()){
        const created=new Date(o.createdAt).toISOString();
        insert.run(o.id,created,new Date(Date.parse(created)+3*3600000).toISOString().slice(0,10),o.department,o.productId,o.market??'',o.regionId??'',o.revenue,Number(Boolean(o.completed)),Number(Boolean(o.defect)),Number(Boolean(o.onTime)),Date.parse(created),o.channel??'');
      }
      const meta={fingerprint:state.sourceFingerprint||'',source_updated_at:sourceTime(state.facts,['orders.csv']),synced_at:new Date().toISOString()};
      db.prepare('INSERT INTO snapshot VALUES (?,?,?)').run(meta.fingerprint,meta.source_updated_at,meta.synced_at);
      db.exec('COMMIT');return meta;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }finally{db.close();}
}

export function createMetabase(directory,{request=fetch,snapshotDirectory=directory}={}){
  const configPath=resolve(directory,'config.json');
  const configured=()=>existsSync(configPath)&&Boolean(JSON.parse(readFileSync(configPath,'utf8')).ready);
  const cache=new Map();let queue=Promise.resolve();
  return {
    available:actor=>canViewMetabase(actor)&&configured(),
    async enrich(state,actor,view){
      if(!configured())return view;
      const config=JSON.parse(readFileSync(configPath,'utf8'));
      const provenance={dataset:'Фотопринт · демозаказы',upstream:'Filesystem / orders.csv',questionId:config.metricCardId||null,sourceUpdatedAt:sourceTime(state.facts,['orders.csv'])};
      try{
        if(!config.metricCardId)throw new Error('Question not configured');
        const f=view.filters,params={start:f.start,end:f.end,buckets:f.days===1?8:Math.min(f.days,28),scope:actor.departments.join(','),department:f.department,product:f.product,market:f.market,region:f.region};
        const key=JSON.stringify([state.sourceFingerprint,config.metricCardId,params]);
        let entry=cache.get(key);
        if(!entry||entry.expires<Date.now()){
          const job=queue.then(async()=>{
            const snapshot=syncMetabaseSnapshot(snapshotDirectory,state);
            const token=signEmbed({resource:{question:config.metricCardId},params,exp:Math.floor(Date.now()/1000)+120},config.secret);
            const response=await request(config.url+'/api/embed/card/'+token+'/query',{signal:AbortSignal.timeout(10000)});
            if(!response.ok)throw new Error('Metabase query failed');
            return {result:await response.json(),snapshotAt:snapshot.synced_at,queriedAt:new Date().toISOString()};
          });
          queue=job.catch(()=>{});entry={promise:job,expires:Date.now()+30000};cache.set(key,entry);
          for(const [k,v] of cache)if(v.expires<Date.now())cache.delete(k);
          if(cache.size>100)cache.delete(cache.keys().next().value);
          job.catch(()=>{if(cache.get(key)===entry)cache.delete(key);});
        }
        const payload=await entry.promise;
        applyMetabaseResult(view,payload.result,{...provenance,snapshotAt:payload.snapshotAt,queriedAt:payload.queriedAt});
      }catch{markMetabaseUnavailable(view,provenance);}
      const status=view.kpis.some(k=>k.sourceInfo?.status==='unavailable')?'error':'connected';
      view.connectors=[...view.connectors.filter(c=>c.id!=='metabase'),{id:'metabase',name:'Metabase',short:'MB',color:'blue',status,mode:'demo',description:'Метрики, история и разрезы из сохранённого отчёта Metabase',lastSync:view.kpis.find(k=>k.sourceInfo?.id==='metabase')?.sourceInfo?.queriedAt||null,failure:status==='error',readOnly:true}];
      return view;
    },
    async embed(state,actor,filters){
      if(!canViewMetabase(actor))fail(403,'BI-образец доступен директору и аналитику.','forbidden');
      if(!configured())fail(503,'Metabase ещё не настроен.','metabase_unconfigured');
      const config=JSON.parse(readFileSync(configPath,'utf8'));
      try{
        const health=await fetch(config.url+'/api/health',{signal:AbortSignal.timeout(3000)});
        if(!health.ok)throw new Error('unhealthy');
      }catch{fail(503,'Metabase недоступен. Запустите npm run bi:start.','metabase_unavailable');}
      const snapshot=syncMetabaseSnapshot(snapshotDirectory,state);
      const expires=Math.floor(Date.now()/1000)+600;
      const token=signEmbed({resource:{dashboard:config.dashboardId},params:{
        from:new Date(filters.start).toISOString(),to:new Date(filters.end).toISOString(),
        department:filters.department,product:filters.product,market:filters.market,region:filters.region
      },exp:expires},config.secret);
      return {url:config.url+'/embed/dashboard/'+token+'#bordered=false&titled=false&theme=transparent',expiresAt:expires*1000,sourceUpdatedAt:snapshot.source_updated_at,syncedAt:snapshot.synced_at,rows:state.facts.orders.length};
    }
  };
}
