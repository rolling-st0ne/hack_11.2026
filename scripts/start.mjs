import {spawn} from 'node:child_process';
import {mkdirSync,openSync,writeFileSync,existsSync,readFileSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=resolve(root,'.data');mkdirSync(dir,{recursive:true,mode:0o700});
const pidfile=resolve(dir,'server.pid');
if(process.argv.includes('--background')){
  if(existsSync(pidfile)){try{process.kill(Number(readFileSync(pidfile,'utf8')),0);console.log('Сервер уже запущен. PID:',readFileSync(pidfile,'utf8').trim());process.exit(0);}catch{}}
  const log=openSync(resolve(dir,'server.log'),'a',0o600),child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--managed'],{cwd:root,detached:true,stdio:['ignore',log,log],env:process.env});child.unref();writeFileSync(pidfile,String(child.pid),{mode:0o600});console.log('Локальный сервер запущен. PID:',child.pid);process.exit(0);
}
const children=['server/server.mjs','client/dev-server.mjs'].map(file=>spawn(process.execPath,[file],{cwd:root,stdio:'inherit',env:process.env}));
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');if(process.argv.includes('--managed')&&existsSync(pidfile)&&Number(readFileSync(pidfile,'utf8'))===process.pid)unlinkSync(pidfile);setTimeout(()=>process.exit(code),500);}
for(const child of children)child.on('exit',code=>stop(code||0));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
console.log('Учётные записи: .data/auth/ACCESS.txt (не добавлять в Git)');
