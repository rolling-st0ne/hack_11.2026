import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const css=readFileSync(new URL('../client/styles.css',import.meta.url),'utf8');
const light=css.match(/:root\{--readable-muted:([^}]+)\}/)[1],dark=css.match(/\[data-theme="dark"\]\{--readable-muted:([^}]+)\}/)[1];
const palette=s=>Object.fromEntries(('readable-muted:'+s).split(';').filter(Boolean).map(pair=>pair.replace(/^--/,'').split(':')));
const lum=hex=>{const c=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const results=[];for(const [theme,source] of [['light',light],['dark',dark]]){const p=palette(source);for(const [name,a,b] of [['muted',p['readable-muted'],p['readable-surface']],['body',p['readable-ink'],p['readable-surface']],['primary action',p['action-ink'],p['action-bg']]]){const value=ratio(a,b);assert.ok(value>=4.5,`${theme} ${name}: ${value}`);results.push({theme,name,foreground:a,background:b,ratio:Math.round(value*100)/100});}}
console.log(JSON.stringify({criterion:'4.5:1 normal text for explicit primary palette pairs',results,scope:'Static palette calculation; visual responsive and keyboard checks are recorded separately.'},null,2));
