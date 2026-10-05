import { hash, randomToken, readJSON, rate, ipKey, safeUser } from './security.js';
import { HttpError, now, localDevelopment, type Env, type User } from './types.js';
export async function startLogin(request:Request,env:Env){
 const body=await readJSON(request,3000);const email=String(body.email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new HttpError(400,'Enter a valid email address.');
 await rate(env,'login-ip:'+await ipKey(request,env),10,3600);await rate(env,'login-email:'+await hash(email),5,3600);
 if(!localDevelopment(env,request)&&(!env.RESEND_API_KEY||!env.RESEND_FROM))throw new HttpError(503,'Email sign-in is not configured yet.');
 const id=crypto.randomUUID();const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%100000000).padStart(8,'0');const expires=now()+600;
 await env.DB.prepare('INSERT INTO auth_requests(id,email,code_hash,expires_at) VALUES(?,?,?,?)').bind(id,email,await hash(env.AUTH_SECRET+id+code),expires).run();
 if(localDevelopment(env,request))await env.DB.prepare('INSERT INTO dev_mailbox(request_id,code,expires_at) VALUES(?,?,?)').bind(id,code,expires).run();
 else{
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:env.RESEND_FROM,to:[email],subject:'Your WikiChat sign-in code',text:`Your WikiChat sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this message.`}),signal:AbortSignal.timeout(15000)});
   if(!response.ok){await env.DB.prepare('DELETE FROM auth_requests WHERE id=?').bind(id).run();throw new HttpError(503,'The sign-in email could not be sent. Please try again later.');}
 }
 return {requestId:id,development:localDevelopment(env,request)};
}
export async function verifyLogin(request:Request,env:Env){
 const body=await readJSON(request,3000);const id=String(body.requestId||''),code=String(body.code||'');
 if(!/^[\da-f-]{36}$/.test(id)||!/^\d{8}$/.test(code))throw new HttpError(400,'Enter the eight-digit code.');
 await rate(env,'verify:'+await ipKey(request,env),30,600);
 const challenge=await env.DB.prepare('UPDATE auth_requests SET attempts=attempts+1 WHERE id=? AND expires_at>? AND attempts<5 AND consumed=0 RETURNING email,code_hash').bind(id,now()).first<{email:string;code_hash:string}>();
 if(!challenge||challenge.code_hash!==await hash(env.AUTH_SECRET+id+code))throw new HttpError(401,'That code is invalid or expired.');
 const consumed=await env.DB.prepare('UPDATE auth_requests SET consumed=1 WHERE id=? AND consumed=0 RETURNING email').bind(id).first();
 if(!consumed)throw new HttpError(401,'That code has already been used.');
 const admins=(env.ADMIN_EMAILS||'').toLowerCase().split(',').map(s=>s.trim());
 let user=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(challenge.email).first<User>();
 if(!user){
   const userId=crypto.randomUUID();const username='contributor-'+randomToken().slice(0,10);
   await env.DB.prepare('INSERT OR IGNORE INTO users(id,email,username,role,created_at) VALUES(?,?,?,?,?)').bind(userId,challenge.email,username,admins.includes(challenge.email)?'admin':'user',now()).run();
   user=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(challenge.email).first<User>();
 }
 if(!user||user.blocked)throw new HttpError(403,'This contributor account cannot publish.');
 const token=randomToken();await env.DB.prepare('INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)').bind(await hash(token),user.id,now()+30*86400).run();
 await env.DB.prepare('DELETE FROM dev_mailbox WHERE request_id=?').bind(id).run();
 const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});
 headers.append('Set-Cookie',`wc_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${localDevelopment(env,request)?'':'; Secure'}`);
 return new Response(JSON.stringify({user:safeUser(user)}),{headers});
}
