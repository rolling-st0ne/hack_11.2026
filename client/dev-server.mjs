import {createServer,request as proxyRequest} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {allowedHost,lanAddresses} from '../server/network.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const assets=new Set(['/index.html','/app.js','/styles.css','/favicon.svg']);
const server=createServer((req,res)=>{
  if(!allowedHost(req.headers.host)){res.writeHead(403);res.end('Host not allowed');return;}
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname.startsWith('/api/')){
    const upstream=proxyRequest({hostname:'127.0.0.1',port:Number(process.env.API_PORT)||8080,path:req.url,method:req.method,headers:req.headers,timeout:30000},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'API недоступен. Проверьте локальный сервер.',code:'api_unavailable'}));});upstream.on('timeout',()=>upstream.destroy());req.pipe(upstream);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const relative=url.pathname==='/'?'/index.html':url.pathname;
  if(!assets.has(relative)){res.writeHead(404);res.end('Not found');return;}
  try{const path=resolve(root,'.'+relative);res.writeHead(200,{'content-type':mime[extname(path)],'content-length':statSync(path).size,'cache-control':'no-cache','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'same-origin'});res.end(req.method==='HEAD'?undefined:readFileSync(path));}catch{res.writeHead(404);res.end();}
});
const port=Number(process.env.PORT)||3000,host=process.env.CLIENT_HOST||'0.0.0.0';
server.listen(port,host,()=>{console.log(`Дашборд → http://localhost:${port}`);for(const item of lanAddresses())console.log(`LAN (${item.interface}) → http://${item.address}:${port}`);});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
