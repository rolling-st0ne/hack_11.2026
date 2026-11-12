import {readFileSync,existsSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),pidfile=resolve(root,'.data/server.pid');
if(!existsSync(pidfile)){console.log('Фоновый сервер не зарегистрирован.');process.exit(0);}
const pid=Number(readFileSync(pidfile,'utf8'));
let command='';try{command=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'});}catch{}
if(command.includes(resolve(root,'scripts/start.mjs'))){process.kill(pid,'SIGTERM');for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,100));try{process.kill(pid,0);}catch{break;}}console.log('Сервер остановлен.');}
else{unlinkSync(pidfile);console.log('Устаревший PID удалён; чужие процессы не затронуты.');}
