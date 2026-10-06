import {loadDemoKnowledge} from './demo-knowledge.js';
import {KnowledgeStore,knowledgeHash} from './knowledge-store.js';
import {ingestSource,factPolicyKey} from './knowledge-ingest.js';
import {knowledgeViews,currentFacts,staleDependencies,scopedKnowledge} from '../shared/knowledge.js';
import {factArticle} from './knowledge-articles.js';
import {assertFactoidCoverage} from './knowledge-articles.js';
import {exportKnowledgeBundle} from './knowledge-bundle.js';
import {researchSchematic,type SchematicTask} from './schematic-research.js';
import {evidencePreview} from '../shared/evidence-preview.js';
import site from '../github/site.json' with {type:'json'};
import {assertSubjectPolicy,resolveSubject,subjectForTopic} from '../shared/subjects.js';
import {collectIndependentSources} from './web-research.js';
import {researchBudget,RequestBudget,researchCycles} from './budget.js';
import express from 'express';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import type { ChatGPTClient } from '../vendor/siwc/src/types.js';
import { findSources, validateTopic, type Article } from './research.js';

import { collectSources } from '../shared/sources.js';
import { resolvePhilosophy,requiresFactoids } from '../shared/philosophies.js';
import { writeAndReview } from './review.js';
import { AppServerClient, initialEngineState, ENGINE_LIMITS, validateStructuredArticle, articleContent } from './app-server.js';
import { documentMarkdown, type ResearchDocument } from './document.js';
import { discoverForDraft } from './discovery.js';
import { findImages,type ImageCandidate } from '../shared/images.js';

