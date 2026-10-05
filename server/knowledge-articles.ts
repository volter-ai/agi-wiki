import {FACT_SECTIONS,factoidBlocks,factSection} from '../shared/article-blocks.js';
import {currentFacts,factsForEntity,type KnowledgeSnapshot} from '../shared/knowledge.js';
import type {Philosophy} from '../shared/philosophies.js';
import {parseArticle,type Article,type Source} from './research.js';
import {factPolicyKey} from './knowledge-ingest.js';
import {requiresFactoids} from '../shared/philosophies.js';
import {validateSchematicFact} from '../shared/schematic.js';
export function factArticle(k:KnowledgeSnapshot,entityId:string,philosophy:Philosophy,mode:'preview'|'approved'='preview',options?:{revisionIds?:string[];sections?:Record<string,string>}):Article{
 const entity=k.entities.find(e=>e.id===entityId);if(!entity)throw Error('Unknown entity.');
 const key=factPolicyKey(philosophy);
 const sectionRank=(f:KnowledgeSnapshot['revisions'][number])=>FACT_SECTIONS.indexOf(factSection(f) as any);
 const rank=(f:KnowledgeSnapshot['revisions'][number])=>f.predicate==='has_property'&&f.arguments.some(a=>a.role==='property'&&a.value==='definition')?0:['introduced','released','authored','developed_by'].includes(f.predicate)?1:2;
 const all=currentFacts(k,key,mode),eligible=options?.revisionIds?all:factsForEntity(k,entityId,key,mode);
 const selected=options?.revisionIds?options.revisionIds.map(id=>{const f=eligible.find(f=>f.id===id);if(!f)throw Error('Requested article revision is ineligible.');return f;}):eligible.sort((a,b)=>sectionRank(a)-sectionRank(b)||rank(a)-rank(b)||a.createdAt.localeCompare(b.createdAt)||a.factId.localeCompare(b.factId));
 if(!selected.length)throw Error('No eligible claims for this entity under these standards.');
 const scope=articleScope(all,entityId,selected),captureIds:string[]=[],facts=[];
 for(const f of scope)for(const e of f.evidence.filter(e=>e.stance==='supports'))if(!captureIds.includes(e.captureId))captureIds.push(e.captureId);
 if(captureIds.length>8)throw Error('Article scope exceeds its source limit.');
 if(options?.revisionIds&&selected.length>80)throw Error('Article exceeds the 80-fact projection limit; split the subject.');
 for(const f of selected){
  if(requiresFactoids(philosophy))validateSchematicFact(f,k.entities);
  const ids=f.evidence.filter(e=>e.stance==='supports').map(e=>e.captureId);
  if(new Set([...captureIds,...ids]).size>8)continue;
  for(const id of ids)if(!captureIds.includes(id))captureIds.push(id);facts.push(f);
  if(facts.length>=80)break;
 }
 const sources:Source[]=captureIds.map((id,i)=>{const s=k.captures.find(c=>c.id===id);if(!s)throw Error('Missing captured evidence.');return {id:i+1,captureId:s.id,title:s.title,url:s.url,extract:s.text,evidenceType:s.evidenceType,selectionReason:s.classificationReason,retrievedAt:s.retrievedAt};});
 let previousSection='';
 const markdown=facts.map(f=>{const punctuation=f.statement.at(-1)!;const body=f.statement.slice(0,-1);const refs=[...new Set(f.evidence.filter(e=>e.stance==='supports').map(e=>captureIds.indexOf(e.captureId)+1))].map(id=>`[${id}](#source-${id})`).join(' ');const section=options?.sections?options.sections[f.id]||'':factSection(f);if(section&&!FACT_SECTIONS.includes(section as any))throw Error('Unknown article section.');const heading=section&&section!==previousSection?'## '+section+'\n\n':'';previousSection=section;return heading+`${body} ${refs}${punctuation}`;}).join('\n\n');
 const parsed=parseArticle(`# ${entity.label}\n\n${markdown}`,sources);
 return {...parsed,id:'knowledge-'+entity.id,topic:entity.label,subjectId:entity.subjectId,sources,philosophy,createdAt:facts.map(f=>f.createdAt).sort().at(-1)!,model:'Shared claim projection',knowledge:{ontologyVersion:1,entityId,policyKey:key,mode,dependencies:facts.map(pin),...(scope.length?{scope:scope.map(pin)}:{})}};
}

