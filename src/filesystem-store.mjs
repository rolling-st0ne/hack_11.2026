import {readFileSync,writeFileSync,mkdirSync,readdirSync,renameSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {FilesystemAdapter} from './adapters.mjs';

export function readCsvDirectory(path){return Object.fromEntries(readdirSync(path).filter(n=>n.endsWith('.csv')).map(n=>[n,readFileSync(resolve(path,n),'utf8')]));}
export function createFilesystemStore(directory,seedFiles,legacyState){
  mkdirSync(directory,{recursive:true,mode:0o700});
  const pointer=resolve(directory,'CURRENT');
  function commit(state){
    const snapshot=FilesystemAdapter.encode(state),name='snapshot-'+Date.now()+'-'+crypto.randomUUID().slice(0,8),path=resolve(directory,name);
    mkdirSync(path,{mode:0o700});
    for(const [file,csv] of Object.entries(snapshot.files))writeFileSync(resolve(path,file),csv,{mode:0o600});
    writeFileSync(resolve(path,'private.json'),JSON.stringify(snapshot.private),{mode:0o600});
    const pending=pointer+'.'+crypto.randomUUID();writeFileSync(pending,name,{mode:0o600});renameSync(pending,pointer);
  }
  function read(){const path=resolve(directory,readFileSync(pointer,'utf8').trim());return FilesystemAdapter.decode({format:'csv-v1',files:readCsvDirectory(path),private:JSON.parse(readFileSync(resolve(path,'private.json'),'utf8'))});}
  if(!existsSync(pointer))commit(legacyState||FilesystemAdapter.decode({format:'csv-v1',files:seedFiles,private:{sessions:{},idempotency:{},sourceEvents:[]}}));
  let queue=Promise.resolve();
  return {kind:'filesystem',read:async()=>read(),update(fn){const run=queue.then(()=>{const state=read();fn(state);commit(state);});queue=run.catch(()=>{});return run;}};
}
