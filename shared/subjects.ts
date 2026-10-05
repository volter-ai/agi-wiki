import forkSubject from '../subjects/subject.json'; // fork-subject
import ai from '../subjects/ai.json';
import {resolvePhilosophy} from './philosophies.js';
export interface SubjectWiki {version:1;id:string;title:string;description:string;scope:string;philosophyId:string;categories:{id:string;name:string;topics:{title:string;startingSources?:string[]}[]}[]}
export function validateSubject(value:unknown):SubjectWiki {
 const s=value as SubjectWiki;
 if(!s||s.version!==1||!/^([a-z0-9]+-)*[a-z0-9]+$/.test(s.id)||s.id.length>60||typeof s.title!=='string'||!s.title.trim()||s.title.length>120||typeof s.description!=='string'||s.description.length>1000||typeof s.scope!=='string'||!s.scope.trim()||s.scope.length>2000)throw Error('Invalid subject wiki manifest.');
 resolvePhilosophy(s.philosophyId);
 if(!Array.isArray(s.categories)||!s.categories.length||s.categories.length>40)throw Error('Invalid subject categories.');
 const categories=new Set<string>(),topics=new Set<string>();
 for(const c of s.categories){
  if(!/^[a-z0-9-]{1,60}$/.test(c.id)||categories.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>120||!Array.isArray(c.topics)||!c.topics.length||c.topics.length>200)throw Error('Invalid or duplicate subject category.');
  categories.add(c.id);
  for(const t of c.topics){if(typeof t.title!=='string'||!t.title.trim()||t.title.length>180||topics.has(topicIdentity(t.title)))throw Error('Invalid or duplicate subject topic.');if(t.startingSources&&(!Array.isArray(t.startingSources)||t.startingSources.length>4||t.startingSources.some(u=>{try{const url=new URL(u);return url.protocol!=='https:'||!!url.username||!!url.password;}catch{return true;}})))throw Error('Invalid starting sources.');topics.add(topicIdentity(t.title));}
 }
 return s;
}
export const SUBJECTS:SubjectWiki[]=[validateSubject(forkSubject),...(forkSubject.id!==ai.id?[validateSubject(ai)]:[])];
export function resolveSubject(id:unknown){const s=SUBJECTS.find(s=>s.id===id);if(!s)throw Error('Unknown subject wiki.');return s;}
export function topicIdentity(title:string){return title.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');}
export function assertSubjectPolicy(subjectId:unknown,policy:{id:string;version:number}|undefined){
 const s=resolveSubject(subjectId);
 if(policy?.id!==s.philosophyId||policy.version!==2)throw Error(`${s.title} requires ${resolvePhilosophy(s.philosophyId).name}.`);
 return s;
}

export function startingSources(topic:string):string[]{return [...new Set(SUBJECTS.flatMap(s=>s.categories.flatMap(c=>c.topics)).filter(t=>topicIdentity(t.title)===topicIdentity(topic)).flatMap(t=>t.startingSources||[]))].slice(0,4);}

/** Exact registered topics belong to their subject even if a caller omits the scope. */
export function subjectForTopic(topic:string){return SUBJECTS.find(s=>s.categories.some(c=>c.topics.some(t=>topicIdentity(t.title)===topicIdentity(topic))));}
