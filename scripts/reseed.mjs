import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSeed} from '../src/seed.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const path=process.env.CONTOUR_DB||resolve(root,'.data/contour.sqlite');
mkdirSync(dirname(path),{recursive:true});
const db=new DatabaseSync(path);
db.exec(readFileSync(resolve(root,'drizzle/0000_contour.sql'),'utf8'));
const old=db.prepare('SELECT payload FROM contour_state WHERE id = 1').get();
if(old){const backup=path+'.backup-'+Date.now()+'.json';writeFileSync(backup,old.payload,{mode:0o600});console.log('Previous demo state backed up:',backup);}
db.prepare('INSERT INTO contour_state (id, version, payload) VALUES (1, 0, ?) ON CONFLICT(id) DO UPDATE SET version = version + 1, payload = excluded.payload').run(JSON.stringify(createSeed()));
db.close();
console.log('Demo reloaded: 1,800 orders, 360 customers, 800 interactions. Sessions cleared.');
