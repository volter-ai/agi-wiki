import { PHILOSOPHIES } from '../shared/philosophies.js';
import { refetchSource, sourcePolicyProblems } from '../shared/sources.js';
import { citationIssues, type Article } from '../server/research.js';
import { startLogin, verifyLogin } from './auth.js';
import { articleDigest, policyKey, topicKey, validateUpload } from './content.js';
import { currentUser, requireUser, requireAdmin, assertWriteOrigin, readJSON, rate, ipKey, hash, sessionCookie, safeUser } from './security.js';
import { moderateSubmission } from './moderation.js';
import { HttpError, now, localDevelopment, type Env, type Context, type Submission, type User } from './types.js';
const response=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const reputation=async(env:Env,id:string)=>Number((await env.DB.prepare('SELECT COALESCE(SUM(points),0) AS reputation FROM reputation_events WHERE user_id=?').bind(id).first<{reputation:number}>())?.reputation||0);
async function row(env:Env,id:string){return env.DB.prepare('SELECT s.*,u.username FROM submissions s JOIN users u ON u.id=s.author_id WHERE s.id=?').bind(id).first<Submission>();}
async function object(env:Env,item:Submission):Promise<Article>{const data=await env.ARTICLES.get(item.object_key);if(!data)throw new HttpError(404,'Article content unavailable.');return JSON.parse(await data.text());}
const publicRow=(r:Submission)=>({id:r.id,title:r.title,topicKey:r.topic_key,policyKey:r.policy_key,policyName:r.policy_name,username:r.username,createdAt:r.created_at,publishedAt:r.published_at});

