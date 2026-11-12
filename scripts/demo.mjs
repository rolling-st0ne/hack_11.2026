import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createSeed} from '../server/seed.mjs';
import {FilesystemAdapter} from '../server/adapters.mjs';
import {createFilesystemStore} from '../server/filesystem-store.mjs';
import {createAuth} from '../server/auth.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),dir=resolve(root,'.data/presentation-offline');
const pointer=resolve(dir,'current.json'),mode=process.argv[2]||'prepare';
if(!['prepare','start'].includes(mode))throw new Error('Use prepare or start');
mkdirSync(dir,{recursive:true,mode:0o700});
if(mode==='prepare'||!existsSync(pointer)){
 const run=resolve(dir,new Date().toISOString().replace(/[:.]/g,'-'));
 const files=resolve(run,'files'),auth=resolve(run,'auth'),state=createSeed();
 createFilesystemStore(files,FilesystemAdapter.encode(state).files,state);createAuth(auth);
 const config={files,auth,generatedAt:state.facts.generatedAt};
 writeFileSync(pointer,JSON.stringify(config,null,2),{mode:0o600});
 console.log('Новый автономный демонабор готов. Рабочие данные и предыдущие репетиции сохранены.');
}
const config=JSON.parse(readFileSync(pointer,'utf8'));
console.log('Учётные записи: '+resolve(config.auth,'ACCESS.txt'));
console.log('Данные: '+config.files);
if(mode==='start'){
 const port=process.env.PORT||'3311';
 console.log('Автономный резервный стенд: http://localhost:'+port+' (Metabase выключен; источники подписаны Filesystem).');
 const child=spawn(process.execPath,[resolve(root,'scripts/start.mjs')],{cwd:root,stdio:'inherit',env:{...process.env,CONTOUR_FILES:config.files,CONTOUR_AUTH:config.auth,CONTOUR_BI:'off',PORT:port,API_PORT:process.env.API_PORT||'18110'}});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 child.on('exit',code=>process.exit(code||0));
}
