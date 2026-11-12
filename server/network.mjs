import {networkInterfaces,hostname} from 'node:os';
import {isIP} from 'node:net';
export function lanAddresses(){return Object.entries(networkInterfaces()).filter(([name])=>/^en\d+$/.test(name)).flatMap(([name,values])=>values.filter(x=>x.family==='IPv4'&&!x.internal).map(x=>({interface:name,address:x.address})));}
function hostName(value){
  if(typeof value!=='string'||!value||/[\s/\\?#@]/.test(value))throw new Error('Invalid Host');
  return new URL('http://'+value).hostname;
}
export function publicOrigin(env=process.env){
  if(!env.CONTOUR_PUBLIC_ORIGIN)return null;
  const url=new URL(env.CONTOUR_PUBLIC_ORIGIN);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('CONTOUR_PUBLIC_ORIGIN must be an HTTP(S) origin without a path.');
  return url.origin;
}
export function allowedHost(value,env=process.env){
  try{
    const host=hostName(value),origin=publicOrigin(env);
    // Literal IPs are needed behind Docker port publishing, where the host's LAN
    // interfaces are not visible. Arbitrary DNS names remain disallowed.
    if(isIP(host.replace(/^\[|\]$/g,'')))return true;
    const configured=(env.CONTOUR_ALLOWED_HOSTS||'').split(',').map(s=>s.trim()).filter(Boolean).map(hostName);
    return ['localhost',hostname().toLowerCase(),hostname().toLowerCase()+'.local',...(origin?[new URL(origin).hostname]:[]),...configured].includes(host);
  }catch{return false;}
}
export function requestOrigin(authority,env=process.env){
  const origin=publicOrigin(env),incoming=new URL('http://'+authority);
  // Trust only an explicitly configured origin, never client-supplied forwarded
  // headers. Keep HTTP for health checks and direct LAN access.
  return origin&&incoming.host===new URL(origin).host?origin:incoming.origin;
}
