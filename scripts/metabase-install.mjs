import {mkdirSync,existsSync,createWriteStream,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=resolve(root,'.data/metabase/runtime');
mkdirSync(dir,{recursive:true,mode:0o700});
if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Автоустановка предназначена для Apple Silicon. Для другой платформы установите Java 25, задайте METABASE_JAVA и скачайте Metabase OSS 0.65.3 в .data/metabase/runtime/metabase.jar.');
async function get(url){const r=await fetch(url);if(!r.ok)throw new Error(`Загрузка не удалась: ${r.status} ${url}`);return r;}
async function download(url,file){if(existsSync(file))return;console.log('Загрузка '+url);await pipeline(Readable.fromWeb((await get(url)).body),createWriteStream(file+'.part',{mode:0o600}));renameSync(file+'.part',file);}
const release=await (await get('https://api.github.com/repos/adoptium/temurin25-binaries/releases/tags/jdk-25.0.5%2B8')).json();
const asset=release.assets.find(a=>a.name.startsWith('OpenJDK25U-jre_aarch64_mac_hotspot_')&&a.name.endsWith('.tar.gz'));
if(!asset)throw new Error('Официальный архив Java не найден.');
const archive=resolve(dir,'java.tar.gz');
await download(asset.browser_download_url,archive);
const expected=(await (await get(asset.browser_download_url+'.sha256.txt')).text()).trim().split(/\s/)[0];
if(createHash('sha256').update(readFileSync(archive)).digest('hex')!==expected)throw new Error('Контрольная сумма Java не совпала. Удалите java.tar.gz и повторите установку.');
execFileSync('tar',['-xzf',archive,'-C',dir]);
const url='https://downloads.metabase.com/v0.65.3/metabase.jar';
await download(url,resolve(dir,'metabase.jar'));
writeFileSync(resolve(dir,'manifest.json'),JSON.stringify({metabase:'0.65.3',java:'25.0.5+8',metabaseUrl:url,javaUrl:asset.browser_download_url,javaSha256:expected,metabaseSha256:createHash('sha256').update(readFileSync(resolve(dir,'metabase.jar'))).digest('hex')},null,2),{mode:0o600});
console.log('Готово. Далее: npm run bi:start && npm run bi:setup');
