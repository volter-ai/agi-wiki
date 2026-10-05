import { HttpError, now, type Env, type User } from './types.js';
export function randomToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function hash(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function ipKey(request:Request,env:Env){return hash(env.AUTH_SECRET+':ip:'+(request.headers.get('cf-connecting-ip')||'local'));}
export async function rate(env:Env,key:string,limit:number,seconds:number){
 const window=Math.floor(now()/seconds);
 const result=await env.DB.prepare('INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key,window) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(key,window,limit).first();
 if(!result)throw new HttpError(429,'Too many requests. Please try again later.');
}
export function sessionCookie(request:Request){return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('wc_session='))?.slice(11);}
export async function currentUser(request:Request,env:Env):Promise<User|null>{
 const token=sessionCookie(request);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 return env.DB.prepare('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>? AND u.blocked=0').bind(await hash(token),now()).first<User>();
}
export async function requireUser(request:Request,env:Env){const user=await currentUser(request,env);if(!user)throw new HttpError(401,'Verify your email to contribute.');return user;}
export async function requireAdmin(request:Request,env:Env){const user=await requireUser(request,env);if(user.role!=='admin')throw new HttpError(403,'Moderator access required.');return user;}
export async function readJSON(request:Request,maxBytes=180000):Promise<any>{
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'Send JSON.');
 if(Number(request.headers.get('content-length'))>maxBytes)throw new HttpError(413,'This upload is too large.');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Request body missing.');
 const decoder=new TextDecoder();let size=0,text='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new HttpError(413,'This upload is too large.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Invalid JSON.');}finally{reader.releaseLock();}
}
export function assertWriteOrigin(request:Request,env:Env){
 if(request.method==='GET'||request.method==='HEAD')return;
 const origin=request.headers.get('origin');
 if(origin&&origin!==env.PUBLIC_ORIGIN)throw new HttpError(403,'Cross-site requests are not allowed.');
 if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('x-wikichat-client')!=='1')throw new HttpError(403,'This request could not be verified.');
}
export const safeUser=(u:User,reputation=0)=>({id:u.id,username:u.username,bio:u.bio,role:u.role,reputation,createdAt:u.created_at});