export async function startApp(options:{client?:ChatGPTClient;readPage?:Parameters<typeof collectIndependentSources>[5];imageFetcher?:typeof fetch;dataRoot?:string;port?:number;optimizeDependencies?:boolean}={}){
const auth=options.client?undefined:await import('./auth.js');
const chatgpt=options.client??auth!.chatgpt;
const clearAuthorizationUrl=()=>auth?.clearAuthorizationUrl();
const collect:typeof collectIndependentSources=(topic,philosophy,signal,client,emit,readPage=options.readPage)=>collectIndependentSources(topic,philosophy,signal,client,emit,readPage);
const inspect:typeof discoverForDraft=input=>discoverForDraft({...input,searchImages:(query,signal)=>findImages(query,signal,options.imageFetcher)});
const app = express();
const server = createServer(app);
let port = options.port??Number(process.env.PORT || 4317);
let origin = `http://127.0.0.1:${port}`;
const dataRoot=options.dataRoot??resolve('.data');
const dataDir = join(dataRoot,'articles');
const draftDir = join(dataRoot,'drafts');
const demoDir = resolve('demo/articles');
await mkdir(draftDir, { recursive: true, mode: 0o700 });
await mkdir(dataDir, { recursive: true, mode: 0o700 });
const csrf = randomBytes(32).toString('hex');
let authError: string | undefined;
let activeResearch = false;
const knowledgeStore=new KnowledgeStore(join(dataRoot,'knowledge.sqlite'));
await loadDemoKnowledge(knowledgeStore);
function knowledgeScope(req:express.Request){const subject=resolveSubject(site.subjectId||req.query.subject||site.defaultSubject);const philosophy=resolvePhilosophy(req.query.policy||subject.philosophyId);if(!['schematic','primary-reporting'].includes(philosophy.id))throw Error('Unsupported claim policy.');return {subject,philosophy,key:factPolicyKey(philosophy)};}

app.use((req, res, next) => {
  if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) { res.status(403).json({ error: 'Local access only.' }); return; }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    const allowed = new Set([origin, `http://localhost:${port}`]);
    if ((req.headers.origin && !allowed.has(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') { res.status(403).json({ error: 'Cross-site requests are not allowed.' }); return; }
    if (req.method !== 'GET') {
      const token = Buffer.from(String(req.headers['x-wikichat-token'] ?? ''));
      if (token.length !== csrf.length || !timingSafeEqual(token, Buffer.from(csrf))) { res.status(403).json({ error: 'Refresh the app to reconnect securely.' }); return; }
    }
  }
  next();
});
app.use(express.json({ limit: '12kb' }));
app.use('/api/community', (_req,res) => res.status(410).json({error:'Contributions now use GitHub pull requests. Export the article through Contribute.'}));
app.get('/api/session', async (_req,res) => res.json({ session: await chatgpt.getSession(), csrf, authorizationUrl:auth?.authorizationUrl, authError }));
app.post('/api/auth/sign-in', async (_req,res) => {
  if ((await chatgpt.getSession()).status === 'connecting') { res.status(409).json({ error: 'Sign-in is already in progress.' }); return; }
  authError = undefined; clearAuthorizationUrl();
  void chatgpt.signIn().catch(e => { authError = e.message; }).finally(clearAuthorizationUrl);
  res.json({ ok: true });
});
app.post('/api/auth/cancel', (_req,res) => { chatgpt.cancelSignIn(); clearAuthorizationUrl(); res.json({ ok: true }); });
app.post('/api/auth/disconnect', async (_req,res) => { await chatgpt.disconnect(); res.json({ ok: true }); });
app.get('/api/models', async (_req,res) => res.json(await chatgpt.listModels()));
app.get('/api/articles', async (_req,res) => {
  const records=new Map<string,Pick<Article,'id'|'title'|'topic'|'createdAt'|'philosophy'|'subjectId'> & {quotePreviews:boolean}>();
  for(const directory of [demoDir,dataDir]){
    const names = (await readdir(directory).catch(()=>[])).filter(n => /^[\da-f-]+\.json$/.test(n));
    for(const name of names){try { const a: Article = await loadArticle(name.slice(0,-5)); if(site.subjectId&&a.subjectId!==site.subjectId)continue; records.set(a.id,{id:a.id,title:a.title,topic:a.topic,createdAt:a.createdAt,philosophy:a.philosophy,subjectId:a.subjectId,quotePreviews:!!a.knowledge}); } catch {}}
  }
  res.json([...records.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
});
async function loadArticle(id:string):Promise<Article>{
 const path=articlePath(id),local=await readFile(path,'utf8').then(JSON.parse).catch(()=>null),demo=await readFile(join(demoDir,id+'.json'),'utf8').then(JSON.parse).catch(()=>null);
 const article:Article=local?.knowledge?local:demo?.knowledge?demo:local||demo;if(!article)throw Error('Article not found.');
 if(article.knowledge){assertFactoidCoverage(article,knowledgeStore.snapshot());knowledgeStore.dependencies(`${article.id}/${article.knowledge.mode}/${article.knowledge.policyKey}`,[...article.knowledge.dependencies,...article.knowledge.scope||[]]);article.sources=article.sources.map(s=>({...s,extract:s.extract||knowledgeStore.snapshot().captures.find(c=>s.captureId?c.id===s.captureId:c.url===s.url)?.text||''}));}return article;
}
function articlePath(id: string) { if (!/^[\da-f-]{36}$/.test(id)) throw new Error('Invalid article ID.'); return join(dataDir, `${id}.json`); }
app.get('/api/articles/:id', async (req,res) => {
  try { const a=await loadArticle(req.params.id);if(site.subjectId&&a.subjectId!==site.subjectId)throw Error('Different subject');res.json(a); } catch { res.status(404).json({ error:'Article not found.' }); }
});
app.get('/api/articles/:id/knowledge-bundle',async(req,res)=>{
 const a=await loadArticle(req.params.id);
 if(site.subjectId&&a.subjectId!==site.subjectId)throw Error('Wrong subject wiki.');
 assertFactoidCoverage(a,knowledgeStore.snapshot());
 const bundle=exportKnowledgeBundle(knowledgeStore.snapshot(),a.subjectId!,a.philosophy!,undefined,[...a.knowledge!.dependencies,...a.knowledge!.scope||[]].map(d=>d.revisionId),a.images?.map(image=>({entityId:a.knowledge!.entityId,image})),a.knowledge?.narrative?[a]:undefined);
 if(Buffer.byteLength(JSON.stringify(bundle))>160000)throw Error('This bundle is too large. Export and review individual source tasks.');
 res.json(bundle);
});
app.delete('/api/articles/:id', async (req,res) => { await unlink(articlePath(req.params.id)); res.json({ ok:true }); });
app.get('/api/drafts', async (_req,res) => {
 const profile=(await chatgpt.getSession()).profileId;
 const tasks=await Promise.all((await readdir(draftDir)).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(async n=>{
  try{const d=JSON.parse(await readFile(join(draftDir,n),'utf8'));return ['direct','app-server','schematic'].includes(d.engine)&&d.profileId===profile&&d.status!=='complete'?{id:d.id,topic:d.topic,model:d.model,philosophyId:d.philosophy.id,turns:d.engineState?.turns??d.requestsUsed}:null;}catch{return null;}
 }));res.json(tasks.filter(Boolean));
});
app.get('/api/knowledge/events',(_req,res)=>res.json({version:Number(knowledgeStore.db.prepare('SELECT coalesce(max(seq),0) version FROM events').get()!.version)}));
app.get('/api/knowledge', (req,res)=>{
 const {key,subject}=knowledgeScope(req),snapshot=scopedKnowledge(knowledgeStore.snapshot(),subject.id,key);
 const mode=req.query.mode==='approved'?'approved':'preview';
 const views=knowledgeViews(snapshot,key,mode),{philosophy}=knowledgeScope(req);
 const articleEntities=views.nodes.filter(e=>{try{factArticle(snapshot,e.id,philosophy,mode);return true;}catch(error){if((error as Error).message.includes('incomplete or malformed'))return false;throw error;}}).map(e=>e.id);
 // Public local views retain passage anchors, not the entire captured text.
 res.json({snapshot:{...snapshot,captures:snapshot.captures.map(({text,...capture})=>({...capture,text:''}))},policyKey:key,views,articleEntities});
});
app.get('/api/knowledge/jobs',async(_req,res)=>{const session=await chatgpt.getSession();res.json(knowledgeStore.jobs(session.profileId||'').filter(j=>j.status!=='complete').map(j=>({id:j.id,url:j.url,status:j.status,model:j.model,requestsUsed:j.requestsUsed,subjectId:j.subjectId,error:j.error})));});
app.get('/api/knowledge/revisions/:revisionId/evidence',(req,res)=>{
 const {key,subject}=knowledgeScope(req);
 if(typeof req.query.digest!=='string')throw Error('An exact revision digest is required.');
 const snapshot=scopedKnowledge(knowledgeStore.snapshot(),subject.id,key);
 const preview=evidencePreview(snapshot,req.params.revisionId,req.query.digest,req.query.mode==='approved');
 for(const passage of preview.passages){const capture=snapshot.captures.find(c=>c.id===passage.captureId)!;if(!capture.text||knowledgeHash(capture.text)!==capture.sha256)throw Error('Captured source checksum mismatch.');}
 res.json(preview);
});
app.get('/api/knowledge/articles/:entityId',(req,res)=>{
 const {philosophy,subject,key}=knowledgeScope(req);const mode=req.query.mode==='approved'?'approved':'preview';
 const article=factArticle(scopedKnowledge(knowledgeStore.snapshot(),subject.id,key),req.params.entityId,philosophy,mode);
 knowledgeStore.dependencies(`${article.id}/${mode}/${key}`,article.knowledge!.dependencies);
 res.json(article);
});
app.get('/api/knowledge/articles/:entityId/bundle',(req,res)=>{
 const {philosophy,subject,key}=knowledgeScope(req);assertSubjectPolicy(subject.id,philosophy);
 const k=scopedKnowledge(knowledgeStore.snapshot(),subject.id,key),a=factArticle(k,req.params.entityId,philosophy);
 assertFactoidCoverage(a,k);
 const bundle=exportKnowledgeBundle(k,subject.id,philosophy,undefined,[...a.knowledge!.dependencies,...a.knowledge!.scope||[]].map(d=>d.revisionId),a.images?.map(image=>({entityId:a.knowledge!.entityId,image})),a.knowledge?.narrative?[a]:undefined);
 if(Buffer.byteLength(JSON.stringify(bundle))>160000)throw Error('This bundle is too large. Export and review individual source tasks.');
 res.json(bundle);
});
app.get('/api/knowledge/impact',(req,res)=>{
 const {key,subject}=knowledgeScope(req),snapshot=scopedKnowledge(knowledgeStore.snapshot(),subject.id,key);
 const mode=req.query.mode==='approved'?'approved':'preview',facts=currentFacts(snapshot,key,mode);
 const affected=knowledgeStore.db.prepare('SELECT article_id,record FROM dependencies').all().filter(row=>String(row.article_id).endsWith(`/${mode}/${key}`)).map(row=>({articleId:row.article_id,changed:staleDependencies(JSON.parse(String(row.record)),facts)})).filter(a=>a.changed.length);
 res.json({affected});
});
app.post('/api/knowledge/ingest',async(req,res)=>{
 const session=await chatgpt.getSession();
 if(!session.sharing||!session.profileId){res.status(401).json({error:'Connect ChatGPT to process a source.'});return;}
 if(activeResearch){res.status(409).json({error:'A research task is already running.'});return;}
 const subject=resolveSubject(site.subjectId||req.body.subjectId||site.defaultSubject),philosophy=resolvePhilosophy(subject.philosophyId);
 if(!['primary-reporting','schematic'].includes(philosophy.id))throw Error('Source intake requires primary sources and original reporting.');
 if(typeof req.body.model!=='string'||req.body.resumeId&&(!/^[a-f0-9-]{36}$/.test(req.body.resumeId)))throw Error('Choose a model and valid source task.');
 const allowance=researchBudget(req.body.budget);
 const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(allowance.minutes*60000)]);
 activeResearch=true;res.on('close',()=>controller.abort());res.setHeader('Content-Type','application/x-ndjson');
 const emit=(event:Record<string,unknown>)=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n');};
 try{
  if(!(await chatgpt.listModels({signal})).some(m=>m.slug===req.body.model))throw Error('Choose an available model.');
  await ingestSource({store:knowledgeStore,profileId:session.profileId,subjectId:subject.id,philosophy,model:req.body.model,url:req.body.url,resumeId:req.body.resumeId,requestLimit:allowance.requests,signal,client:chatgpt,emit});
 }catch(e){if(!res.destroyed)emit({type:'error',message:(e as Error).message});}finally{activeResearch=false;res.end();}
});
app.post('/api/research', async (req,res) => {
  let saved:any;
  const session=await chatgpt.getSession();
  if(req.body.resumeId){
   if(typeof req.body.resumeId!=='string'||!/^[a-f0-9-]{36}$/.test(req.body.resumeId))throw Error('Invalid task ID.');
   saved=JSON.parse(await readFile(join(draftDir,req.body.resumeId+'.json'),'utf8'));
   if(!['direct','app-server','schematic'].includes(saved.engine)||saved.profileId!==session.profileId||saved.status==='complete')throw Error('This task cannot be resumed by this account.');
  }
  if(saved?.sources?.some((s:any)=>/wikipedia\.org/i.test(s.url)))throw Error('This draft used the old Wikipedia collection. Start new research for independent sources.');
  let engine=saved?.engine??req.body.engine??'direct';
  if(!['direct','app-server','schematic'].includes(engine))throw Error('Unsupported research engine.');
  const topic = validateTopic(saved?.topic??req.body.topic);
  const philosophy = resolvePhilosophy(saved?.philosophy.id??req.body.philosophyId??(site.subjectId?resolveSubject(site.subjectId).philosophyId:'general'),saved?.philosophy.customRules??req.body.customRules);
  if(requiresFactoids(philosophy)){if(engine==='app-server')throw Error('Choose the standard engine for schematic research.');engine='schematic';}
  else if(engine==='schematic')throw Error('The schematic engine cannot run a prose philosophy.');
  const subjectId=saved?.subjectId??req.body.subjectId??site.subjectId??subjectForTopic(topic)?.id??(requiresFactoids(philosophy)?site.defaultSubject:undefined);
  if(site.subjectId&&subjectId!==site.subjectId)throw Error('This repository is restricted to its configured subject wiki.');
  if(subjectId)assertSubjectPolicy(subjectId,philosophy);
  const selectedModel=saved?.model??req.body.model;
  if (!(await chatgpt.getSession()).sharing) { res.status(401).json({ error:'Connect ChatGPT and enable ChatGPT plan usage to begin.' }); return; }
  if (activeResearch) { res.status(409).json({ error:'One research task is already running. Wait for it or cancel it first.' }); return; }
  if (typeof selectedModel !== 'string') { res.status(400).json({ error:'Choose an available model.' }); return; }
  const allowance=researchBudget(req.body.budget);
  const budget=new RequestBudget(allowance.requests);
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(engine!=='app-server'?allowance.minutes*60000:480000)]);
  activeResearch = true;
  res.on('close', () => controller.abort());
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('X-Accel-Buffering', 'no');
  const emit = (data: unknown) => { if (!res.destroyed) res.write(JSON.stringify(data) + '\n'); };
  try {
    const started=Date.now();
    const models = await chatgpt.listModels({ signal });
    if (!models.some(m => m.slug === selectedModel)) throw new Error('This model is no longer available. Reconnect to refresh your model list.');
    if(engine==='schematic'){
     const task:SchematicTask=saved||{id:randomUUID(),engine:'schematic',profileId:session.profileId!,topic,subjectId:subjectId!,philosophy,model:selectedModel,status:'interrupted',sources:[],sourceTasks:{},processedURLs:[],document:{id:'',blocks:[{id:'title',markdown:'# '+topic}],originalMarkdown:'# '+topic,edits:[],reviewedBlockIds:[],status:'reviewing'},requestsUsed:0,runtimeMs:0,imageCandidates:[],toolCalls:0,usage:[],revisionIds:[]};
     task.document.id=task.id;task.status='interrupted';
     let saving=Promise.resolve();
     const persist=()=>{const bytes=JSON.stringify(task);saving=saving.then(async()=>{const path=join(draftDir,task.id+'.json');await writeFile(path+'.tmp',bytes,{mode:0o600});await rename(path+'.tmp',path);});return saving;};
     await persist();emit({type:'task',id:task.id,engine});
     const client={streamResponse:async(options:any)=>{signal.throwIfAborted();budget.reserve();task.requestsUsed++;await persist();emit({type:'usage',used:budget.used,limit:allowance.requests});return chatgpt.streamResponse({...options,model:selectedModel,signal,onSearchCall:()=>{if(++task.toolCalls>24)throw Error('Schematic search-tool limit reached.');options.onSearchCall?.();},onUsage:(usage:any)=>{task.usage.push(usage);options.onUsage?.(usage);}});}};
     try{
      const article=await researchSchematic({task,store:knowledgeStore,signal,requestLimit:allowance.requests,client,collect,inspect,save:persist,emit});
      article.metrics={engine:'schematic',elapsedMs:Date.now()-started,cumulativeRuntimeMs:task.runtimeMs+Date.now()-started,turns:task.requestsUsed,toolCalls:task.toolCalls,usage:task.usage};
      signal.throwIfAborted();assertFactoidCoverage(article,knowledgeStore.snapshot());
      const path=articlePath(article.id);await writeFile(path+'.tmp',JSON.stringify(article),{mode:0o600});await rename(path+'.tmp',path);
      task.status='complete';task.runtimeMs+=Date.now()-started;await persist();emit({type:'complete',article});
     }catch(error){task.document.status='interrupted';task.runtimeMs+=Date.now()-started;await persist();throw error;}
     return;
    }
    let sources: import('./research.js').Source[]=saved?.sources??[];
    const id = saved?.id??randomUUID();
    const state=saved?.engineState??initialEngineState();
    let document:ResearchDocument|undefined=saved?.document;
    if(!document)state.phase='draft';
    let images:ImageCandidate[]=saved?.imageCandidates??[];
    let discovery=saved?.discovery;
    let status='interrupted';let saving=Promise.resolve();
    const persist=()=>{
     const snapshot=JSON.stringify({id,topic,subjectId,sources,philosophy,model:selectedModel,engine,engineState:state,profileId:session.profileId,status,document,imageCandidates:images,discovery,allowance,requestsUsed:budget.used});
     saving=saving.then(async()=>{const path=join(draftDir,id+'.json');await writeFile(path+'.tmp',snapshot,{mode:0o600});await rename(path+'.tmp',path);});
     return saving;
    };
    await persist();emit({type:'task',id,engine});
     const client={streamResponse:async(options:any)=>{
      signal.throwIfAborted();budget.reserve();state.turns++;await persist();
      emit({type:'usage',used:budget.used,limit:allowance.requests});
      try{return await chatgpt.streamResponse({...options,model:selectedModel,onSearchCall:()=>{state.toolCalls++;options.onSearchCall?.();},onUsage:(usage:any)=>state.usage.push(usage)});}finally{await persist();}
     }};
    if(!sources.length){sources=await collect(topic,philosophy,signal,client,emit);await persist();}
    emit({type:'sources',sources});
    emit({type:'progress',step:2,message:`Reading ${sources.length} original sources and writing your article…`});
    const searchSources:typeof collectSources=async(query,policy,searchSignal)=>collect(query,policy,searchSignal,client,event=>{if(event.type==='progress')emit({...event,step:3});});
    const run=async(client:any)=>writeAndReview({id,topic,sources,philosophy,model:selectedModel,signal,client,emit,resume:document,
     async saveDraft(doc){document=doc;status='interrupted';await persist();}});
    let parsed;
    if(engine==='app-server'){
     const outcome=await chatgpt.withAccessToken(async(token,authSignal)=>{
      const child=new AppServerClient(token,state,authSignal,persist,id);
      try{await child.start();return {result:await run(child)};}catch(error){return {error:(error as Error).message};}finally{await child.close();}
     },signal);
     if(outcome.error||!outcome.result)throw Error(outcome.error||'Research did not complete.');
     parsed=outcome.result;
     validateStructuredArticle('# '+parsed.title+'\n\n'+parsed.markdown);
    }else{
     parsed=await researchCycles(()=>run(client),async()=>{
      emit({type:'progress',step:3,message:'Checking whether the article needs more evidence…'});
      const before=sources.length;
      const next=await inspect({searchSources,topic,philosophy,draft:documentMarkdown(document!),sources,model:selectedModel,signal,client,emit});
      state.toolCalls+=next.searches;
      if(next.images.length)images=next.images;
      discovery=next;await persist();
      return {needsEvidence:next.plan.sourceQueries.length>0,addedEvidence:sources.length>before};
     },async()=>{document!.reviewedBlockIds=[];document!.status='reviewing';await persist();});
     state.runtimeMs=(saved?.engineState?.runtimeMs??0)+Date.now()-started;
    }
    const metrics={engine,elapsedMs:Date.now()-started,cumulativeRuntimeMs:state.runtimeMs,turns:state.turns,toolCalls:state.toolCalls,usage:state.usage};
    signal.throwIfAborted();
    const article: Article = { ...parsed, id, topic, subjectId, sources, philosophy, model:selectedModel, metrics, ...(images.length?{imageCandidates:images,images:discovery?.illustrations??[]}:{}), ...(engine==='app-server'?{content:articleContent(parsed.markdown)}:{}), createdAt:new Date().toISOString() };
    const path = articlePath(article.id);
    await writeFile(path + '.tmp', JSON.stringify(article), { mode:0o600 });
    await rename(path + '.tmp',path);
    status='complete';await persist();
    emit({ type:'complete', article });
  } catch(e) { emit({ type:'error', message:signal.aborted ? 'Research stopped. No incomplete article was saved.' : (e as Error).message }); }
  finally { activeResearch = false; res.end(); }
});
app.use('/local-reviews', express.static(join(dataRoot,'github-reviews'), {dotfiles:'deny'}));
app.use('/api', (_req,res) => res.status(404).json({ error:'Not found.' }));
let vite:Awaited<ReturnType<typeof import('vite')['createServer']>>|undefined;
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req,res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ optimizeDeps:options.optimizeDependencies===false?{noDiscovery:true,include:[]}:undefined, server:{ preTransformRequests:options.optimizeDependencies===false?false:undefined,middlewareMode:true, hmr:{ server }, watch:{ignored:['**/community/public/**','**/pages-dist/**','**/community/.wrangler/**','**/.data/**','**/.volter/**']} }, appType:'spa' });
  app.use(vite.middlewares);
}
app.use((error: Error, _req: express.Request,res: express.Response, _next: express.NextFunction) => {
  if (!res.headersSent) res.status(400).json({ error:error.message || 'Something went wrong. Please try again.' });
});
await new Promise<void>((ready,fail)=>{
 server.once('error',fail);
 server.listen(port,'127.0.0.1',()=>{server.off('error',fail);port=(server.address() as AddressInfo).port;origin=`http://127.0.0.1:${port}`;ready();});
});
console.log(`WikiChat is ready: ${origin}`);
return {url:origin,async close(){await vite?.close();server.closeIdleConnections();await new Promise<void>((done,fail)=>server.close(error=>error?fail(error):done()));knowledgeStore.close();}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await startApp();