/** Exact sentence coverage, including quote bindings and citation identity, is a host invariant. */
export function assertFactoidCoverage(article:Article,k:KnowledgeSnapshot){
 if(!article.philosophy||!requiresFactoids(article.philosophy)||!article.knowledge||article.knowledge.policyKey!==factPolicyKey(article.philosophy))throw Error('Schematic articles require their exact factoid policy and revision bindings.');
 const entity=k.entities.find(e=>e.id===article.knowledge!.entityId&&e.subjectId===article.subjectId);
 if(!entity||entity.label!==article.title)throw Error('Article title must identify its bound entity.');
 const paragraphs=factoidBlocks(article.markdown).filter(b=>b.claimIndex!==null).map(b=>b.text),pins=article.knowledge.dependencies;
 if(!pins.length||pins.length!==paragraphs.length||new Set(pins.map(p=>p.revisionId)).size!==pins.length)throw Error('Every article line must have exactly one factoid revision binding.');
 const scopePins=article.knowledge.scope||[];
 const bound=[...pins,...scopePins].map(p=>{const f=k.revisions.find(f=>f.id===p.revisionId&&f.factId===p.factId&&f.digest===p.digest&&f.subjectId===article.subjectId&&f.policyKey===article.knowledge!.policyKey);if(!f||!k.audits.some(a=>a.revisionId===f.id&&a.outcome==='supported'))throw Error('Invalid audited article scope.');validateSchematicFact(f,k.entities);if(article.knowledge!.mode==='approved'&&!k.approvals.some(a=>a.revisionId===f.id&&a.digest===f.digest))throw Error('Every approved article binding requires exact human approval.');return f;});
 if(new Set([...pins,...scopePins].map(p=>p.revisionId)).size!==pins.length+scopePins.length||scopePins.length>12)throw Error('Invalid article scope bindings.');
 articleScope(bound,entity.id,bound.slice(0,pins.length));
 const captures=new Map(k.captures.map(c=>[c.id,c]));
 for(const f of bound.slice(pins.length))for(const e of f.evidence.filter(e=>e.stance==='supports')){const c=captures.get(e.captureId);if(!c||!article.sources.some(s=>s.captureId?s.captureId===c.id:s.url===c.url)||c.text&&c.text.slice(e.start,e.end)!==e.quote)throw Error('Missing exact article scope evidence.');}
 for(let i=0;i<pins.length;i++){
  const pin=pins[i],f=k.revisions.find(f=>f.id===pin.revisionId&&f.factId===pin.factId&&f.digest===pin.digest&&f.policyKey===article.knowledge!.policyKey&&f.subjectId===article.subjectId);
  if(!f||!k.audits.some(a=>a.revisionId===f.id&&a.outcome==='supported'))throw Error('Every line needs an eligible, audited revision for this entity.');
  validateSchematicFact(f,k.entities);
  const ids:number[]=[];
  for(const e of f.evidence.filter(e=>e.stance==='supports')){
   const capture=captures.get(e.captureId),source=article.sources.find(s=>s.captureId?s.captureId===capture?.id:s.url===capture?.url);
   if(!capture||!source||e.end!==e.start+e.quote.length||e.start<0||capture.text&&capture.text.slice(e.start,e.end)!==e.quote)throw Error('The article is missing its exact supporting source evidence.');
   if(!ids.includes(source.id))ids.push(source.id);
  }
  const expected=f.statement.slice(0,-1)+' '+ids.map(id=>`[${id}](#source-${id})`).join(' ')+f.statement.at(-1);
  if(!ids.length||paragraphs[i]!==expected)throw Error('Article prose cannot add, paraphrase or omit content outside its bound factoids.');
 }
}

const pin=(f:KnowledgeSnapshot['revisions'][number])=>({factId:f.factId,revisionId:f.id,digest:f.digest});
/** A related sentence needs a bounded, evidenced relationship path, never an invented participant. */
export function articleScope(all:KnowledgeSnapshot['revisions'],root:string,body:KnowledgeSnapshot['revisions']){
 const bridge=new Set(['describes','uses','related_to','requires','introduced','developed_by','implemented_by']);
 const reached=new Map<string,KnowledgeSnapshot['revisions']>([[root,[]]]);
 for(let depth=0;depth<3;depth++){
  const before=new Map(reached);
  for(const f of all){if(!bridge.has(f.predicate)||!['asserted','reported'].includes(f.modality))continue;
   const from=f.arguments.find(a=>a.role==='subject')?.entityId,to=f.arguments.find(a=>a.role==='object')?.entityId;if(!from||!to)continue;
   if(before.has(from)&&!reached.has(to))reached.set(to,[...before.get(from)!,f]);
   if(before.has(to)&&!reached.has(from))reached.set(from,[...before.get(to)!,f]);
  }
 }
 const selected=new Set(body.map(f=>f.id)),scope=new Map<string,KnowledgeSnapshot['revisions'][number]>();
 for(const f of body){const paths=f.arguments.flatMap(a=>a.entityId&&reached.has(a.entityId)?[reached.get(a.entityId)!]:[]).sort((a,b)=>a.length-b.length);if(!paths.length)throw Error('A related fact needs an audited relationship path to the article topic.');for(const link of paths[0])if(!selected.has(link.id))scope.set(link.id,link);}
 if(scope.size>12)throw Error('Article relationship scope limit reached.');return [...scope.values()];
}
