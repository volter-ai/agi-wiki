import {atomicSentenceCount} from '../shared/sentences.js';
import {emptyKnowledge,ENTITY_TYPES,PREDICATES,type KnowledgeSnapshot,type SourceCapture} from '../shared/knowledge.js';
import {resolvePhilosophy,type Philosophy} from '../shared/philosophies.js';
import {assertSubjectPolicy} from '../shared/subjects.js';
import {factPolicyKey,factTime,coordinateEvidence} from './knowledge-ingest.js';
import {knowledgeHash} from './knowledge-store.js';
import {evidenceURL} from './web-evidence.js';
import {requiresFactoids} from '../shared/philosophies.js';
import {validateSchematicFact} from '../shared/schematic.js';
import {validateArticleImages,type ArticleImage} from '../shared/images.js';
export interface KnowledgeBundle {kind:'knowledge';ontologyVersion:1;subjectId:string;philosophy:Philosophy;snapshot:KnowledgeSnapshot;illustrations?:{entityId:string;image:ArticleImage}[]}
/** Retain the prior revisions and conflicts required to review a source batch. */
export function exportKnowledgeBundle(all:KnowledgeSnapshot,subjectId:string,philosophy:Philosophy,jobId?:string,revisionIds?:string[],illustrations?:KnowledgeBundle['illustrations']):KnowledgeBundle {
 const eligible=all.revisions.filter(f=>f.subjectId===subjectId&&f.policyKey===factPolicyKey(philosophy));
 const selected=new Set(eligible.filter(f=>(!jobId||f.extractionJobId===jobId)&&(!revisionIds||revisionIds.includes(f.id))).map(f=>f.id));
 if(revisionIds&&(new Set(revisionIds).size!==revisionIds.length||revisionIds.some(id=>!selected.has(id))))throw Error('Export requires exact revision IDs under this policy.');
 if(!selected.size)throw Error('No claim revisions in this source batch.');
 let changed=true;while(changed){changed=false;for(const f of eligible.filter(f=>selected.has(f.id))){
  for(const related of eligible.filter(r=>r.id===f.previousRevisionId||f.conflictsWith.includes(r.factId)))if(!selected.has(related.id)){selected.add(related.id);changed=true;}
 }}
 const revisions=eligible.filter(f=>selected.has(f.id)),entityIds=new Set(revisions.flatMap(f=>f.arguments.flatMap(a=>a.entityId?[a.entityId]:[]))),captureIds=new Set(revisions.flatMap(f=>f.evidence.map(e=>e.captureId)));
 return validateKnowledgeBundle({kind:'knowledge',ontologyVersion:1,subjectId,philosophy,...(illustrations?.length?{illustrations}:{}),snapshot:{ontologyVersion:1,revisions,entities:all.entities.filter(e=>entityIds.has(e.id)),captures:all.captures.filter(c=>captureIds.has(c.id)),audits:all.audits.filter(a=>selected.has(a.revisionId))}});
}
const validID=(s:unknown)=>typeof s==='string'&&/^[a-z0-9_-]{1,100}$/.test(s);
const bounded=(s:unknown,n:number)=>typeof s==='string'&&!!s.trim()&&s.length<=n&&!/[\u0000-\u001f<>]/.test(s);
export function validateKnowledgeBundle(raw:any):KnowledgeBundle{
 if(raw?.kind!=='knowledge'||raw.ontologyVersion!==1)throw Error('Unsupported knowledge bundle.');
 const philosophy=resolvePhilosophy(raw.philosophy?.id,raw.philosophy?.customRules,raw.philosophy?.version);assertSubjectPolicy(raw.subjectId,philosophy);const key=factPolicyKey(philosophy);
 const input=raw.snapshot;
 if(!input||input.ontologyVersion!==1||!Array.isArray(input.entities)||input.entities.length>300||!Array.isArray(input.captures)||!input.captures.length||input.captures.length>8||!Array.isArray(input.revisions)||!input.revisions.length||input.revisions.length>200||!Array.isArray(input.audits)||input.audits.length!==input.revisions.length)throw Error('Invalid or oversized knowledge bundle.');
 const snapshot=emptyKnowledge(),entities=new Set<string>(),captures=new Map<string,SourceCapture>(),revisions=new Set<string>();
 for(const e of input.entities){if(!validID(e.id)||entities.has(e.id)||!bounded(e.label,180)||!ENTITY_TYPES.includes(e.type)||e.subjectId!==raw.subjectId||!['registered','proposed'].includes(e.identity))throw Error('Invalid entity registration.');entities.add(e.id);snapshot.entities.push({id:e.id,label:e.label,type:e.type,subjectId:e.subjectId,identity:e.identity});}
 for(const c of input.captures){
  if(!validID(c.id)||captures.has(c.id)||!validID(c.sourceId)||!bounded(c.title,300)||!/^[a-f0-9]{64}$/.test(c.sha256)||!['primary','original-reporting'].includes(c.evidenceType)||!bounded(c.classificationReason,1000)||c.representation!=='extracted-text'||!Number.isFinite(Date.parse(c.retrievedAt)))throw Error('Invalid capture reference.');evidenceURL(c.url);
  const capture:SourceCapture={id:c.id,sourceId:c.sourceId,url:c.url,title:c.title,sha256:c.sha256,retrievedAt:c.retrievedAt,representation:'extracted-text',evidenceType:c.evidenceType,classificationReason:c.classificationReason,text:''};captures.set(c.id,capture);snapshot.captures.push(capture);
 }
 for(const f of input.revisions){
  if(!validID(f.id)||revisions.has(f.id)||!validID(f.factId)||f.subjectId!==raw.subjectId||f.policyKey!==key||!bounded(f.statement,900)||!PREDICATES.includes(f.predicate)||!['asserted','reported','proposed','negated'].includes(f.modality)||!Array.isArray(f.arguments)||f.arguments.length>12||f.arguments.filter((a:any)=>a.role==='subject'&&entities.has(a.entityId)).length!==1||!Array.isArray(f.evidence)||!f.evidence.length||f.evidence.length>6||!f.evidence.some((e:any)=>e.stance==='supports')||!Array.isArray(f.conflictsWith)||!Array.isArray(f.uncertainties)||f.conflictsWith.length>8||f.uncertainties.length>8||f.uncertainties.some((u:any)=>!bounded(u,500))||knowledgeHash({...f,digest:undefined})!==f.digest)throw Error('Invalid or unbound fact revision.');
  if(atomicSentenceCount(f.statement)!==1||!/[.!?]$/.test(f.statement)||/https?:\/\/|\[[^\]]*\]\(/.test(f.statement))throw Error('Expected an atomic plain sentence.');
  if(f.time)factTime(f.time);
  for(const a of f.arguments)if(!['subject','object','baseline','participant','property','value','unit','version','conditions'].includes(a.role)||!!a.entityId===!!a.value||a.entityId&&!entities.has(a.entityId)||a.value&&!bounded(a.value,500))throw Error('Invalid fact argument.');
  if(requiresFactoids(philosophy))validateSchematicFact(f,snapshot.entities);
  for(const e of f.evidence)if(!captures.has(e.captureId)||!(typeof e.quote==='string'&&e.quote.trim()&&e.quote.length<=1200&&!/[\u0000-\u001f]/.test(e.quote))||!Number.isInteger(e.start)||e.start<0||e.end!==e.start+e.quote.length||e.end>14000||!['supports','contradicts','context'].includes(e.stance))throw Error('Invalid passage anchor.');
  if(f.modality==='reported'&&!bounded(f.attribution,180))throw Error('Reported claims require attribution.');
  if(f.location&&(!Number.isFinite(f.location.latitude)||!Number.isFinite(f.location.longitude)||Math.abs(f.location.latitude)>90||Math.abs(f.location.longitude)>180||f.predicate!=='located_at'||!bounded(f.location.basis,500)||!['event','organization','subject'].includes(f.location.role)||!f.evidence.some((e:any)=>e.stance==='supports'&&coordinateEvidence(e.quote,f.location.latitude,f.location.longitude))))throw Error('Invalid map coordinate claim.');
  revisions.add(f.id);snapshot.revisions.push(f);
 }
 const audits=new Set<string>();for(const a of input.audits){if(!revisions.has(a.revisionId)||audits.has(a.revisionId)||!['supported','uncertain','unsupported'].includes(a.outcome)||!bounded(a.reason,1000)||!bounded(a.model,100))throw Error('Invalid audit coverage.');audits.add(a.revisionId);snapshot.audits.push(a);}
 const allFacts=new Set(snapshot.revisions.map(f=>f.factId));
 const prior=new Map<string,typeof snapshot.revisions[number]>();
 for(const f of snapshot.revisions){if(f.previousRevisionId&&(!prior.has(f.previousRevisionId)||prior.get(f.previousRevisionId)!.factId!==f.factId)||f.conflictsWith.some(id=>!allFacts.has(id)))throw Error('The bundle must retain ordered, acyclic fact history.');prior.set(f.id,f);}
 // Uploaded approval arrays never confer local or publication approval.
 let illustrations:KnowledgeBundle['illustrations'];
 if(raw.illustrations!==undefined){
  if(!Array.isArray(raw.illustrations)||raw.illustrations.length>3)throw Error('Invalid knowledge illustrations.');
  const depicted=new Set<string>();
  illustrations=raw.illustrations.map((i:any)=>{
   if(!i||!entities.has(i.entityId)||depicted.has(i.entityId)||!snapshot.revisions.some(f=>f.arguments.some(a=>a.role==='subject'&&a.entityId===i.entityId)))throw Error('Illustrations must belong to a unique subject entity in this bundle.');
   depicted.add(i.entityId);const [image]=validateArticleImages([i.image]);return {entityId:i.entityId,image};
  });
 }
 return {kind:'knowledge',ontologyVersion:1,subjectId:raw.subjectId,philosophy,snapshot,...(illustrations?.length?{illustrations}:{})};
}
export function verifyBundleEvidence(bundle:KnowledgeBundle,retrieved:{url:string;extract:string}[]){
 for(const capture of bundle.snapshot.captures){const source=retrieved.find(s=>s.url===capture.url);if(!source||knowledgeHash(source.extract)!==capture.sha256)throw Error('Source capture changed or could not be reproduced. Re-extract and review a new bundle.');
  for(const fact of bundle.snapshot.revisions)for(const e of fact.evidence.filter(e=>e.captureId===capture.id))if(source.extract.slice(e.start,e.end)!==e.quote)throw Error('Claim passage does not match the independently retrieved source.');
 }
}
export function mergeKnowledge(target:KnowledgeSnapshot,bundle:KnowledgeBundle,approval?:{reviewer:string;approvedAt:string}){
 for(const table of ['entities','captures','revisions','audits'] as const)for(const record of bundle.snapshot[table]){
  const identity=(r:any)=>table==='audits'?r.revisionId:r.id;
  const old=target[table].find(r=>identity(r)===identity(record));
  if(old){if(JSON.stringify(old)!==JSON.stringify(record))throw Error('Immutable knowledge identity changed across bundles.');}
  else (target[table] as any[]).push(record);
 }
 if(approval)for(const fact of bundle.snapshot.revisions)if(bundle.snapshot.audits.some(a=>a.revisionId===fact.id&&a.outcome==='supported')&&!target.approvals.some(a=>a.revisionId===fact.id))target.approvals.push({revisionId:fact.id,digest:fact.digest,...approval});
 return target;
}
