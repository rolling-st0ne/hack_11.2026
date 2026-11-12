import {randomBytes,scryptSync,timingSafeEqual,createHash,createHmac} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {ACTORS} from './seed.mjs';
import {fail,json,log} from './protocol.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
const cookie=req=>(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('contour_session='))?.slice(16);
const system={id:'system',name:'Система'};
export function createAuth(directory){
  mkdirSync(directory,{recursive:true,mode:0o700});
  const path=resolve(directory,'users.json');
  if(!existsSync(path)){
    const users={},access=['Фотопринт — локальные учётные записи','Пароли для синтетических данных. Передавайте каждому только его учётную запись.',''];
    for(const [username,actor] of Object.entries(ACTORS)){
      const password=randomBytes(15).toString('base64url'),salt=secret();
      users[username]={role:username,salt,hash:scryptSync(password,salt,64).toString('hex')};
      access.push(`${actor.name} · ${actor.title}\nЛогин: ${username}\nПароль: ${password}\n`);
    }
    writeFileSync(path,JSON.stringify({users,tokenKey:secret()},null,2),{mode:0o600});
    writeFileSync(resolve(directory,'ACCESS.txt'),access.join('\n'),{mode:0o600});
  }
  chmodSync(path,0o600);
  const config=JSON.parse(readFileSync(path,'utf8')),attempts=new Map();
  const signingKey=config.tokenKey;
  const cookieHeader=(request,value,age)=>`contour_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
  async function authenticate(request,state){
    const bearer=request.headers.get('authorization');
    const raw=bearer?.startsWith('Bearer ')?bearer.slice(7):cookie(request);
    const id=raw&&digest(raw),session=id&&state.sessions[id];
    if(!session?.secure||session.expires<=Date.now()||session.revoked||!ACTORS[session.role])fail(401,'Войдите в свою учётную запись.','unauthorized');
    if((bearer&&session.kind!=='agent')||(!bearer&&session.kind!=='browser'))fail(401,'Неверный тип авторизации.','unauthorized');
    return {...session,id,actor:ACTORS[session.role]};
  }
  function requireBrowser(request,identity){
    if(identity.kind!=='browser')fail(403,'Агент не может подтверждать изменения или управлять доступом. Откройте предложение в дашборде.','human_confirmation_required');
    if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-csrf-token')!==identity.csrf)fail(403,'Подтверждение требует сессии пользователя, Origin и CSRF-токена.','csrf_required');
  }
  async function handle(request,store,body){
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(path==='/api/auth/config'&&method==='GET')return json({mode:'authenticated',login:'/api/auth/login'});
    if(path==='/api/session')fail(403,'Выбор демороли отключён на локальном сервере. Используйте вход.','demo_login_disabled');
    if(path==='/api/auth/login'&&method==='POST'){
      const username=String(body.username||'').slice(0,80),attempt=attempts.get(username)||{count:0,until:Date.now()+600000};
      if(attempt.until<Date.now()){attempt.count=0;attempt.until=Date.now()+600000;}
      if(attempt.count>=12)fail(429,'Слишком много попыток. Повторите через 10 минут.','rate_limited');
      const record=Object.hasOwn(config.users,username)?config.users[username]:null;
      const password=typeof body.password==='string'?body.password:'';
      const hashed=scryptSync(password.slice(0,512),record?.salt||'missing-user',64);
      if(!record||!timingSafeEqual(hashed,Buffer.from(record.hash,'hex'))){attempt.count++;attempts.set(username,attempt);await store.update(s=>log(s,system,'login_failed','session','Неверные учётные данные',false));fail(401,'Неверный логин или пароль.','invalid_credentials');}
      attempts.delete(username);const token=secret(),id=digest(token),csrf=secret(),actor=ACTORS[record.role];
      await store.update(s=>{for(const [key,value] of Object.entries(s.sessions))if(value.expires<=Date.now())delete s.sessions[key];const old=cookie(request);if(old)delete s.sessions[digest(old)];s.sessions[id]={role:record.role,secure:true,kind:'browser',csrf,expires:Date.now()+12*3600000};log(s,actor,'login',actor.id,'Вход в локальный контур');});
      return json({actor,csrf,expiresIn:43200},200,{'set-cookie':cookieHeader(request,token,43200)});
    }
    if(!path.startsWith('/api/auth/'))return null;
    const state=await store.read(),identity=await authenticate(request,state),actor=identity.actor;
    if(path==='/api/auth/me'&&method==='GET')return json({actor,kind:identity.kind,expiresAt:new Date(identity.expires).toISOString(),...(identity.kind==='browser'?{csrf:identity.csrf}:{scopes:identity.scopes})});
    if(path==='/api/auth/tokens'&&method==='GET'){
      if(identity.kind!=='browser')fail(403,'Управление токенами доступно пользователю.','forbidden');
      return json({tokens:Object.entries(state.sessions).filter(([,v])=>v.kind==='agent'&&v.role===actor.key&&!v.revoked&&v.expires>Date.now()).map(([id,v])=>({id,label:v.label,scopes:v.scopes,expiresAt:new Date(v.expires).toISOString()}))});
    }
    if(method!=='POST')fail(404,'Маршрут не найден.','not_found');
    requireBrowser(request,identity);
    if(path==='/api/auth/logout'){
      await store.update(s=>{delete s.sessions[identity.id];log(s,actor,'logout',actor.id,'Выход');});
      return json({ok:true},200,{'set-cookie':cookieHeader(request,'',0)});
    }
    const key=request.headers.get('idempotency-key');if(!key||key.length<8||key.length>128)fail(400,'Нужен Idempotency-Key длиной 8–128 символов.','missing_idempotency_key');
    const fingerprint=JSON.stringify({path,body}),cacheKey=`auth:${identity.id}:${key}`;
    let result;
    await store.update(s=>{
      const active=s.sessions[identity.id];if(!active||active.expires<=Date.now())fail(401,'Сессия истекла.','unauthorized');
      const cached=s.idempotency[cacheKey];
      if(cached){if(cached.fingerprint!==fingerprint)fail(409,'Ключ уже использован для другого запроса.','idempotency_conflict');result={...cached.result,replayed:true};}
      else if(path==='/api/auth/tokens'){
        const scopes=body.scopes??['catalog:read','changes:propose'];
        if(!Array.isArray(scopes)||!scopes.length||scopes.some(x=>!['catalog:read','changes:propose'].includes(x))||new Set(scopes).size!==scopes.length)fail(400,'Допустимы catalog:read, changes:propose.');
        if(scopes.includes('changes:propose')&&!['executive','manager'].includes(actor.role))fail(403,'Предлагать изменения могут только руководители.','forbidden');
        const ttl=body.expiresIn??3600;if(!Number.isInteger(ttl)||ttl<60||ttl>28800)fail(400,'expiresIn: 60–28800 секунд.');
        const token=createHmac('sha256',signingKey).update(cacheKey).digest('base64url'),id=digest(token),expires=Date.now()+ttl*1000,label=String(body.label||'hack_3').slice(0,80);
        s.sessions[id]={role:actor.key,secure:true,kind:'agent',scopes,expires,label};result={id,label,scopes,expiresAt:new Date(expires).toISOString()};
        log(s,actor,'token_issued',id,'Выдан персональный токен: '+label);
      }else if(/^\/api\/auth\/tokens\/[a-f0-9]{64}\/revoke$/.test(path)){
        const id=path.split('/')[4],token=s.sessions[id];if(!token||token.kind!=='agent'||token.role!==actor.key)fail(404,'Токен не найден.','not_found');token.revoked=true;result={id,revoked:true};log(s,actor,'token_revoked',id,'Токен отозван');
      }else fail(404,'Маршрут не найден.','not_found');
      if(!cached)s.idempotency[cacheKey]={fingerprint,result};
    });
    if(path==='/api/auth/tokens')result.token=createHmac('sha256',signingKey).update(cacheKey).digest('base64url');
    return json(result);
  }
  return {handle,authenticate,requireBrowser};
}
