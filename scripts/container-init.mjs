import {mkdirSync,chownSync,chmodSync} from 'node:fs';

// Only the two Docker-managed volume roots; no recursive ownership changes.
for(const path of ['/app/.data','/metabase-source']){
  mkdirSync(path,{recursive:true});
  chmodSync(path,0o700);
  chownSync(path,1000,1000);
}
console.log('Persistent storage prepared for the application user.');
