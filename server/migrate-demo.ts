import {readFile,writeFile,mkdir,rename,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chatgpt} from './auth.js';
import {KnowledgeStore,knowledgeHash} from './knowledge-store.js';
import {ingestSource,factPolicyKey,type CoverageTarget} from './knowledge-ingest.js';
import {factArticle,assertFactoidCoverage,articleScope} from './knowledge-articles.js';
import {currentFacts} from '../shared/knowledge.js';
import {exportKnowledgeBundle} from './knowledge-bundle.js';
import {resolvePhilosophy} from '../shared/philosophies.js';
import {RequestBudget} from './budget.js';
import type {Article} from './research.js';
import {schematicEntity} from './schematic-research.js';

// Operator-only local migration. No submission, approval, publication or arbitrary agent tools.
const limit=Number(process.env.AUTOWIKI_MIGRATION_REQUESTS||60);
if(!Number.isInteger(limit)||limit<1||limit>60)throw Error('Migration allowance must be 1–60 requests.');
const budget=new RequestBudget(limit),signal=AbortSignal.timeout(30*60000);
const store=new KnowledgeStore(resolve('.data/knowledge.sqlite')),philosophy=resolvePhilosophy('schematic');
const session=await chatgpt.getSession();if(!session.profileId||!session.sharing)throw Error('Connect the existing ChatGPT account first.');
const model=(await chatgpt.listModels({signal})).find(m=>m.slug==='gpt-6-astra')?.slug;if(!model)throw Error('The selected model is unavailable.');
const checkpoint=resolve('.data/setup/schematic-migration.json');await mkdir(resolve('.data/setup'),{recursive:true});
let state:any=await readFile(checkpoint,'utf8').then(JSON.parse).catch(()=>({articles:{},requestsUsed:0}));
if(state.profileId&&state.profileId!==session.profileId)throw Error('Migration belongs to another account.');state.profileId=session.profileId;
const save=async()=>{await writeFile(checkpoint+'.tmp',JSON.stringify(state),{mode:0o600});await rename(checkpoint+'.tmp',checkpoint);};
const client={streamResponse:async(o:any)=>{signal.throwIfAborted();if(state.requestsUsed>=60)throw Error('The shared migration cap of 60 requests is exhausted.');budget.reserve();state.requestsUsed++;await save();console.log('Model request',budget.used+'/'+limit);return chatgpt.streamResponse({...o,model,signal});}};
const sections:Record<string,string>={
 'Method and implementation':'Method and implementation','Storage and deployment':'Capabilities and deployment','Reported performance and comparisons':'Evaluation and limitations','Quantized adaptation with QLoRA':'Related work',
 'Introduction and configurations':'Specifications and configurations','Computation and programming':'Capabilities and deployment','Interconnects, systems, and isolation':'Capabilities and deployment','Performance evaluation':'Evaluation and limitations',
 'Origins and research purpose':'Origins and publication','Task design':'Method and implementation','Evaluation and initial results':'Evaluation and limitations','Related datasets and variants':'Related work',
};
try{
for(const name of (await readdir('demo/articles')).filter(n=>n.endsWith('.json')).sort()){
 const id=name.slice(0,-5);let record=state.articles[id];
 if(!record){
  const a:Article=JSON.parse(await readFile(join('.data/articles',name),'utf8'));
  if(a.knowledge)throw Error('Initialize migration from the preserved prose archive.');
  let section='',n=0;const lines:any[]=[];
  for(const block of a.markdown.split(/\n\s*\n/)){
   if(block.startsWith('## ')){section=sections[block.slice(3)]||'Related work';continue;}
   const sentences=block.split(/(?<=\]\(#source-\d+\)[.!?])\s+/).map(s=>s.trim()).filter(Boolean);
   for(const text of sentences){const refs=[...text.matchAll(/\[(\d+)\]\(#source-\d+\)/g)].map(m=>Number(m[1]));if(!refs.length)throw Error('Legacy sentence has no citation.');lines.push({id:'line_'+(++n),statement:text.replace(/\s*\[\d+\]\(#source-\d+\)/g,'').replace(/[`*]/g,''),section,sourceId:refs[0]});}
  }
  const batches:any[]=[];for(const source of a.sources){const targets=lines.filter(l=>l.sourceId===source.id);for(let i=0;i<targets.length;i+=8)batches.push({source,targets:targets.slice(i,i+8),jobId:null});}
  record=state.articles[id]={original:a,lines,batches,complete:false};await save();
 }
 if(record.complete&&record.migrationVersion===2){console.log(record.original.title,'already migrated');continue;}
 record.complete=false;await save();
 console.log('Migrating',record.original.title,record.lines.length,'sentences');
 for(let round=0;round<2;round++){
 for(const [i,b] of record.batches.entries()){
  let job=b.jobId&&store.job(b.jobId,session.profileId);if(job?.status==='complete')continue;
  // A bounded correction may be deferred; an initial sentence audit may never be skipped.
  if(b.feedback&&(state.requestsUsed>=60||Math.min(60-state.requestsUsed,budget.limit-budget.used)<2&&!job?.batch)){
   console.log('Correction deferred at the migration allowance; retaining the completed initial audit.');continue;
  }
  console.log('Source batch',i+1+'/'+record.batches.length,b.source.url);
  try{job=await ingestSource({store,profileId:session.profileId,subjectId:'ai',philosophy,topic:record.original.title,model,source:b.source,revisionFeedback:b.feedback,coverageTargets:b.bridge?undefined:b.targets.map(({id,statement,section}:CoverageTarget)=>({id,statement,section})),resumeId:b.jobId||undefined,requestLimit:limit,signal,client,emit:e=>{if(e.type==='task')b.jobId=e.id;if(e.type==='progress')console.log(e.message);}});}
  finally{await save();}
 }
 if(round===0&&!record.repairsPlanned){
  const retry=new Map<number,{targets:any[];feedback:any[]}>();
  for(const b of record.batches){if(b.bridge)continue;const j=store.job(b.jobId,session.profileId!);
   for(const c of j.coverage){const rejected=c.revisionIds.filter((id:string)=>j.assessments.some((a:any)=>a.revisionId===id&&a.outcome!=="supported"));const decision=j.lineDecisions.find((d:any)=>d.targetId===c.targetId);if(!rejected.length&&decision?.outcome!=='omitted')continue;
    const entry=retry.get(b.source.id)||{targets:[],feedback:[]};const target=b.targets.find((t:any)=>t.id===c.targetId);if(!entry.targets.some((t:any)=>t.id===target.id))entry.targets.push(target);
    if(!rejected.length)entry.feedback.push({statement:target.statement,reason:decision.reason});
    for(const id of rejected)entry.feedback.push({statement:j.batch.facts.find((f:any)=>f.id===id).statement,reason:j.assessments.find((a:any)=>a.revisionId===id).reason});retry.set(b.source.id,entry);
   }
  }
  for(const [sourceId,entry] of retry){const source=record.original.sources.find((s:any)=>s.id===sourceId);for(let i=0;i<entry.targets.length;i+=8)record.batches.push({source,targets:entry.targets.slice(i,i+8),feedback:entry.feedback,jobId:null});}
  record.repairsPlanned=true;await save();
 }
 }
 const k=store.snapshot(),entity=schematicEntity(k,record.original.title,factPolicyKey(philosophy));
 const decisions=record.lines.map((line:any)=>{
  const reviewed=[...record.batches].reverse().filter((b:any)=>b.targets.some((t:any)=>t.id===line.id)).map((b:any)=>b.jobId&&store.job(b.jobId,session.profileId!)).filter((j:any)=>j?.status==='complete').map((j:any)=>j.lineDecisions.find((d:any)=>d.targetId===line.id));
  const d=reviewed.find((d:any)=>d?.revisionIds.length)||reviewed[0];if(!d)throw Error('Every original sentence requires its completed independent audit.');return {...line,...d};
 });
 const eligible=currentFacts(k,factPolicyKey(philosophy),'preview');
 for(const d of decisions){
  const excluded:string[]=[];d.revisionIds=d.revisionIds.filter((id:string)=>{
   const f=eligible.find(f=>f.id===id);if(!f)throw Error('An audited migration revision is no longer eligible.');
   try{articleScope(eligible,entity.id,[f]);return true;}catch(e){if((e as Error).message!=='A related fact needs an audited relationship path to the article topic.')throw e;excluded.push(f.statement);return false;}
  });
  if(excluded.length){d.outcome=d.revisionIds.length?'corrected':'omitted';d.reason+=' Host excluded related claims without an audited relationship to this article: '+excluded.join(' ');}
 }
 // Preserve coverage across the original article before adding extra detail.
 const displayed=new Set<string>();
 for(let depth=0;displayed.size<80&&decisions.some((d:any)=>d.revisionIds.length>depth);depth++)for(const d of decisions){if(displayed.size===80)break;const id=d.revisionIds[depth];if(id)displayed.add(id);}
 for(const d of decisions){const before=d.revisionIds.length;d.revisionIds=d.revisionIds.filter((id:string)=>displayed.has(id));if(d.revisionIds.length!==before){d.outcome=d.revisionIds.length?'corrected':'omitted';d.reason+=' Additional audited detail remains in the knowledge bundle; the article has an enforced 80-fact limit.';}}
 const revisionIds:string[]=[],placements:Record<string,string>={};
 for(const d of decisions)for(const id of d.revisionIds){const f=k.revisions.find(f=>f.id===id)!;if(!revisionIds.includes(id)){revisionIds.push(id);placements[id]=d.section;}}
 const projected=factArticle(k,entity.id,philosophy,'preview',{revisionIds,sections:placements});
 const migration={originalSentences:decisions.length,preserved:decisions.filter((d:any)=>d.outcome==='preserved').length,corrected:decisions.filter((d:any)=>d.outcome==='corrected').length,omitted:decisions.filter((d:any)=>d.outcome==='omitted').length,factoids:revisionIds.length};
 const article:Article={...projected,migration,id,topic:record.original.topic,createdAt:new Date().toISOString(),model,review:{originalMarkdown:record.original.markdown,edits:decisions.map((d:any)=>({blockId:d.id,before:d.statement,after:d.revisionIds.map((id:string)=>k.revisions.find(f=>f.id===id)!.statement).join(' '),reason:d.reason})),reviewedBlocks:decisions.length,completedAt:new Date().toISOString()}};
 assertFactoidCoverage(article,k);
 await mkdir('demo/archives',{recursive:true});await mkdir('demo/knowledge',{recursive:true});await mkdir('demo/captures',{recursive:true});await mkdir('demo/migrations',{recursive:true});
 const portable=(a:Article)=>({...a,sources:a.sources.map(s=>({...s,extract:''}))});
 await writeFile(join('demo/archives',id+'.json'),JSON.stringify(portable(record.original),null,2)+'\n');
 for(const b of record.batches){const j=b.jobId&&store.job(b.jobId,session.profileId);if(j?.status!=='complete'||!j.batch.facts.length)continue;const bundle=exportKnowledgeBundle(k,'ai',philosophy,b.jobId);await writeFile(join('demo/knowledge',b.jobId+'.json'),JSON.stringify(bundle,null,2)+'\n');for(const c of bundle.snapshot.captures){const full=k.captures.find(x=>x.id===c.id)!;await writeFile(join('demo/captures',c.id+'.json'),JSON.stringify(full,null,2)+'\n');}}
 await writeFile(join('demo/articles',name),JSON.stringify(portable(article),null,2)+'\n');
 await writeFile(join('.data/articles',name),JSON.stringify(article),{mode:0o600});
 await writeFile(join('demo/migrations',name),JSON.stringify({articleId:id,legacyDigest:knowledgeHash(record.original.markdown),sentences:decisions,summary:{original:decisions.length,preserved:decisions.filter((d:any)=>d.outcome==='preserved').length,corrected:decisions.filter((d:any)=>d.outcome==='corrected').length,omitted:decisions.filter((d:any)=>d.outcome==='omitted').length,factoids:revisionIds.length},humanApproval:false},null,2)+'\n');
 record.complete=true;record.migrationVersion=2;await save();console.log('Completed',article.title,revisionIds.length,'factoids',decisions.filter((d:any)=>d.outcome==='omitted').length,'omitted sentences');
}
console.log('All demo articles migrated; requests this run:',budget.used,'total:',state.requestsUsed);
}finally{store.close();}
