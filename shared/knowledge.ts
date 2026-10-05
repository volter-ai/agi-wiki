/** Common claim ontology. A represented assertion is not a declaration of truth. */
export const ONTOLOGY_VERSION = 1 as const;
export const ENTITY_TYPES = ['person','organization','paper','model','product','benchmark','technique','hardware','dataset','law','place','concept','event'] as const;
export const PREDICATES = ['introduced','released','authored','developed_by','uses','evaluated_on','reports_result','has_property','located_at','regulates','requires','related_to','describes','implemented_by','compares'] as const;
export type EntityType = typeof ENTITY_TYPES[number];
export type Predicate = typeof PREDICATES[number];
export interface KnowledgeEntity {id:string;label:string;type:EntityType;subjectId:string;identity:'registered'|'proposed';authority?:string}
export interface SourceCapture {id:string;sourceId:string;url:string;title:string;text:string;sha256:string;retrievedAt:string;representation:'extracted-text';evidenceType:'primary'|'original-reporting';classificationReason:string}
export interface EvidenceUse {captureId:string;start:number;end:number;quote:string;stance:'supports'|'contradicts'|'context'}
export interface FactArgument {role:'subject'|'object'|'baseline'|'participant'|'property'|'value'|'unit'|'version'|'conditions';entityId?:string;value?:string;valueType?:'text'|'number'|'boolean'|'date'}
export interface FactTime {start?:string;end?:string;precision:'day'|'month'|'year'|'range';basis:string}
export interface FactRevision {
 id:string;factId:string;previousRevisionId?:string;subjectId:string;policyKey:string;
 statement:string;predicate:Predicate;arguments:FactArgument[];
 modality:'asserted'|'reported'|'proposed'|'negated';attribution?:string;
 time?:FactTime;location?:{latitude:number;longitude:number;role:'event'|'organization'|'subject';basis:string};
 evidence:EvidenceUse[];conflictsWith:string[];uncertainties:string[];
 createdAt:string;digest:string;extractionJobId:string;
}
export interface FactAudit {revisionId:string;outcome:'supported'|'uncertain'|'unsupported';reason:string;model:string;createdAt:string}
export interface FactApproval {revisionId:string;digest:string;reviewer:string;approvedAt:string}
export interface KnowledgeSnapshot {ontologyVersion:1;entities:KnowledgeEntity[];captures:SourceCapture[];revisions:FactRevision[];audits:FactAudit[];approvals:FactApproval[]}
export interface ArticleDependency {factId:string;revisionId:string;digest:string}
export const emptyKnowledge = ():KnowledgeSnapshot=>({ontologyVersion:1,entities:[],captures:[],revisions:[],audits:[],approvals:[]});
export function scopedKnowledge(k:KnowledgeSnapshot,subjectId:string,policyKey:string):KnowledgeSnapshot {
 const revisions=k.revisions.filter(f=>f.subjectId===subjectId&&f.policyKey===policyKey);
 const ids=new Set(revisions.map(f=>f.id)),captures=new Set(revisions.flatMap(f=>f.evidence.map(e=>e.captureId)));
 return {...k,revisions,entities:k.entities.filter(e=>e.subjectId===subjectId),captures:k.captures.filter(c=>captures.has(c.id)),audits:k.audits.filter(a=>ids.has(a.revisionId)),approvals:k.approvals.filter(a=>ids.has(a.revisionId))};
}
export function currentFacts(k:KnowledgeSnapshot,policyKey:string,mode:'preview'|'approved'='preview') {
 const audited=new Set(k.audits.filter(a=>a.outcome==='supported').map(a=>a.revisionId));
 const approved=new Map(k.approvals.map(a=>[a.revisionId,a.digest]));
 const selected=new Map<string,FactRevision>();
 for(const r of k.revisions){
  if(r.policyKey!==policyKey||!audited.has(r.id)||(mode==='approved'&&approved.get(r.id)!==r.digest))continue;
  // Revisions arrive in append order; wall-clock ties cannot reorder corrections.
  selected.set(r.factId,r);
 }
 return [...selected.values()].sort((a,b)=>a.factId.localeCompare(b.factId));
}
export function knowledgeViews(k:KnowledgeSnapshot,policyKey:string,mode:'preview'|'approved'='preview'){
 const facts=currentFacts(k,policyKey,mode);
 const ids=new Set(facts.flatMap(f=>f.arguments.flatMap(a=>a.entityId?[a.entityId]:[])));
 const nodes=k.entities.filter(e=>ids.has(e.id));
 const edges=facts.flatMap(f=>{const from=f.arguments.find(a=>a.role==='subject')?.entityId;return from?f.arguments.filter(a=>a.entityId&&a.entityId!==from).map(a=>({from,to:a.entityId!,predicate:f.predicate,role:a.role,modality:f.modality,attribution:f.attribution,factId:f.factId,revisionId:f.id})):[];});
 return {facts,nodes,edges,
  timeline:facts.filter(f=>f.time&&(f.time.start||f.time.end)).sort((a,b)=>(a.time!.start||a.time!.end!).localeCompare(b.time!.start||b.time!.end!)),
  undated:facts.filter(f=>!f.time||!f.time.start&&!f.time.end),
  geojson:{type:'FeatureCollection' as const,features:facts.filter(f=>f.location).map(f=>({type:'Feature' as const,id:f.id,geometry:{type:'Point' as const,coordinates:[f.location!.longitude,f.location!.latitude]},properties:{factId:f.factId,revisionId:f.id,statement:f.statement,role:f.location!.role,basis:f.location!.basis,status:mode==='approved'?'approved':'preview'}}))}
 };
}
export function factsForEntity(k:KnowledgeSnapshot,entityId:string,policyKey:string,mode:'preview'|'approved'='preview'){
 return currentFacts(k,policyKey,mode).filter(f=>f.arguments.some(a=>a.entityId===entityId));
}
export function staleDependencies(dependencies:ArticleDependency[],facts:FactRevision[]){
 const current=new Map(facts.map(f=>[f.factId,f]));
 return dependencies.filter(d=>current.get(d.factId)?.id!==d.revisionId||current.get(d.factId)?.digest!==d.digest);
}
