// One saved Metabase question calculates the headline values, history and slices.
// Every input is supplied by the authenticated app server as a locked parameter.
export const METABASE_METRICS=['revenue','orders','defects'];
export const metricQueryParameters={start:'number',end:'number',buckets:'number',scope:'text',department:'text',product:'text',market:'text',region:'text'};
const scalarMeasures=(a,b,dimension=null)=>{
 const dim=dimension?` AND o.${dimension}=g.group_id`:'';
 return `(SELECT count(*) FROM filtered o WHERE o.epoch_ms>=${a} AND o.epoch_ms<${b}${dim}) AS orders,
 (SELECT round(coalesce(sum(o.revenue),0),2) FROM filtered o WHERE o.epoch_ms>=${a} AND o.epoch_ms<${b}${dim}) AS revenue,
 (SELECT round(100.0*sum(q.defective_units)/nullif(sum(q.produced_units),0),1) FROM production_jobs q JOIN filtered o ON o.id=q.order_id WHERE q.completed_ms>=${a} AND q.completed_ms<${b} AND (q.cancelled_ms IS NULL OR q.cancelled_ms>=q.completed_ms)${dim}) AS defects,
 (SELECT count(*) FROM production_jobs q JOIN filtered o ON o.id=q.order_id WHERE q.completed_ms>=${a} AND q.completed_ms<${b} AND (q.cancelled_ms IS NULL OR q.cancelled_ms>=q.completed_ms)${dim}) AS quality_jobs`;
};
export const metricQuery=`WITH RECURSIVE
bounds AS (SELECT {{start}} AS s, {{end}} AS e, {{buckets}} AS n),
steps(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM steps,bounds WHERE i+1<n),
filtered AS (
 SELECT * FROM orders WHERE instr(','||{{scope}}||',',','||department||',')>0
 AND ({{department}}='all' OR department={{department}})
 AND ({{product}}='all' OR product={{product}})
 AND ({{market}}='all' OR market={{market}})
 AND ({{region}}='all' OR region={{region}})
),
ranges(kind,idx,a,b) AS (
 SELECT 'total',0,s,e FROM bounds
 UNION ALL SELECT 'previous',0,2*s-e,s FROM bounds
 UNION ALL SELECT 'series',i,s+(e-s)*1.0*i/n,s+(e-s)*1.0*(i+1)/n FROM steps,bounds
 UNION ALL SELECT 'cumulative',i,s,s+(e-s)*1.0*(i+1)/n FROM steps,bounds
 UNION ALL SELECT 'previousSeries',i,2*s-e+(e-s)*1.0*i/n,2*s-e+(e-s)*1.0*(i+1)/n FROM steps,bounds
)
SELECT r.kind,cast(r.idx AS TEXT) AS group_id,r.a AS start_at,${scalarMeasures('r.a','r.b')}
 FROM ranges r
${['department','market','channel'].map(d=>`UNION ALL SELECT '${d}',g.group_id,NULL,${scalarMeasures('bounds.s','bounds.e',d)}
 FROM (SELECT DISTINCT ${d} AS group_id FROM filtered) g CROSS JOIN bounds`).join('\n')}`;

const format=(value,money=false)=>value===null?'—':value.toLocaleString('ru-RU',money?{minimumFractionDigits:2,maximumFractionDigits:2}:{maximumFractionDigits:1});
export function applyMetabaseResult(view,result,provenance){
 const rows=result?.data?.rows,columns=result?.data?.cols?.map(c=>c.name);
 if(result?.status!=='completed'||!Array.isArray(rows)||!['kind','group_id','start_at','orders','revenue','defects'].every(k=>columns?.includes(k)))throw new Error('Invalid Metabase result');
 const records=rows.map(row=>Object.fromEntries(columns.map((key,i)=>[key,row[i]])));
 const find=kind=>records.filter(r=>r.kind===kind).sort((a,b)=>Number(a.group_id)-Number(b.group_id));
 const current=find('total')[0],previous=find('previous')[0];
 const buckets=view.filters.days===1?8:Math.min(view.filters.days,28);
 if(!current||!previous||['series','cumulative','previousSeries'].some(kind=>find(kind).length!==buckets))throw new Error('Incomplete Metabase result');
 for(const r of records)for(const id of METABASE_METRICS)if(r[id]!==null&&!Number.isFinite(r[id]))throw new Error('Invalid Metabase metric');
 view.kpis=view.kpis.map(k=>{
  if(!METABASE_METRICS.includes(k.id))return k;
  const value=current[k.id],prior=previous[k.id],delta=value===null||prior===null?null:Math.round((value-prior)*10)/10;
  const plan=['revenue','orders'].includes(k.id)?Math.round(prior*1.08):k.plan;
  const bad=value!==null&&(k.id==='defects'?value>plan:value<plan);
  const breakdowns=Object.fromEntries(Object.entries(k.breakdowns).map(([dimension,groups])=>[dimension,groups.map(group=>{
   const record=records.find(r=>r.kind===dimension&&r.group_id===group.id);
   return {id:group.id,name:group.name,value:record?.[k.id]??(k.id==='defects'?null:0),orders:record?.orders||0};
  })]));
  return {...k,raw:value,value:format(value,k.id==='revenue'),previous:prior,delta,plan,
   forecast:format(value===null?null:['revenue','orders'].includes(k.id)?Math.round(value*1.08):value),
   change:delta===null?'Нет базы сравнения':`${delta>=0?'+':''}${format(delta)}${k.unit==='%'?' п.п.':''}`,
   state:value===null?'Нет данных':bad?'Требует внимания':'В норме',trend:value===null?'neutral':bad?'negative':'positive',
   series:find('series').map(r=>r[k.id]),cumulativeSeries:find('cumulative').map(r=>r[k.id]),previousSeries:find('previousSeries').map(r=>r[k.id]),
   breakdowns,sampleSize:k.id==='defects'?current.quality_jobs:current.orders,source:'Metabase',sourceAt:(k.id==='defects'?provenance.qualitySourceUpdatedAt:provenance.orderSourceUpdatedAt)||provenance.sourceUpdatedAt,updatedAt:provenance.queriedAt,
   sourceInfo:{id:'metabase',name:'Metabase',status:'ok',...provenance},sourceError:null};
 });
 if(view.kpis.some(k=>k.id==='orders'&&k.sourceInfo?.id==='metabase')){
  const actual=find('series'),prior=find('previousSeries');
  view.series=view.series.map((s,i)=>({...s,orders:actual[i].orders,previous:prior[i].orders}));
  view.seriesForecast=view.seriesForecast.map((s,i)=>({...s,orders:Math.round(current.orders/buckets*(1.06+i*.12))}));
 }
 return view;
}

export function markMetabaseUnavailable(view,provenance){
 view.kpis=view.kpis.map(k=>METABASE_METRICS.includes(k.id)?{...k,raw:null,value:'—',previous:null,delta:null,plan:'—',forecast:'—',change:'Источник недоступен',state:'Источник недоступен',trend:'neutral',
  series:[],cumulativeSeries:[],previousSeries:[],seriesLabels:[],breakdowns:{},sampleSize:null,source:'Metabase',
  sourceInfo:{id:'metabase',name:'Metabase',status:'unavailable',...provenance},sourceError:'Не удалось получить данные из Metabase. Повторите обновление.'}:k);
 view.series=view.series.map(s=>({...s,orders:null,previous:null}));
 return view;
}
