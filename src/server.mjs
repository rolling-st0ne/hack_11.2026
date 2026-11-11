import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { handleApi } from './api.mjs';
import { createFilesystemStore,readCsvDirectory } from './filesystem-store.mjs';
import { FilesystemAdapter } from './adapters.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory=process.env.CONTOUR_FILES||resolve(root,'.data/filesystem');
let legacyState;
const legacy=resolve(root,'.data/contour.sqlite');
if(!existsSync(resolve(directory,'CURRENT'))&&existsSync(legacy)){
  const db=new DatabaseSync(legacy,{readOnly:true});
  const row=db.prepare('SELECT payload FROM contour_state WHERE id = 1').get();
  if(row)legacyState=FilesystemAdapter.decode(JSON.parse(row.payload));db.close();
}
const store=createFilesystemStore(directory,readCsvDirectory(resolve(root,'data/filesystem')),legacyState);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    const origin=`http://${req.headers.host}`;
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/')){
      const chunks=[];let size=0;
      for await(const c of req){size+=c.length;if(size>2097152){res.writeHead(413);res.end();return;}chunks.push(c);}
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
process.on('SIGTERM',()=>server.close(()=>{process.exit(0);}));
