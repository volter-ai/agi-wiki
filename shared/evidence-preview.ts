import type {KnowledgeSnapshot} from './knowledge.js';

export interface FactoidReference {revisionId:string;digest:string;statement:string}
export interface EvidencePreview extends FactoidReference {
 approved:boolean;
 structure:{predicate:string;modality:string;attribution?:string;arguments:{role:string;value:string;type:string}[]};
 passages:{captureId:string;title:string;url:string;retrievedAt:string;stance:'supports'|'contradicts'|'context';before:string;quote:string;after:string;contextAvailable:boolean;beforeClipped:boolean;afterClipped:boolean}[];
}

/** Resolve exact revision pins, never substitute a newer claim or guess quote positions. */
export function evidencePreview(k:KnowledgeSnapshot,revisionId:string,digest:string,approvedOnly=false):EvidencePreview {
 const f=k.revisions.find(r=>r.id===revisionId&&r.digest===digest);
 if(!f||!k.audits.some(a=>a.revisionId===f.id&&a.outcome==='supported'))throw Error('This exact claim revision is unavailable.');
 const approved=k.approvals.some(a=>a.revisionId===f.id&&a.digest===f.digest);
 if(approvedOnly&&!approved)throw Error('This claim revision has no human approval.');
 const passages=f.evidence.map(e=>{
  const c=k.captures.find(c=>c.id===e.captureId);
  if(!c||!Number.isInteger(e.start)||e.start<0||e.end!==e.start+e.quote.length)throw Error('The cited passage is unavailable.');
  if(c.text&&c.text.slice(e.start,e.end)!==e.quote)throw Error('The cited passage does not match its captured source.');
  const url=new URL(c.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid original source URL.');
  const from=Math.max(0,e.start-220),to=Math.min(c.text.length,e.end+220);
  return {captureId:c.id,title:c.title,url:c.url,retrievedAt:c.retrievedAt,stance:e.stance,before:c.text?c.text.slice(from,e.start):'',quote:e.quote,after:c.text?c.text.slice(e.end,to):'',contextAvailable:!!c.text,beforeClipped:!!c.text&&from>0,afterClipped:!!c.text&&to<c.text.length};
 });
 const arguments_=f.arguments.map(a=>{const entity=k.entities.find(e=>e.id===a.entityId);return {role:a.role,value:entity?.label||a.value||a.entityId||'',type:entity?.type||a.valueType||'untyped legacy literal'};});
 return {revisionId:f.id,digest:f.digest,statement:f.statement,approved,structure:{predicate:f.predicate,modality:f.modality,...(f.attribution?{attribution:f.attribution}:{}),arguments:arguments_},passages};
}