async function route(request:Request,env:Env,ctx:Context):Promise<Response>{
 const url=new URL(request.url);const path=url.pathname.replace(/^\/api\/community/,'');
 assertWriteOrigin(request,env);
 if(path==='/config'&&request.method==='GET')return response({development:localDevelopment(env,request),philosophies:PHILOSOPHIES,uploadsPerDay:100,emailReady:!!env.RESEND_API_KEY||localDevelopment(env,request),moderationReady:!!env.OPENAI_API_KEY});
 if(path==='/auth/start'&&request.method==='POST')return response(await startLogin(request,env));
 if(path==='/auth/verify'&&request.method==='POST')return verifyLogin(request,env);
 if(path==='/auth/logout'&&request.method==='POST'){
   const token=sessionCookie(request);if(token)await env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(token)).run();
   return response({ok:true},200,{'Set-Cookie':`wc_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${localDevelopment(env,request)?'':'; Secure'}`});
 }
 if(path.startsWith('/dev/mailbox/')&&request.method==='GET'){
   if(!localDevelopment(env,request))throw new HttpError(404,'Not found.');
   const code=await env.DB.prepare('SELECT code FROM dev_mailbox WHERE request_id=? AND expires_at>?').bind(path.split('/').at(-1)!,now()).first();
   if(!code)throw new HttpError(404,'No active local sign-in message.');return response(code);
 }
 if(path==='/me'&&request.method==='GET'){
   const user=await currentUser(request,env);if(!user)return response({user:null});
   const used=await env.DB.prepare('SELECT COUNT(*) AS used FROM submissions WHERE author_id=? AND created_at>=?').bind(user.id,Math.floor(now()/86400)*86400).first<{used:number}>();
   return response({user:safeUser(user,await reputation(env,user.id)),uploadsToday:used?.used||0,uploadsRemaining:100-(used?.used||0),resetsAt:(Math.floor(now()/86400)+1)*86400});
 }
 if(path==='/me'&&request.method==='PATCH'){
   const user=await requireUser(request,env);const body=await readJSON(request,2000);const username=String(body.username||'').trim().toLowerCase();
   if(!/^[a-z][a-z0-9_-]{2,23}$/.test(username)||/^(admin|moderator|wikimedia|wikipedia|wikichat|contributor-)/.test(username))throw new HttpError(400,'Choose 3–24 letters, numbers, underscores, or hyphens. Reserved names are unavailable.');
   if(!user.username.startsWith('contributor-'))throw new HttpError(409,'Your public username is already set and stays attached to your contributions.');
   try{await env.DB.prepare('UPDATE users SET username=? WHERE id=?').bind(username,user.id).run();}catch{throw new HttpError(409,'That username is taken.');}
   return response({ok:true});
 }
 if(path==='/articles'&&request.method==='GET'){
   const q=(url.searchParams.get('q')||'').slice(0,120).replace(/[!%_]/g,'!$&');const policy=url.searchParams.get('philosophy')||'';
   const rows=await env.DB.prepare("SELECT s.*,u.username FROM submissions s JOIN users u ON u.id=s.author_id WHERE s.status='published' AND s.title LIKE ? ESCAPE '!' AND (?='' OR s.policy_key=?) ORDER BY s.published_at DESC LIMIT 50").bind('%'+q+'%',policy,policy).all<Submission>();
   return response({articles:rows.results.map(publicRow)});
 }
 if(path==='/submissions'&&request.method==='POST'){
   const user=await requireUser(request,env);await rate(env,'upload-attempt:'+user.id,30,60);
   const body=await readJSON(request);if(body.confirmPublic!==true)throw new HttpError(400,'Confirm that this article and its sources may be published publicly.');
   const article=validateUpload(body);const digest=await articleDigest(article);
   const existing=await env.DB.prepare('SELECT id,status,author_id FROM submissions WHERE digest=?').bind(digest).first<{id:string;status:string;author_id:string}>();
   if(existing){if(existing.status==='published'||existing.author_id===user.id)return response({id:existing.id,status:existing.status,duplicate:true});throw new HttpError(409,'This content has already been submitted.');}
   const id=crypto.randomUUID();article.id=id;const key=`submissions/${id}.json`;
   try{await env.DB.prepare('INSERT INTO submissions(id,author_id,topic_key,title,policy_key,policy_name,digest,object_key,created_at,ip_hash,generation_model) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,user.id,topicKey(article.title),article.title,await policyKey(article.philosophy!),article.philosophy!.name,digest,key,now(),await ipKey(request,env),article.model).run();}
   catch(e){const message=String(e);if(/daily_upload_limit/.test(message))throw new HttpError(429,'You have used your 100 uploads for today. Your allowance resets at midnight UTC.');if(/burst_upload_limit|ip_.*limit/.test(message))throw new HttpError(429,'Please slow down. The short-term upload limit has been reached.');if(/UNIQUE/.test(message))throw new HttpError(409,'This article has already been submitted.');throw e;}
   await env.ARTICLES.put(key,JSON.stringify(article));
   ctx.waitUntil(moderateSubmission(env,id));return response({id,status:'pending',duplicate:false},202);
 }
 if(path==='/submissions'&&request.method==='GET'){
   const user=await requireUser(request,env);const items=await env.DB.prepare('SELECT s.*,u.username FROM submissions s JOIN users u ON u.id=s.author_id WHERE s.author_id=? ORDER BY s.created_at DESC LIMIT 100').bind(user.id).all<Submission>();
   return response({submissions:items.results.map(r=>({...publicRow(r),status:r.status,moderation:JSON.parse(r.moderation)}))});
 }
 const articleMatch=path.match(/^\/articles\/([\da-f-]{36})$/);
 if(articleMatch&&request.method==='GET'){
   const item=await row(env,articleMatch[1]);if(!item||item.status!=='published')throw new HttpError(404,'Article not found.');
   // Check visibility before every cache lookup so withdrawn articles cannot leak from the edge cache.
   const cache=(globalThis as any).caches?.default as Cache|undefined;const cacheKey=new Request(url.origin+`/cdn/articles/${item.id}/${item.published_at}`);const cached=await cache?.match(cacheKey);
   if(cached){const headers=new Headers(cached.headers);headers.set('Cache-Control','public, max-age=0, must-revalidate');headers.set('CDN-Cache-Control','no-store');return new Response(cached.body,{headers});}
   const article=await object(env,item);
   const result=response({article,contributor:{username:item.username,reputation:await reputation(env,item.author_id)},publication:publicRow(item)},200,{'Cache-Control':'public, max-age=0, must-revalidate','CDN-Cache-Control':'no-store'});
   if(cache){const stored=new Response(result.body,{headers:result.headers});const forCache=stored.clone();forCache.headers.set('Cache-Control','public, max-age=3600');forCache.headers.delete('CDN-Cache-Control');ctx.waitUntil(cache.put(cacheKey,forCache));return stored;}
   return result;
 }
 if(path==='/versions'&&request.method==='GET'){
   const topic=(url.searchParams.get('topic')||'').slice(0,180);const rows=await env.DB.prepare("SELECT s.*,u.username FROM submissions s JOIN users u ON u.id=s.author_id WHERE s.status='published' AND s.topic_key=? ORDER BY s.published_at DESC LIMIT 100").bind(topicKey(topic)).all<Submission>();
   return response({versions:rows.results.map(publicRow),philosophies:PHILOSOPHIES});
 }
 const profileMatch=path.match(/^\/profiles\/([a-z0-9_-]+)$/);
 if(profileMatch&&request.method==='GET'){
   const user=await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(profileMatch[1]).first<User>();if(!user)throw new HttpError(404,'Contributor not found.');
   const rows=await env.DB.prepare("SELECT s.*,u.username FROM submissions s JOIN users u ON u.id=s.author_id WHERE s.author_id=? AND s.status='published' ORDER BY s.published_at DESC LIMIT 50").bind(user.id).all<Submission>();
   const rep=await reputation(env,user.id);
   return response({profile:{username:user.username,reputation:rep,joinedAt:user.created_at,level:rep>=50?'Established contributor':rep>=10?'Active contributor':'New contributor'},articles:rows.results.map(publicRow)});
 }
 const helpfulMatch=path.match(/^\/articles\/([\da-f-]{36})\/helpful$/);
 if(helpfulMatch&&request.method==='POST'){
   const user=await requireUser(request,env);const article=await row(env,helpfulMatch[1]);
   if(!article||article.status!=='published')throw new HttpError(404,'Article not found.');if(article.author_id===user.id)throw new HttpError(400,'You cannot endorse your own article.');
   if(!localDevelopment(env,request)&&user.created_at>now()-86400)throw new HttpError(403,'New accounts can endorse articles after 24 hours.');
   await rate(env,'helpful:'+user.id,20,86400);
   const eventKey=`helpful:${article.id}:${user.id}`;
   await env.DB.batch([
     env.DB.prepare('INSERT OR IGNORE INTO feedback(article_id,user_id,created_at) VALUES(?,?,?)').bind(article.id,user.id,now()),
     env.DB.prepare("INSERT OR IGNORE INTO reputation_events(event_key,user_id,points,reason,created_at) SELECT ?,?,2,'Helpful article',? WHERE (SELECT COALESCE(SUM(points),0) FROM reputation_events WHERE user_id=? AND points>0 AND created_at>=?)<20").bind(eventKey,article.author_id,now(),article.author_id,Math.floor(now()/86400)*86400)
   ]);return response({ok:true});
 }
 const reportMatch=path.match(/^\/articles\/([\da-f-]{36})\/report$/);
 if(reportMatch&&request.method==='POST'){
   const user=await requireUser(request,env);const article=await row(env,reportMatch[1]);if(!article||article.status!=='published')throw new HttpError(404,'Article not found.');
   const body=await readJSON(request,5000);const reason=String(body.reason||'').trim();if(reason.length<20||reason.length>2000)throw new HttpError(400,'Explain the problem in 20–2,000 characters, including a source or correction if possible.');
   await rate(env,'report:'+user.id,10,86400);
   await env.DB.prepare('INSERT OR IGNORE INTO reports(id,article_id,reporter_id,reason,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),article.id,user.id,reason,now()).run();return response({ok:true});
 }
 if(path==='/admin/queue'&&request.method==='GET'){
   await requireAdmin(request,env);
   const queue=await env.DB.prepare("SELECT s.*,u.username FROM submissions s JOIN users u ON u.id=s.author_id WHERE s.status IN ('pending','review') ORDER BY s.created_at LIMIT 100").all<Submission>();
   const reports=await env.DB.prepare("SELECT r.*,s.title,u.username FROM reports r JOIN submissions s ON r.article_id=s.id JOIN users u ON r.reporter_id=u.id WHERE r.status='pending' ORDER BY r.created_at LIMIT 100").all();
   return response({submissions:queue.results.map(r=>({...publicRow(r),status:r.status,moderation:JSON.parse(r.moderation)})),reports:reports.results});
 }
 const adminArticle=path.match(/^\/admin\/submissions\/([\da-f-]{36})$/);
 if(adminArticle&&request.method==='GET'){
   await requireAdmin(request,env);const item=await row(env,adminArticle[1]);if(!item)throw new HttpError(404,'Submission not found.');
   const article=await object(env,item);let sourceError='';
   try{article.sources=await Promise.all(article.sources.map(s=>refetchSource(s,AbortSignal.timeout(25000))));}catch(error){console.error('Source verification failed:',error instanceof Error?error.message:'Unknown provider failure');sourceError='Some sources could not be retrieved. Approval requires all sources to be available.';}
   return response({article,sourceError,status:item.status,moderation:JSON.parse(item.moderation),username:item.username});
 }
 const decisionMatch=path.match(/^\/admin\/submissions\/([\da-f-]{36})\/decision$/);
 if(decisionMatch&&request.method==='POST'){
   const admin=await requireAdmin(request,env);const item=await row(env,decisionMatch[1]);if(!item)throw new HttpError(404,'Submission not found.');
   const body=await readJSON(request,5000),action=String(body.action),reason=String(body.reason||'').trim();
   if(!['approve','reject','withdraw','retry'].includes(action)||reason.length<20||reason.length>2000)throw new HttpError(400,'Choose a decision and give a reason of 20–2,000 characters.');
   if(action==='retry'){
     if(item.status!=='review')throw new HttpError(409,'Only held submissions can be retried.');
     await env.DB.prepare("UPDATE submissions SET status='pending',claimed_at=NULL WHERE id=? AND status='review'").bind(item.id).run();ctx.waitUntil(moderateSubmission(env,item.id));return response({ok:true});
   }
   if(action==='approve'){
     if(!['review','pending'].includes(item.status)||body.verifiedSources!==true)throw new HttpError(400,'Confirm that you have reviewed the claims and their sources.');
     const article=await object(env,item);article.sources=await Promise.all(article.sources.map(s=>refetchSource(s,AbortSignal.timeout(25000))));
     const problems=[...citationIssues(article.markdown,article.sources),...sourcePolicyProblems(article.sources,article.philosophy!)];
     if(problems.length)throw new HttpError(400,problems[0]);
     await env.ARTICLES.put(item.object_key,JSON.stringify(article));
   }
   const status=action==='approve'?'published':action==='withdraw'?'withdrawn':'rejected';
   await env.DB.batch([
     env.DB.prepare('UPDATE submissions SET status=?,published_at=?,moderation=? WHERE id=?').bind(status,status==='published'?now():item.published_at,JSON.stringify({decision:action,summary:reason,humanReviewed:true}),item.id),
     env.DB.prepare('INSERT INTO moderation_audit(id,article_id,moderator_id,action,reason,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),item.id,admin.id,action,reason,now()),
     ...(status!=='published'?[env.DB.prepare("INSERT OR IGNORE INTO reputation_events(event_key,user_id,points,reason,created_at) SELECT 'revoked:'||event_key,user_id,-points,'Endorsement points revoked after removal',? FROM reputation_events WHERE event_key LIKE ? AND points>0").bind(now(),'helpful:'+item.id+':%')]:[]),
     ...(body.confirmedAbuse===true&&status!=='published'?[env.DB.prepare("INSERT OR IGNORE INTO reputation_events(event_key,user_id,points,reason,created_at) VALUES(?,?,-10,'Confirmed abusive contribution',?)").bind('abuse:'+item.id,item.author_id,now())]:[])
   ]);return response({ok:true,status});
 }
 const reportDecision=path.match(/^\/admin\/reports\/([\da-f-]{36})$/);
 if(reportDecision&&request.method==='POST'){
   const admin=await requireAdmin(request,env);const body=await readJSON(request,4000);const reason=String(body.reason||'').trim();if(reason.length<20||reason.length>2000)throw new HttpError(400,'Give a resolution of 20–2,000 characters.');
   const report=await env.DB.prepare("SELECT * FROM reports WHERE id=? AND status='pending'").bind(reportDecision[1]).first<{id:string;article_id:string;reporter_id:string}>();if(!report)throw new HttpError(404,'Open report not found.');
   await env.DB.batch([
     env.DB.prepare("UPDATE reports SET status=?,resolution=? WHERE id=? AND status='pending'").bind(body.upheld?'resolved':'dismissed',reason,report.id),
     env.DB.prepare('INSERT INTO moderation_audit(id,article_id,moderator_id,action,reason,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),report.article_id,admin.id,body.upheld?'report-upheld':'report-dismissed',reason,now()),
     ...(body.upheld?[env.DB.prepare("INSERT OR IGNORE INTO reputation_events(event_key,user_id,points,reason,created_at) VALUES(?,?,1,'Helpful report',?)").bind('report:'+report.id,report.reporter_id,now())]:[])
   ]);return response({ok:true});
 }
 throw new HttpError(404,'Not found.');
}
export default {
 async fetch(request:Request,env:Env,ctx:Context){
   if(!new URL(request.url).pathname.startsWith('/api/community'))return env.ASSETS?env.ASSETS.fetch(request):response({error:'Not found'},404);
   try{
     if(!env.AUTH_SECRET||env.AUTH_SECRET.length<32)throw new HttpError(503,'Community authentication is not configured.');
     const result=await route(request,env,ctx);
     const headers=new Headers(result.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');
     // Never give the browser a long-lived cached article after a takedown.
     if(headers.has('CDN-Cache-Control'))headers.set('Cache-Control','public, max-age=0, must-revalidate');
     return new Response(result.body,{status:result.status,headers});
   }catch(error){
     if(error instanceof HttpError)return response({error:error.message},error.status);
     console.error('Community request failed:',error instanceof Error?error.message:'Unknown failure');
     return response({error:'The service could not complete this request. Please try again.'},503);
   }
 },
 async scheduled(_event:unknown,env:Env,ctx:Context){
   const pending=await env.DB.prepare("SELECT id FROM submissions WHERE status='pending' AND (claimed_at IS NULL OR claimed_at<?) ORDER BY created_at LIMIT 5").bind(now()-600).all<{id:string}>();
   for(const item of pending.results)ctx.waitUntil(moderateSubmission(env,item.id));
   ctx.waitUntil(env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),env.DB.prepare('DELETE FROM auth_requests WHERE expires_at<?').bind(now()-86400),env.DB.prepare('DELETE FROM dev_mailbox WHERE expires_at<?').bind(now()),env.DB.prepare("DELETE FROM rate_limits WHERE ((key LIKE 'helpful:%' OR key LIKE 'report:%') AND window<?) OR ((key LIKE 'login-ip:%' OR key LIKE 'login-email:%') AND window<?) OR (key LIKE 'verify:%' AND window<?) OR (key LIKE 'upload-attempt:%' AND window<?)").bind(Math.floor(now()/86400)-7,Math.floor(now()/3600)-24,Math.floor(now()/600)-144,Math.floor(now()/60)-1440)]));
 }
};
