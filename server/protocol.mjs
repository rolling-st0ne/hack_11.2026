export class ApiError extends Error {
  constructor(status,message,code='validation_error'){super(message);this.status=status;this.code=code;}
}
export const fail=(status,message,code)=>{throw new ApiError(status,message,code);};
export const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
export const log=(state,actor,action,object,result,success=true)=>state.audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),actor:actor.id,actorName:actor.name,action,object,result,success});
