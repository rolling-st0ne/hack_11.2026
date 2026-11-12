import {readFileSync,writeFileSync,mkdirSync,readdirSync,renameSync,existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {TABLES,FilesystemAdapter} from './adapters.mjs';
import {touchSources} from './data-contract.mjs';

export function readCsvDirectory(path){return Object.fromEntries(readdirSync(path).filter(n=>n.endsWith('.csv')).map(n=>[n,readFileSync(resolve(path,n),'utf8')]));}
export function createFilesystemStore(directory,seedFiles,legacyState){
  mkdirSync(directory,{recursive:true,mode:0o700});
  const pointer=resolve(directory,'CURRENT');
  function commit(state){
    const snapshot=FilesystemAdapter.encode(state),name='snapshot-'+Date.now()+'-'+crypto.randomUUID().slice(0,8),path=resolve(directory,name);
    // Reject unreadable output before writing or changing CURRENT.
    FilesystemAdapter.decode(snapshot);
    snapshot.private.sourceHashes=Object.fromEntries(Object.entries(snapshot.files).filter(([file])=>TABLES[file.replace('.csv','')]?.startsWith('facts.')).map(([file,csv])=>[file,createHash('sha256').update(csv).digest('hex')]));
    mkdirSync(path,{mode:0o700});
    for(const [file,csv] of Object.entries(snapshot.files))writeFileSync(resolve(path,file),csv,{mode:0o600});
    writeFileSync(resolve(path,'private.json'),JSON.stringify(snapshot.private),{mode:0o600});
    const pending=pointer+'.'+crypto.randomUUID();writeFileSync(pending,name,{mode:0o600});renameSync(pending,pointer);
  }
  function read(){const path=resolve(directory,readFileSync(pointer,'utf8').trim()),files=readCsvDirectory(path);const state=FilesystemAdapter.decode({format:'csv-v1',files,private:JSON.parse(readFileSync(resolve(path,'private.json'),'utf8'))});for(const [file,expected] of Object.entries(state.sourceHashes||{})){if(files[file]!==undefined&&createHash('sha256').update(files[file]).digest('hex')!==expected)touchSources(state.facts,[file],statSync(resolve(path,file)).mtime.toISOString());}
    const hash=createHash('sha256');for(const [name,target] of Object.entries(TABLES))if(target.startsWith('facts.'))hash.update(name+'\0'+(files[name+'.csv']||'')+'\0');state.sourceFingerprint=hash.digest('hex');return state;}
  if(!existsSync(pointer))commit(legacyState||FilesystemAdapter.decode({format:'csv-v1',files:seedFiles,private:{sessions:{},idempotency:{},sourceEvents:[]}}));
  let queue=Promise.resolve();
  return {kind:'filesystem',read:async()=>read(),update(fn){const run=queue.then(()=>{const state=read();fn(state);commit(state);});queue=run.catch(()=>{});return run;}};
}
