import type {ArticleImage} from '../shared/images.js';
import {FACT_SECTIONS,factSection} from '../shared/article-blocks.js';
import type {ChatGPTClient} from '../vendor/siwc/src/types.js';
import type {Philosophy} from '../shared/philosophies.js';
import {requiresFactoids} from '../shared/philosophies.js';
import {topicIdentity} from '../shared/subjects.js';
import {currentFacts,type FactRevision,type KnowledgeSnapshot} from '../shared/knowledge.js';
import {KnowledgeStore} from './knowledge-store.js';
import {ingestSource,factPolicyKey} from './knowledge-ingest.js';
import {factArticle,assertFactoidCoverage} from './knowledge-articles.js';
import type {Article,Source} from './research.js';
import type {ResearchDocument} from './document.js';
import {documentMarkdown} from './document.js';
import {collectIndependentSources} from './web-research.js';
import {discoverForDraft} from './discovery.js';
import type {ImageCandidate} from '../shared/images.js';

export interface SchematicTask {
 id:string;engine:'schematic';profileId:string;topic:string;subjectId:string;philosophy:Philosophy;model:string;
 status:'interrupted'|'complete';sources:Source[];sourceTasks:Record<string,string>;processedURLs:string[];
 document:ResearchDocument;requestsUsed:number;runtimeMs:number;imageCandidates:ImageCandidate[];images?:ArticleImage[];
 toolCalls:number;usage:Record<string,unknown>[];revisionIds:string[];
}
interface Options {
 task:SchematicTask;store:KnowledgeStore;signal:AbortSignal;requestLimit:number;client:Pick<ChatGPTClient,'streamResponse'>;
 save:()=>Promise<void>;emit:(event:Record<string,unknown>)=>void;
 collect?:typeof collectIndependentSources;inspect?:typeof discoverForDraft;
}
export function schematicEntity(k:KnowledgeSnapshot,topic:string,policyKey:string){
 const facts=currentFacts(k,policyKey),used=new Set(facts.flatMap(f=>f.arguments.flatMap(a=>a.entityId?[a.entityId]:[])));
 const entities=k.entities.filter(e=>used.has(e.id)&&topicIdentity(e.label)===topicIdentity(topic));
 if(entities.length>1)throw Error('The topic matches multiple entity identities. Resolve the ambiguity before forming this article.');
 if(!entities.length)throw Error('No supported facts establish the exact topic identity yet.');
 return entities[0];
}
/** No writer can add prose: all final lines compile from separately audited revisions. */
export async function researchSchematic(o:Options):Promise<Article>{
 const {task:t,store,signal,emit,save}=o,key=factPolicyKey(t.philosophy);
 if(!requiresFactoids(t.philosophy))throw Error('This engine requires the schematic philosophy.');
 const doc=t.document;doc.status='reviewing';emit({type:'document',document:structuredClone(doc)});
 const sourceLimit=Math.max(1,Math.min(6,Math.floor((o.requestLimit-3)/2)));
 const sourcesEvent=()=>emit({type:'sources',sources:structuredClone(t.sources)});
 async function collect(query:string){
  const found=await (o.collect||collectIndependentSources)(query,t.philosophy,signal,o.client,event=>{
   if(event.type==='source'){
    const s=event.source as Source;if(!t.sources.some(old=>old.url===s.url)&&t.sources.length<sourceLimit){t.sources.push({...s,id:t.sources.length+1});sourcesEvent();}
   }else emit(event);
  });
  for(const s of found)if(!t.sources.some(old=>old.url===s.url)&&t.sources.length<sourceLimit)t.sources.push({...s,id:t.sources.length+1});
  sourcesEvent();await save();return found.filter(s=>t.sources.some(kept=>kept.url===s.url));
 }
 if(!t.sources.length)await collect(t.topic);else sourcesEvent();
 const relevant=(f:FactRevision,jobId:string)=>{
  const batch=store.job(jobId,t.profileId)?.batch;
  const entities=[...store.snapshot().entities,...batch?.entities||[],...Object.values(t.sourceTasks).flatMap(id=>{const b=store.job(id,t.profileId)?.batch;return b?.facts.length?b.entities:[];})];
  return f.arguments.some(a=>a.entityId&&entities.some(e=>e.id===a.entityId&&topicIdentity(e.label)===topicIdentity(t.topic)));
 };
 async function source(url:string,deferAudit=false){
  const s=t.sources.find(s=>s.url===url)!;
  let childId=t.sourceTasks[url];
  const notify=(event:Record<string,any>)=>{
   if(event.type==='task'){childId=event.id;t.sourceTasks[url]=childId;return;}
   if(event.type==='source'||event.type==='usage'||event.type==='complete'||event.type==='error')return;
   if(event.type==='progress'){emit({...event,step:String(event.message).startsWith('Extracting')?2:3});return;}
   if(event.type==='fact-candidate'&&!t.revisionIds.includes(event.fact.id)){if(t.revisionIds.length>=160)throw Error('Schematic research revision limit reached.');t.revisionIds.push(event.fact.id);}
   if(event.type==='fact-candidate'&&relevant(event.fact,childId)){
    const f:FactRevision=event.fact;
    if(!doc.blocks.some(b=>b.id===f.id)){if(doc.blocks.length>=120)throw Error('Schematic document block limit reached.');const section=factSection(f);
     if(section&&!doc.blocks.some(b=>b.markdown==='## '+section)){const rank=FACT_SECTIONS.indexOf(section as any),next=doc.blocks.findIndex(b=>b.markdown.startsWith('## ')&&FACT_SECTIONS.indexOf(b.markdown.slice(3) as any)>rank);doc.blocks.splice(next<0?doc.blocks.length:next,0,{id:'section-'+rank,markdown:'## '+section});}
     let at=section?doc.blocks.findIndex(b=>b.markdown==='## '+section)+1:1;while(at<doc.blocks.length&&!doc.blocks[at].markdown.startsWith('## '))at++;doc.blocks.splice(at,0,{id:f.id,markdown:f.statement});doc.originalMarkdown=documentMarkdown(doc);emit({type:'document',document:structuredClone(doc)});}
   }
   if(event.type==='fact-audited'){
    const f:FactRevision=event.fact,block=doc.blocks.find(b=>b.id===f.id);if(!block||doc.reviewedBlockIds.includes(f.id))return;
    const after=event.assessment.outcome==='supported'?f.statement.slice(0,-1)+` [${s.id}](#source-${s.id})`+f.statement.at(-1):'';
    const edit={blockId:f.id,before:block.markdown,after,reason:event.assessment.reason};
    block.markdown=after;doc.edits.push(edit);doc.reviewedBlockIds.push(f.id);emit({type:'review-edit',blockId:f.id,edit});
   }
  };
  const retained=childId&&store.job(childId,t.profileId);
  if(retained?.batch)for(const f of retained.batch.facts)notify({type:'fact-candidate',fact:f});
  let job=retained;
  if(retained?.status!=='complete'){
   const pendingEntities=Object.values(t.sourceTasks).flatMap(id=>{const b=store.job(id,t.profileId)?.batch;return b?.facts.length?b.entities:[];});
   try{job=await ingestSource({deferAudit,pendingEntities,store,profileId:t.profileId,subjectId:t.subjectId,philosophy:t.philosophy,topic:t.topic,model:t.model,source:s,resumeId:childId,requestLimit:o.requestLimit,signal,client:o.client,emit:notify});}
   finally{await save();}
  }else for(const f of retained.batch?.facts||[])notify({type:'fact-audited',fact:f,assessment:retained.assessments.find((a:any)=>a.revisionId===f.id)});
  if(deferAudit&&job?.status==='auditing')return;
  if(!job||job.status!=='complete')throw Error('Source audit did not complete.');
  t.processedURLs.push(url);await save();
 }
 function projection(){const k=store.snapshot(),entity=schematicEntity(k,t.topic,key);return factArticle(k,entity.id,t.philosophy);}
 for(;;){
  let article:Article|undefined;
  // Complete the first draft before editing those same blocks in the second pass.
  emit({type:'progress',step:2,message:'Filling the article from the selected original evidence…'});
  for(const s of t.sources.filter(s=>!t.processedURLs.includes(s.url))){signal.throwIfAborted();await source(s.url,true);}
  emit({type:'progress',step:3,message:'Editing and verifying every draft sentence against its quoted evidence…'});
  // Every selected source is inspected. A short valid lead is not completion of the evidence plan.
  for(const s of t.sources.filter(s=>!t.processedURLs.includes(s.url))){
   signal.throwIfAborted();await source(s.url);
   try{article=projection();}catch(error){if(!/No supported facts|incomplete or malformed/.test((error as Error).message))throw error;}
  }
  article=article||projection();
  emit({type:'progress',step:3,message:'Checking claim coverage and missing or contradictory evidence…'});
  const check=await (o.inspect||discoverForDraft)({topic:t.topic,philosophy:t.philosophy,draft:article.markdown,sources:t.sources,model:t.model,signal,client:o.client,emit,searchSources:async(query)=>collect(query)});
  t.imageCandidates=check.images;t.images=check.illustrations;await save();
  if(check.plan.sourceQueries.length){
   if(!t.sources.some(s=>!t.processedURLs.includes(s.url)))throw Error('No new qualifying evidence resolved the gap. Continue explicitly with a new allowance.');
   // Existing unprocessed sources are eligible too; never silently ignore a blocking completion check.
   continue;
  }
  assertFactoidCoverage(article,store.snapshot());signal.throwIfAborted();
  doc.status='complete';await save();
  const pins=article.knowledge!.dependencies;
  const original=doc.originalMarkdown;
  return {...article,id:t.id,topic:t.topic,model:t.model,createdAt:new Date().toISOString(),review:{originalMarkdown:original,edits:doc.edits,reviewedBlocks:pins.length,completedAt:new Date().toISOString()},...(t.imageCandidates.length?{imageCandidates:t.imageCandidates,images:t.images??[]}:{})};
 }
}
