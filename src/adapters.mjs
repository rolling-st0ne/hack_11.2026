import {parseCsv,writeCsv} from './csv.mjs';

export const TABLES={orders:'facts.orders',customers:'facts.customers',interactions:'facts.interactions',staff:'facts.staff',performance:'facts.performance',process_orders:'orders',signals:'signals',tasks:'tasks',checks:'checks',audit:'audit',adapters:'connectors'};
export const IMPORTABLE=['orders','customers','interactions','staff','performance'];
const at=(state,path)=>path.split('.').reduce((s,k)=>s?.[k],state);
const put=(state,path,value)=>{const keys=path.split('.');if(keys.length===2)state[keys[0]][keys[1]]=value;else state[path]=value;};
export function normalizeSources(state){
  if(!state.connectors?.some(c=>c.id==='filesystem'))state.connectors=[
    {id:'filesystem',name:'Filesystem',category:'CSV-файлы',kind:'custom',short:'FS',color:'green',events:0,status:'connected',lastSync:state.lastUpdated,failure:false},
    {id:'bitrix',name:'Битрикс24',category:'Клиенты и сделки',kind:'builtin',short:'Б24',color:'blue',events:0,status:'unconfigured',lastSync:null,failure:false}
  ];
  state.facts.performance??=[{id:'anna',name:'Анна Смирнова',direction:'Операции',hours:40,completed:240,isAgent:false},{id:'daria',name:'Дарья Соколова',direction:'Клиентский сервис',hours:36,completed:216,isAgent:false},{id:'igor',name:'Игорь Петров',direction:'Развитие',hours:44,completed:264,isAgent:false},{id:'mary',name:'Mary',direction:'AI-менеджер',hours:40,completed:720,isAgent:true}];
  state.signals.forEach(s=>s.source='filesystem');
  state.orders.forEach(o=>o.events?.forEach(e=>e.source='filesystem'));
  return state;
}
export class FilesystemAdapter {
  static encode(state){
    normalizeSources(state);
    const files={},schema=[];
    for(const [name,path] of Object.entries(TABLES)){
      const rows=at(state,path)||[];
      const headers=Array.from(new Set(rows.flatMap(r=>Object.keys(r))));
      if(!headers.length)headers.push('id');
      for(const field of headers){const sample=rows.find(r=>r[field]!=null)?.[field];schema.push({file:name+'.csv',field,type:sample==null?'string':typeof sample,nullable:rows.some(r=>r[field]==null)});}
      files[name+'.csv']=writeCsv(rows,headers);
    }
    files['schema.csv']=writeCsv(schema);
    files['metadata.csv']=writeCsv([{schemaVersion:3,generatedAt:state.facts.generatedAt,lastUpdated:state.lastUpdated}]);
    return {format:'csv-v1',files,private:{sessions:state.sessions||{},idempotency:state.idempotency||{},sourceEvents:state.sourceEvents||[]}};
  }
  static decode(payload){
    if(payload.format!=='csv-v1')return normalizeSources(payload);
    const schema=parseCsv(payload.files['schema.csv']).rows,meta=parseCsv(payload.files['metadata.csv']).rows[0];
    const state={schemaVersion:3,facts:{generatedAt:meta.generatedAt},lastUpdated:meta.lastUpdated,...payload.private};
    for(const [name,path] of Object.entries(TABLES))put(state,path,this.readTable(payload.files[name+'.csv'],schema.filter(s=>s.file===name+'.csv')));
    return normalizeSources(state);
  }
  static readTable(csv,schema){
    const parsed=parseCsv(csv),fields=schema.map(s=>s.field);
    if(fields.length!==parsed.headers.length||fields.some(f=>!parsed.headers.includes(f)))throw new Error('Колонки не соответствуют шаблону. Скачайте текущий CSV.');
    return parsed.rows.map((r,i)=>Object.fromEntries(schema.map(s=>{
      let value=r[s.field];
      if(value===''&&String(s.nullable)==='true')value=null;
      else if(s.type==='number'){if(!/^-?\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))throw new Error(`Строка ${i+2}, ${s.field}: ожидается число`);value=Number(value);}
      else if(s.type==='boolean'){if(!['true','false'].includes(value))throw new Error(`Строка ${i+2}, ${s.field}: ожидается true или false`);value=value==='true';}
      else if(s.type==='object')value=JSON.parse(value);
      return [s.field,value];
    })));
  }
  static import(state,name,csv){
    const table=name.replace(/\.csv$/,'');
    if(!IMPORTABLE.includes(table))throw new Error('Этот файл доступен только для чтения');
    const snapshot=this.encode(state),schema=parseCsv(snapshot.files['schema.csv']).rows.filter(s=>s.file===name);
    const rows=this.readTable(csv,schema);
    if(!rows.length)throw new Error('Файл должен содержать хотя бы одну запись');
    const ids=rows.map(r=>r.id||r.department);
    if(ids.some(id=>!id)||new Set(ids).size!==ids.length)throw new Error('Пустые или повторяющиеся идентификаторы');
    for(const r of rows){
      if(r.department&&!['books','photo','gifts'].includes(r.department))throw new Error('Неизвестное подразделение');
      if(r.productId&&!['book','prints','canvas','calendar','cards'].includes(r.productId))throw new Error('Неизвестный продукт');
      if(r.createdAt&&!Number.isFinite(Date.parse(r.createdAt)))throw new Error('Некорректная дата createdAt');
      if(Object.values(r).some(v=>typeof v==='number'&&v<0))throw new Error('Числа должны быть неотрицательными');
      if(r.stage!==undefined&&(!Number.isInteger(r.stage)||r.stage>7))throw new Error('Этап должен быть от 0 до 7');
      if(table==='performance'&&(!r.hours||!r.name))throw new Error('Нужны имя и положительное число рабочих часов');
    }
    if(table==='performance'&&(rows.filter(r=>r.isAgent).length!==1||!rows.some(r=>!r.isAgent)))throw new Error('Нужны один агент и хотя бы один сотрудник');
    const candidate=structuredClone(state);put(candidate,TABLES[table],rows);
    const customers=new Set(candidate.facts.customers.map(r=>r.id)),orders=new Map(candidate.facts.orders.map(r=>[r.id,r]));
    if(candidate.facts.orders.some(r=>!customers.has(r.customerId))||candidate.facts.interactions.some(r=>!orders.has(r.orderId)||orders.get(r.orderId).customerId!==r.customerId))throw new Error('Нарушены связи customerId / orderId');
    put(state,TABLES[table],rows);return rows.length;
  }
  static files(state){const p=this.encode(state);return Object.entries(p.files).map(([name,csv])=>({name,rows:parseCsv(csv).rows.length,bytes:new TextEncoder().encode(csv).length,writable:IMPORTABLE.includes(name.replace('.csv',''))}));}
}

// Built-in REST adapter. Credentials belong on the server, never in browser data.
export class Bitrix24Adapter {
  constructor(webhook,fetcher=fetch){this.webhook=webhook;this.fetcher=fetcher;}
  async readDeals(){
    if(!this.webhook)throw new Error('Битрикс24 не подключён: требуется серверный webhook');
    const base=new URL(this.webhook);if(base.protocol!=='https:')throw new Error('Webhook должен использовать HTTPS');
    const rows=[];let start=0;
    do {const response=await this.fetcher(new URL('crm.deal.list.json',base.href.replace(/\/?$/,'/')),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({start,select:['ID','TITLE','OPPORTUNITY','CURRENCY_ID','DATE_CREATE','CONTACT_ID']})});
      if(!response.ok)throw new Error('Битрикс24: HTTP '+response.status);
      const body=await response.json();if(body.error)throw new Error('Битрикс24: '+body.error);if(!Array.isArray(body.result))throw new Error('Некорректный ответ Битрикс24');
      rows.push(...body.result);if(body.next==null)break;if(!Number.isInteger(body.next)||body.next<=start)throw new Error('Некорректная пагинация Битрикс24');start=body.next;
    }while(rows.length<100000);
    return rows;
  }
}
