import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { handleApi } from './api.mjs';
import { createStore } from './store.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dataPath=process.env.CONTOUR_DB||resolve(root,'.data/contour.sqlite');
if(dataPath!==':memory:')mkdirSync(dirname(dataPath),{recursive:true});
const sqlite=new DatabaseSync(dataPath);
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec(readFileSync(resolve(root,'drizzle/0000_contour.sql'),'utf8'));
const db={prepare(sql){const stmt=sqlite.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async first(){return stmt.get(...args);},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}};}};}};
const store=createStore(db,'sqlite');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    const origin=`http://${req.headers.host}`;
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/')){
      const chunks=[];let size=0;
      for await(const c of req){size+=c.length;if(size>65536){res.writeHead(413);res.end();return;}chunks.push(c);}
      const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
      const response=await handleApi(request,store);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const relative=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
    const path=resolve(root,'public','.'+relative);
    if(!path.startsWith(resolve(root,'public')+'/')||!existsSync(path)){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-cache','x-content-type-options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:readFileSync(path));
  }catch(error){console.error(error);res.writeHead(500);res.end('Server error');}
});
const port=Number(process.env.PORT)||3000;
server.listen(port,'127.0.0.1',()=>console.log(`Фотопринт · Контур → http://localhost:${port}`));
process.on('SIGTERM',()=>server.close(()=>{sqlite.close();process.exit(0);}));
