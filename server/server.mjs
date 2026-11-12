import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {handleApi} from './api.mjs';
import {createFilesystemStore,readCsvDirectory} from './filesystem-store.mjs';
import {FilesystemAdapter} from './adapters.mjs';
import {createAuth} from './auth.mjs';
import {allowedHost,requestOrigin,publicOrigin} from './network.mjs';
import {createMetabase} from './metabase.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
publicOrigin(); // Fail early on an invalid deployment origin.
const directory=process.env.CONTOUR_FILES||resolve(root,'.data/filesystem');
const auth=createAuth(process.env.CONTOUR_AUTH||resolve(root,'.data/auth'));
const metabase=process.env.CONTOUR_BI==='off'?null:createMetabase(process.env.CONTOUR_BI||resolve(root,'.data/metabase'),{snapshotDirectory:process.env.CONTOUR_METABASE_SNAPSHOT});
let legacyState;const legacy=resolve(root,'.data/contour.sqlite');
if(!process.env.CONTOUR_FILES&&!existsSync(resolve(directory,'CURRENT'))&&existsSync(legacy)){
  const db=new DatabaseSync(legacy,{readOnly:true}),row=db.prepare('SELECT payload FROM contour_state WHERE id = 1').get();
  if(row)legacyState=FilesystemAdapter.decode(JSON.parse(row.payload));db.close();
}
const store=createFilesystemStore(directory,readCsvDirectory(resolve(root,'data/filesystem')),legacyState);
const server=createServer(async(req,res)=>{
  try{
    if(!allowedHost(req.headers.host)){res.writeHead(403);res.end('Host not allowed');return;}
    const url=new URL(req.url,requestOrigin(req.headers.host));
    if(!url.pathname.startsWith('/api/')){res.writeHead(404);res.end('API only');return;}
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>2097152){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await handleApi(request,store,{auth,metabase});
    res.writeHead(response.status,{'x-content-type-options':'nosniff',...Object.fromEntries(response.headers)});res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error('Request failed:',error.message);res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:'Ошибка локального API',code:'internal_error'}));}
});
const port=Number(process.env.API_PORT)||8080,host=process.env.API_HOST||'127.0.0.1';
server.requestTimeout=30000;server.headersTimeout=10000;
server.listen(port,host,()=>console.log(`API → http://${host}:${port}/api/health`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
