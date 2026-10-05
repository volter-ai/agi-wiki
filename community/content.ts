import {validateArticleImages} from '../shared/images.js';
import {assertSubjectPolicy} from '../shared/subjects.js';
import type { Article, Source } from '../server/research.js';
import { parseArticle } from '../server/research.js';
import { resolvePhilosophy, requiresFactoids, type Philosophy } from '../shared/philosophies.js';
import { hash } from './security.js';
import { HttpError } from './types.js';
export function topicKey(title:string){return title.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');}
export async function policyKey(policy:Philosophy){return policy.id==='custom'?`custom:${(await hash(policy.rules)).slice(0,20)}@${policy.version}`:`${policy.id}@${policy.version}`;}
export function validateUpload(body:any):Article{
 const a=body?.article;
 if(!a||typeof a.title!=='string'||a.title.trim().length<2||a.title.length>180||/[\r\n<>]/.test(a.title)||typeof a.topic!=='string'||a.topic.length>500||typeof a.markdown!=='string'||a.markdown.length>40000||a.markdown.length<150)throw new HttpError(400,'Upload a complete article with a title, topic, and at most 40,000 characters.');
 if(!Array.isArray(a.sources)||!a.sources.length||a.sources.length>8)throw new HttpError(400,'An article needs between 1 and 8 sources.');
 const seen=new Set<number>();
 const sources:Source[]=a.sources.map((s:any)=>{
   if(!s||!Number.isInteger(s.id)||s.id<1||s.id>100||seen.has(s.id)||typeof s.url!=='string'||s.url.length>1800)throw new HttpError(400,'Invalid source list.');seen.add(s.id);
   let u:URL;try{u=new URL(s.url);}catch{throw new HttpError(400,'Invalid source URL.');}
   if((a.philosophy?.version!==2&&!['en.wikipedia.org','en.wikisource.org','europepmc.org'].includes(u.hostname))||(a.philosophy?.version===2&&/(^|\.)(wikipedia\.org|wikimedia\.org|wikidata\.org)$/.test(u.hostname))||u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||u.hostname.endsWith('.')||/^(?:\d+\.){3}\d+$/.test(u.hostname)||u.hostname.includes(':')||/\.(local|localhost|internal|test|invalid)$/.test(u.hostname))throw new HttpError(400,'Unsupported source provider.');
   return {id:s.id,url:u.href,title:typeof s.title==='string'?s.title.slice(0,300):'Source',extract:''};
 });
 const philosophy=resolvePhilosophy(a.philosophy?.id||'general',a.philosophy?.customRules,a.philosophy?.version??1);
 if(requiresFactoids(philosophy))throw new HttpError(400,'Schematic research must contribute a validated knowledge bundle under knowledge/changes/. Prose or client-supplied factoid pins cannot satisfy this philosophy.');
 if(a.subjectId!==undefined)assertSubjectPolicy(a.subjectId,philosophy);
 try{parseArticle(`# ${a.title.trim()}\n\n${a.markdown}`,sources);}catch(e){throw new HttpError(400,(e as Error).message);}
 if(/<\/?[a-z][^>]*>/i.test(a.markdown)||/!\[/.test(a.markdown))throw new HttpError(400,'Article uploads must contain text and citations, without embedded HTML or images.');
 let images;try{images=validateArticleImages(a.images);}catch(e){throw new HttpError(400,(e as Error).message);}
 return {id:'',...(images.length?{images}:{}),...(a.subjectId?{subjectId:a.subjectId}:{}),title:a.title.trim(),topic:a.topic.trim(),markdown:a.markdown.trim(),sources,philosophy,createdAt:new Date().toISOString(),model:typeof a.model==='string'?a.model.slice(0,100):'unknown'};
}
export async function articleDigest(a:Article){return hash(JSON.stringify({...(a.subjectId?{subject:a.subjectId}:{}),topic:topicKey(a.title),policy:await policyKey(a.philosophy!),text:a.markdown.normalize('NFKC').replace(/\s+/g,' ').trim(),...(a.images?.length?{images:validateArticleImages(a.images)}:{}),sources:a.sources.map(s=>({id:s.id,url:s.url})).sort((a,b)=>a.id-b.id)}));}
