import React,{useState} from 'react';
import {resolvePhilosophy,requiresFactoids} from '../shared/philosophies';
import {topicIdentity,type SubjectWiki} from '../shared/subjects';
export default function SubjectPortal({subject,articles,onOpen,onResearch,published=false}:{subject:SubjectWiki;articles:{id:string;title:string;topic?:string;philosophy?:{id:string;version:number};subjectId?:string;quotePreviews?:boolean;knowledge?:unknown}[];onOpen:(id:string)=>void;onResearch:(topic:string)=>void;published?:boolean}){
 const [query,setQuery]=useState('');
 const researchURL=(topic:string)=>(published?'http://127.0.0.1:4317/?':'?')+new URLSearchParams({topic,philosophy:subject.philosophyId}).toString();
 const follow=(event:React.MouseEvent<HTMLAnchorElement>,action:()=>void)=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();action();}};
 const eligible=articles.filter(a=>a.subjectId===subject.id&&a.philosophy?.id===subject.philosophyId&&a.philosophy.version===2);
 const total=subject.categories.reduce((n,c)=>n+c.topics.length,0);
 const match=(title:string)=>eligible.find(a=>topicIdentity(a.topic||a.title)===topicIdentity(title)||topicIdentity(a.title)===topicIdentity(title));
 const complete=subject.categories.flatMap(c=>c.topics).filter(t=>match(t.title)).length;
 return <section aria-label={subject.title+' portal'}>
  <section className="welcome"><h2>Welcome to <span>{subject.title}</span></h2><p>{subject.description}</p><p className="welcome-count">{complete} of {total} mapped topics {published?'published':'researched locally'} · {subject.categories.length} subject areas</p></section>
  <p><strong>{resolvePhilosophy(subject.philosophyId).name}.</strong> {requiresFactoids(resolvePhilosophy(subject.philosophyId))?'Every factual line renders from a typed factoid with an exact source quote. A separate audit checks its meaning and structure.':'Every sentence cites evidence. Each article receives a second editing pass.'} Publication requires local approval.</p>
  <details><summary>Our research standards</summary><p>{resolvePhilosophy(subject.philosophyId).rules}</p></details>
  {eligible.length>0&&<section><h2>{published?'Published articles':'Demo reading room'}</h2><p>{published?'Reviewed contributions.':'Local AI-reviewed drafts; awaiting human publication approval. Every displayed sentence has a typed claim and an exact quote preview.'}</p><ul>{eligible.map(a=><li key={a.id}><a href={'?article='+encodeURIComponent(a.id)} onClick={e=>follow(e,()=>onOpen(a.id))}>{a.title}</a><small> · {a.quotePreviews||a.knowledge?'Quote previews':published?'References only':'Prose draft'}</small></li>)}</ul></section>}
  <h2>Explore {subject.title}</h2>
  <label>Find a topic <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search the subject map"/></label>
  <p className="small">Red links are articles not yet written; blue links open existing articles. Selecting a red link prepares research without spending model usage.</p>
  <div className="main-panels">{subject.categories.map(c=>({...c,topics:c.topics.filter(t=>(t.title+' '+c.name).toLowerCase().includes(query.toLowerCase()))})).filter(c=>c.topics.length).map(c=><section className="panel" key={c.id}><h2>{c.name}</h2><ul>{c.topics.map(t=>{const a=match(t.title);return <li key={t.title}><a href={a?'?article='+encodeURIComponent(a.id):researchURL(t.title)} className={a?'':'missing-article'} title={a?(published?'Read published article':'Read local draft'):'Article not yet written — research this topic'} onClick={e=>follow(e,()=>a?onOpen(a.id):onResearch(t.title))}>{t.title}</a>{a&&!published&&<small> · Local draft</small>}</li>;})}</ul></section>)}</div>
  {query&&!subject.categories.some(c=>c.topics.some(t=>(t.title+' '+c.name).toLowerCase().includes(query.toLowerCase())))&&<p>No mapped topic matches. <button className="inline-link" onClick={()=>onResearch(query)}>Research “{query}”</button></p>}
 </section>;
}
