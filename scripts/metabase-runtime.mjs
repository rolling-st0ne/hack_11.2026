import {spawn,execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,unlinkSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=resolve(root,'.data/metabase'),runtime=resolve(dir,'runtime');
mkdirSync(dir,{recursive:true,mode:0o700});
const pidfile=resolve(dir,'metabase.pid'),action=process.argv[2]||'start';
let pid=existsSync(pidfile)?Number(readFileSync(pidfile,'utf8')):null;
let owned=false;
if(pid)try{owned=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).includes(resolve(runtime,'metabase.jar'));}catch{}
if(action==='stop'){
  if(owned)process.kill(pid,'SIGTERM');
  if(existsSync(pidfile))unlinkSync(pidfile);
  console.log(owned?'Metabase остановлен.':'Metabase не запущен.');
}else if(action==='start'){
  if(owned){console.log('Metabase уже запущен: http://localhost:3001');process.exit(0);}
  const javaDir=existsSync(runtime)?readdirSync(runtime).find(n=>n.startsWith('jdk-')):null;
  const java=process.env.METABASE_JAVA||(javaDir?resolve(runtime,javaDir,'Contents/Home/bin/java'):null);
  if(!java||!existsSync(java)||!existsSync(resolve(runtime,'metabase.jar')))throw new Error('Сначала выполните npm run bi:install (требуется Java 25).');
  const log=openSync(resolve(dir,'metabase.log'),'a',0o600);
  const child=spawn(java,['-Xmx768m','--add-opens=java.base/java.nio=ALL-UNNAMED','-jar',resolve(runtime,'metabase.jar')],{
    cwd:dir,detached:true,stdio:['ignore',log,log],env:{...process.env,
      MB_JETTY_HOST:'127.0.0.1',MB_JETTY_PORT:'3001',MB_DB_TYPE:'h2',MB_DB_FILE:resolve(dir,'metabase'),
      MB_ANON_TRACKING_ENABLED:'false',MB_CHECK_FOR_UPDATES:'false',MB_SITE_URL:'http://localhost:3001',MB_SITE_LOCALE:'ru',MB_REPORT_TIMEZONE:'Europe/Minsk',MB_LOAD_SAMPLE_CONTENT:'false',MB_LOAD_SAMPLE_DATA:'false'
    }});
  child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.unref();writeFileSync(pidfile,String(child.pid),{mode:0o600});
  console.log('Metabase запускается: http://localhost:3001 · журнал .data/metabase/metabase.log');
}else throw new Error('Ожидается start или stop');
