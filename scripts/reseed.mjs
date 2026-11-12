import {mkdirSync,writeFileSync,cpSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSeed} from '../server/seed.mjs';
import {FilesystemAdapter} from '../server/adapters.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),path=resolve(root,'data/filesystem');
if(existsSync(path)){const backup=resolve(root,'.data/seed-backups',String(Date.now()));mkdirSync(backup,{recursive:true});cpSync(path,backup,{recursive:true});console.log('Seed backup:',backup);}
mkdirSync(path,{recursive:true});
for(const [name,csv] of Object.entries(FilesystemAdapter.encode(createSeed()).files))writeFileSync(resolve(path,name),csv);
console.log('Initial CSV fixtures refreshed. Existing runtime data and decisions are unchanged.');
