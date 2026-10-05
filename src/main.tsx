import ArticleImages from './ArticleImages';
import KnowledgeExplorer from './KnowledgeExplorer';
import {FactoidArticle} from './EvidencePreview';
import site from '../github/site.json';
import {resolveSubject,topicIdentity} from '../shared/subjects';
import SubjectPortal from './SubjectPortal';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Article, Source } from '../server/research';
import type { ResearchDocument, DocumentEdit } from '../server/document';
import { documentMarkdown } from '../server/document';
import type { SessionState, ChatGPTModel } from '../vendor/siwc/src/types';
import './style.css';
import './article-images.css';
import PagesReader from './PagesReader';
import GitHubContribution from './GitHubContribution';
import { communityOnly } from './community-api';
import {imageMarkdown,type ArticleImage} from '../shared/images';
import { PHILOSOPHIES,resolvePhilosophy,requiresFactoids } from '../shared/philosophies';

type SavedArticle = Pick<Article, 'id' | 'title' | 'topic' | 'createdAt' | 'subjectId' | 'philosophy'> & {quotePreviews?:boolean};
type SharedArticle = SavedArticle & {entityId:string;quotePreviews:true};
const example: Article = {
  id: 'example', title: 'Overview effect', topic: 'The overview effect', createdAt: '', model: 'Prewritten example',
  markdown: `The **overview effect** is a cognitive shift reported by some astronauts while viewing Earth from space [1](#source-1). The experience involves seeing Earth as a small, fragile planet and can produce a sense of connection with humanity and concern for the environment [1](#source-1).

## Background

Author Frank White introduced the term in his 1987 book *The Overview Effect: Space Exploration and Human Evolution* [1](#source-1). His work draws on accounts of how spaceflight can affect astronauts’ perspectives on Earth and its inhabitants [1](#source-1).

## Characteristics

Descriptions of the experience often emphasize the planet’s thin atmosphere, the absence of visible political boundaries, and the interconnectedness of life on Earth [1](#source-1). These accounts associate the experience with feelings of awe and an awareness of Earth’s vulnerability [1](#source-1).

## Significance

The overview effect has been discussed in relation to environmental awareness and a sense of shared responsibility for Earth [1](#source-1). Accounts of the experience connect a changed physical perspective with reflection on humanity’s place in the universe [1](#source-1).`,
  sources: [{ id: 1, title: 'Overview effect', url: 'https://en.wikipedia.org/wiki/Overview_effect', extract: '' }]
};
function slug(text: string) { return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    menu: <path d="M3 6h18M3 12h18M3 18h18"/>,
    globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.globe}</svg>;
}
function WikiMarkdown({ text }: { text: string }) {
  return <Markdown allowedElements={['h1','h2','h3','p','strong','em','a']} unwrapDisallowed remarkPlugins={[remarkGfm]} components={{
    h2: ({ children }) => <h2 id={slug(String(children))}>{children}</h2>,
    a: ({ href, children }) => href?.startsWith('#source-') ? <sup className="reference"><a href={href}>[{children}]</a></sup> : <a href={href} target="_blank" rel="noreferrer">{children}</a>,
    img: () => null,
  }}>{text}</Markdown>;
}
function LiveBlock({block,edit}:{block:{id:string;markdown:string};edit?:DocumentEdit}) {
  const [flash,setFlash]=useState(false);
  useEffect(()=>{if(!edit)return;setFlash(true);const timer=window.setTimeout(()=>setFlash(false),4800);return()=>clearTimeout(timer);},[edit]);
  return <div className={`document-block ${flash?'just-edited':''}`} data-block-id={block.id}>
    <WikiMarkdown text={block.markdown}/>
    {edit && <span className="edit-marker" title={edit.reason}>{block.markdown?'Edited':'Removed unsupported text'}</span>}
  </div>;
}
function SourceList({ sources, expanded = false }: { sources: Source[]; expanded?: boolean }) {
  return <ol className="references">{sources.map(s => <li key={s.id} id={`source-${s.id}`}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>. <i>{s.provider || 'Source'}</i>.{expanded && s.selectionReason && <p className="small">Selection rationale (AI){s.evidenceType?` · ${s.evidenceType}`:''}: {s.selectionReason}</p>}{expanded && s.extract && <blockquote>{s.extract}</blockquote>}</li>)}</ol>;
}
function EditHistory({ edits }: { edits: DocumentEdit[] }) {
  return <div className="edit-list">{edits.map((edit, index) => <details key={`${edit.blockId}-${index}`}><summary><span className="edit-count">{index + 1}</span>{edit.reason}</summary><div className="edit-diff"><div><span>Before</span><del>{edit.before || '(empty)'}</del></div><div><span>After</span><ins>{edit.after || '(removed)'}</ins></div></div></details>)}</div>;
}
function App() {
  const [session, setSession] = useState<SessionState>({ status: 'disconnected', sharing: false });
  const [models, setModels] = useState<ChatGPTModel[]>([]); const [model, setModel] = useState('');
  const [topic, setTopic] = useState(new URLSearchParams(location.search).get('topic') || '');
  const [philosophyId, setPhilosophyId] = useState((site.subjectId?resolveSubject(site.subjectId).philosophyId:new URLSearchParams(location.search).get('philosophy')) || resolveSubject(site.defaultSubject).philosophyId);
  const [customRules, setCustomRules] = useState('');
  const [engine,setEngine]=useState('direct');
  const [requestLimit,setRequestLimit]=useState(8);
  const [minuteLimit,setMinuteLimit]=useState(8);
  const [usage,setUsage]=useState<{used:number;limit:number}|null>(null);
  const [activeTopic,setActiveTopic]=useState('');
  const [drafts,setDrafts]=useState<any[]>([]);
  const [knowledgeOpen,setKnowledgeOpen]=useState(new URLSearchParams(location.search).get('view')==='knowledge');
  const [publishOpen, setPublishOpen] = useState(false); const [articles, setArticles] = useState<SavedArticle[]>([]);
  const [sharedArticles,setSharedArticles]=useState<SharedArticle[]>([]);
  const [article, setArticle] = useState<Article | null>(null);
  const [tab, setTab] = useState<'read' | 'sources' | 'history'>('read');
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(''); const [step, setStep] = useState(0);
  const [articleImages,setArticleImages]=useState<ArticleImage[]>([]);
  const [sources, setSources] = useState<Source[]>([]); const [stream, setStream] = useState('');
  const [doc, setDoc] = useState<ResearchDocument | null>(null);
  const [error, setError] = useState(''); const [authUrl, setAuthUrl] = useState(''); const [authOpen, setAuthOpen] = useState(false);
  const [textSize, setTextSize] = useState('standard'); const [wide, setWide] = useState(false); const [menuOpen, setMenuOpen] = useState(false);
  const csrf = useRef(''); const abort = useRef<AbortController | null>(null); const search = useRef<HTMLInputElement>(null);
  const previousProfile = useRef(''); const modal = useRef<HTMLElement>(null);

  async function api(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`/api/${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-WikiChat-Token': csrf.current }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed.'); return data;
  }
  async function loadLibrary() {
    const [saved,drafts,knowledge]=await Promise.all([api('articles'),api('drafts'),api('knowledge?subject='+encodeURIComponent(site.defaultSubject)+'&mode=preview')]);
    setArticles(saved);setDrafts(drafts);
    setSharedArticles(knowledge.views.nodes.filter((e:{id:string})=>knowledge.articleEntities.includes(e.id)).map((e:{id:string;label:string})=>({id:'knowledge-'+e.id,entityId:e.id,title:e.label,topic:e.label,createdAt:'',subjectId:site.defaultSubject,philosophy:resolvePhilosophy(resolveSubject(site.defaultSubject).philosophyId),quotePreviews:true})));
  }
  async function refreshSession() {
    const data = await api('session'); csrf.current = data.csrf; setSession(data.session); setAuthUrl(data.authorizationUrl || '');
    if (data.authError) setError(data.authError);
    const profile = data.session.sharing ? data.session.profileId : '';
    if (profile && profile !== previousProfile.current) {
      const catalog = await api('models'); setModels(catalog); setModel(catalog[0]?.slug || ''); previousProfile.current = profile; setAuthOpen(false);
    } else if (!profile) { previousProfile.current = ''; setModels([]); setModel(''); }
  }
  useEffect(() => { void Promise.all([refreshSession(), loadLibrary()]).then(()=>{const params=new URLSearchParams(location.search),id=params.get('article');if(id)void openArticle(id,params.get('claimMode')==='approved'?'approved':'preview');}).catch(e => setError(e.message)); }, []);
  useEffect(()=>{if(philosophyId==='schematic')setEngine('direct');},[philosophyId]);
  useEffect(() => {
    if (session.status !== 'connecting') return;
    const timer = window.setInterval(() => void refreshSession().catch(e => setError(e.message)), 1200);
    return () => clearInterval(timer);
  }, [session.status]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); search.current?.focus(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!authOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    modal.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAuthOpen(false);
      if (event.key !== 'Tab') return;
      const nodes = [...(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select') || [])];
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    window.addEventListener('keydown', key); return () => { window.removeEventListener('keydown', key); previous?.focus(); };
  }, [authOpen]);
  async function connect() {
    try { setError(''); await refreshSession(); await api('auth/sign-in', 'POST'); setSession(s => ({ ...s, status: 'connecting' })); setAuthOpen(true); } catch (e) { setError((e as Error).message); }
  }
  async function research(e?: React.FormEvent, resumeId?:string) {
    e?.preventDefault(); if ((!topic.trim()&&!resumeId) || busy) return;
    if (!session.sharing) { setAuthOpen(true); return; }
    articleURL();
    setKnowledgeOpen(false);
    setActiveTopic(resumeId ? drafts.find(d=>d.id===resumeId)?.topic || topic : topic.trim());
    setUsage(null);setError(''); setBusy(true); setArticle(null); setDoc(null); setTab('read'); setStream(''); setSources([]); setArticleImages([]); setStep(0); setProgress('Preparing research…');
    const controller = new AbortController(); abort.current = controller;
    try {
      await refreshSession();
      const response = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WikiChat-Token': csrf.current }, body: JSON.stringify({ topic, subjectId:philosophyId===resolveSubject(site.defaultSubject).philosophyId?site.defaultSubject:undefined, model, philosophyId, customRules, engine, resumeId, budget:{requests:requestLimit,minutes:minuteLimit} }), signal: controller.signal });
      if (!response.ok) throw new Error((await response.json()).error);
      if (!response.body) throw new Error('No research stream received.');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = ''; let completed = false;
      for (;;) {
        const { done, value } = await reader.read(); pending += decoder.decode(value, { stream: !done });
        const lines = pending.split('\n'); pending = lines.pop() || '';
        for (const line of lines) {
          if (!line) continue; const event = JSON.parse(line);
          if (event.type === 'usage')setUsage({used:event.used,limit:event.limit});
          if (event.type === 'progress') { setProgress(event.message); setStep(event.step); }
          if (event.type === 'article-images') setArticleImages(event.images);
          if (event.type === 'source') setSources(current=>current.some(s=>s.id===event.source.id)?current:[...current,event.source]);
          if (event.type === 'sources') setSources(event.sources);
          if (event.type === 'delta') setStream(s => s + event.delta);
          if (event.type === 'document') { setDoc(event.document); setStream('');if(philosophyId==='schematic')await new Promise(resolve=>window.setTimeout(resolve,70)); }
          if (event.type === 'review-edit') {
            setDoc(current => current ? {
              ...current,
              blocks: event.edit ? current.blocks.map(block => block.id === event.edit.blockId ? { ...block, markdown: event.edit.after } : block) : current.blocks,
              reviewedBlockIds: [...current.reviewedBlockIds, event.blockId],
              edits: event.edit ? [...current.edits, event.edit] : current.edits,
            } : current);
            if(event.edit) await new Promise(resolve=>window.setTimeout(resolve,180));
            controller.signal.throwIfAborted();
          }
          if (event.type === 'error') throw new Error(event.message);
          if (event.type === 'complete') { completed = true; setArticle(event.article);articleURL(event.article.id); setDoc(current=>event.article.knowledge?null:current?{...current,status:'complete'}:null); setStream(''); setStep(4); await loadLibrary(); }
        }
        if (done) break;
      }
      if (!completed) throw new Error('The connection ended before editing was complete. The draft has not been added to your library.');
    } catch (e) {
      setDoc(current => current ? { ...current, status: 'interrupted' } : current);
      setError(controller.signal.aborted ? 'Research stopped. The unfinished document is shown below; it has not been saved as a completed article.' : (e as Error).message);
    } finally { setBusy(false); abort.current = null; void loadLibrary(); }
  }
  function articleURL(id?:string,mode?:'preview'|'approved') {const url=new URL(location.href);url.hash='';url.searchParams.delete('view');url.searchParams.delete('claimMode');if(id)url.searchParams.set('article',id);else url.searchParams.delete('article');if(mode==='approved')url.searchParams.set('claimMode',mode);history.replaceState(null,'',url);}
  function showArticle(a:Article) {setArticle(a);setKnowledgeOpen(false);setDoc(null);setStream('');setSources([]);setArticleImages([]);setTab('read');setMenuOpen(false);setError('');articleURL(a.id,a.knowledge?.mode);window.scrollTo(0,0);}
  function reset() { if (busy) return; articleURL();setKnowledgeOpen(false); void loadLibrary(); setActiveTopic(''); setArticle(null); setDoc(null); setStream(''); setSources([]); setArticleImages([]); setMenuOpen(false); setTab('read'); setError(''); }
  function openKnowledge() {if(busy)return;reset();const url=new URL(location.href);url.searchParams.set('view','knowledge');history.replaceState(null,'',url);setKnowledgeOpen(true);}
  async function openArticle(id: string,mode:'preview'|'approved'='preview') {
    if (busy) return;
    try { showArticle(id === 'example' ? example : await api(id.startsWith('knowledge-entity_')?'knowledge/articles/'+encodeURIComponent(id.slice('knowledge-'.length))+'?subject='+encodeURIComponent(site.defaultSubject)+'&mode='+mode:`articles/${encodeURIComponent(id)}`)); } catch (e) { setError((e as Error).message); }
  }
  function download() {
    if (!article) return;
    const text = `# ${article.title}\n\n${imageMarkdown(article.images)}\n\n${article.markdown}\n\n## References\n\n${article.sources.map(s => `${s.id}. [${s.title}](${s.url})`).join('\n')}\n\nAI-assisted article. Verify claims against the sources.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' })); const a = document.createElement('a'); a.href = url; a.download = `${slug(article.title)}.md`; a.click(); URL.revokeObjectURL(url);
  }
  const documentText = doc ? documentMarkdown(doc) : stream;
  const isWorking = !article && (busy || !!doc || !!stream || !!activeTopic);
  const title = article?.title || (knowledgeOpen?'Shared knowledge':undefined) || (isWorking ? (doc ? documentText.match(/^# (.+)/)?.[1] : '') || activeTopic : resolveSubject(site.defaultSubject).title);
  const currentText = article?.markdown || documentText;
  const headings = [...currentText.matchAll(/^## (.+)$/gm)].map(m => m[1]);
  const shownSources = article?.sources || sources;
  const edits = article?.review?.edits || doc?.edits || [];
  const sharedVersion=article&&!article.knowledge&&sharedArticles.find(a=>a.subjectId===article.subjectId&&a.philosophy?.id===article.philosophy?.id&&a.philosophy?.version===article.philosophy?.version&&topicIdentity(a.title)===topicIdentity(article.title));
  return <div className={`app ${wide ? 'wide' : ''} text-${textSize}`}>
    <a className="skip-link" href="#content">Jump to content</a>
    <header className="header">
      <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Main menu" aria-expanded={menuOpen}><Icon name="menu"/></button>
      <button className="brand" onClick={reset} aria-label="AutoWiki main page"><span className="brand-globe"><Icon name="globe" size={48}/></span><span><strong>{site.title}</strong><small>{resolveSubject(site.defaultSubject).title}</small></span></button>
      <form className="search" onSubmit={research}><Icon name="search"/><input ref={search} value={topic} onChange={e => setTopic(e.target.value)} placeholder="Search or research a topic" aria-label="Research topic" maxLength={500} disabled={busy}/><button disabled={busy || !topic.trim()}>Research</button></form>
      <div className="user-links"><button onClick={() => setAuthOpen(true)}>{session.sharing ? session.identity?.name || 'Your account' : 'Log in with ChatGPT'}</button></div>
    </header>
    <div className="layout">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <nav aria-label="Main navigation" className="main-navigation"><button onClick={reset} disabled={busy}>Main page</button><button onClick={openKnowledge} disabled={busy}>Shared knowledge</button><button onClick={() => { reset(); search.current?.focus(); }} disabled={busy}>New research</button><button onClick={() => void openArticle('example')} disabled={busy}>Example article</button><a href="/community">Community library</a></nav>
        <nav className="contents" aria-label="Contents"><div className="side-title">Contents</div><a href="#content" onClick={() => setTab('read')}>(Top)</a>{headings.map((h, i) => <a key={i} href={`#${slug(h)}`} onClick={() => setTab('read')}>{h}</a>)}{shownSources.length > 0 && <a href="#references" onClick={() => setTab('read')}>References</a>}</nav>
        <div className="library"><div className="side-title">Your library <span>{articles.length+sharedArticles.length}</span></div>{sharedArticles.length>0&&<><p className="small">Shared facts · quote previews</p>{sharedArticles.map(a=><button key={a.id} onClick={()=>void openArticle(a.id)} disabled={busy} className={article?.id===a.id?'selected':''}>{a.title}</button>)}</>}{articles.some(a=>a.quotePreviews)&&<p className="small">Saved research · quote previews</p>}{articles.filter(a=>a.quotePreviews).map(a=><button key={a.id} onClick={()=>void openArticle(a.id)} disabled={busy} className={article?.id===a.id?'selected':''}>{a.title}</button>)}{articles.some(a=>!a.quotePreviews)&&<p className="small">Earlier prose drafts · references only</p>}{articles.length ? articles.filter(a=>!a.quotePreviews).map(a => <button key={a.id} onClick={() => void openArticle(a.id)} disabled={busy} className={article?.id === a.id ? 'selected' : ''}>{a.title}</button>) : !sharedArticles.length&&<p>No saved articles yet.</p>}</div>
      </aside>
      <main id="content">
        <div className="title-row"><h1>{title}</h1><span className="language">English</span></div>
        <div className="page-tabs"><div><button className="selected" onClick={() => setTab('read')}>{article || isWorking ? 'Article' : 'Main Page'}</button>{shownSources.length > 0 && <button className={tab === 'sources' ? 'selected' : ''} onClick={() => setTab('sources')}>Sources</button>}</div><div><button className={tab === 'read' ? 'selected' : ''} onClick={() => setTab('read')}>Read</button>{(article || isWorking) && <button className={tab === 'history' ? 'selected' : ''} onClick={() => setTab('history')}>View history{edits.length ? ` (${edits.length})` : ''}</button>}{article && <button onClick={download}>Download</button>}{(article?.review||article?.knowledge)&&requiresFactoids(article?.philosophy)&&<button onClick={()=>setPublishOpen(true)}>Contribute</button>}{article?.review&&!article.knowledge&&!article.subjectId&&!requiresFactoids(article.philosophy)&&<button onClick={()=>setPublishOpen(true)}>Contribute</button>}</div></div>
        <div className="site-subtitle">From {site.title}, the open encyclopedia</div>
        {!busy && engine==='direct' && <details className="mobile-research"><summary>Research allowance · {requestLimit} requests</summary><label>Model requests <input aria-label="Mobile model request limit" type="number" min="1" max="100" value={requestLimit} onChange={e=>setRequestLimit(Number(e.target.value))}/></label><label>Minutes <input aria-label="Mobile runtime limit" type="number" min="1" max="60" value={minuteLimit} onChange={e=>setMinuteLimit(Number(e.target.value))}/></label><p>Each start or continuation grants this allowance. This is not a token or dollar cap.</p>{drafts.map(d=><p key={d.id}><button onClick={()=>void research(undefined,d.id)}>Continue {d.topic}</button></p>)}</details>}
        {error && <div className="error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}
        {!article&&!isWorking&&knowledgeOpen&&<KnowledgeExplorer subjectId={site.defaultSubject} model={model} budget={{requests:requestLimit,minutes:minuteLimit}} api={api} onArticle={a=>{showArticle(a);void loadLibrary();}}/>}
        {!article && !isWorking && !knowledgeOpen && <>
          <SubjectPortal subject={resolveSubject(site.defaultSubject)} articles={[...articles.filter(a=>a.quotePreviews),...sharedArticles,...articles.filter(a=>!a.quotePreviews)]} onOpen={id=>void openArticle(id)} onResearch={value=>{setTopic(value);setPhilosophyId(resolveSubject(site.defaultSubject).philosophyId);document.getElementById('research-form')?.scrollIntoView({behavior:'smooth'});}}/>
          <section id="research-form" className="research-box"><h2>Create an article</h2><p>Enter a topic to research. Watch the first draft take shape, then watch the editor check its sources and revise it.</p><PhilosophyPicker id="main-philosophy" value={philosophyId} setValue={setPhilosophyId} customRules={customRules} setCustomRules={setCustomRules}/><form onSubmit={research}><input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Enter a topic" maxLength={500} aria-label="Topic to research"/><button className="primary" disabled={!topic.trim()}>Research article</button></form><p className="small">{philosophyId==='schematic'?'Every factual line needs a typed factoid and an exact supporting quote. A separate audit checks its evidence and structure before saving.':'Each sentence needs a citation. A second editing pass runs before the article enters your library.'}</p></section>

        </>}
        {article?.knowledge&&<><div className="hatnote">Generated from shared claim revisions · {article.knowledge.mode==='approved'?'Locally approved claims':'AI-audited draft claims'}. <button className="inline-link" onClick={openKnowledge}>Inspect shared knowledge</button></div><p className="scope-note">Hover any sentence or citation to see its exact supporting quote highlighted in the source passage. Click to keep it open; Escape closes it.</p></>}
        {article?.migration&&<p className="scope-note">Every original sentence reviewed: {article.migration.preserved} preserved, {article.migration.corrected} corrected, {article.migration.omitted} removed. All {article.migration.factoids} displayed sentences have schematic claims and quote previews. <button className="inline-link" onClick={()=>setTab('history')}>Review the changes</button>.</p>}
        {article&&!article.knowledge&&<p className="scope-note">This prose draft has references but no sentence-level quote previews.{sharedVersion&&<> <button className="inline-link" onClick={()=>void openArticle(sharedVersion.id)}>Read {article.title} with quote previews</button>.</>}</p>}
        {article?.subjectId && <p className="hatnote">Part of {resolveSubject(article.subjectId).title} · {article.philosophy?.id===resolveSubject(article.subjectId).philosophyId?'Local draft, awaiting publication approval.':'Earlier research philosophy; this draft does not meet the current subject standard.'}</p>}
        {article?.id === 'example' && <div className="hatnote">This is a prewritten example article. <button className="inline-link" onClick={reset}>Research your own topic</button> to watch the drafting and editing process.</div>}
        {isWorking && <section className={`workflow ${doc?.status === 'interrupted' ? 'interrupted' : ''}`}>
          <div className="workflow-top"><div role="status" aria-live="polite">{busy && <span className="spinner"/>}<strong>{busy ? progress : 'Unfinished draft — not added to the library'}</strong></div>{busy && <button onClick={() => abort.current?.abort()}>Stop</button>}</div>
          <div className="live-milestones">{usage && <span>{usage.used}/{usage.limit} requests</span>}<span className={step===1?'active':''}>{shownSources.length} sources</span><span className={step===2?'active':''}>Draft{step>2?' written':''}</span><span className={step===3?'active':''}>{doc ? `${doc.reviewedBlockIds.length} / ${doc.blocks.length} passages checked` : 'Review'}</span></div>

        </section>}
        {tab === 'history' ? <section className="history"><h2>Revision history</h2>{article?.knowledge ? <><p>This article draws from shared claim revisions. Inspect their evidence and audit history in Shared knowledge.</p><button onClick={openKnowledge}>Inspect claim history</button><details><summary>Claim revision pins</summary><pre>{JSON.stringify(article.knowledge.dependencies,null,2)}</pre></details>{article.review&&<><p>{article.review.reviewedBlocks} original document blocks reviewed.</p><EditHistory edits={edits}/><details className="original-draft"><summary>View the original first draft</summary><div className="wiki-body"><WikiMarkdown text={article.review.originalMarkdown}/></div></details></>}</> : article?.id === 'example' ? <p>This prewritten example has no AI editing history.</p> : <><p>{busy ? 'The second-pass editor’s changes appear here as they are applied.' : article?.review ? `${article.review.reviewedBlocks} document blocks reviewed. ${edits.length} ${edits.length === 1 ? 'change' : 'changes'} applied.` : doc ? 'This review did not finish. Edits below are provisional.' : 'This article predates the two-pass editing workflow.'}</p><EditHistory edits={edits}/>{!edits.length && <p>No edits recorded{busy ? ' yet' : ''}.</p>}{(article?.review?.originalMarkdown || doc?.originalMarkdown) && <details className="original-draft"><summary>View the original first draft</summary><div className="wiki-body"><WikiMarkdown text={article?.review?.originalMarkdown || doc?.originalMarkdown || ''}/></div></details>}</>}</section> : tab === 'sources' ? <section><h2>Sources</h2><p>These source excerpts are the evidence supplied to the writer and the editor.</p><SourceList sources={shownSources} expanded/></section> : <>
          {article && !doc && <article className="wiki-body"><aside className="infobox"><div className="infobox-title">About this article</div><ArticleImages images={article.images}/><dl><dt>Topic</dt><dd>{article.title}</dd><dt>Sources</dt><dd>{article.sources.length} {article.sources.length === 1 ? 'source' : 'sources'}</dd><dt>Standards</dt><dd>{article.philosophy?.name || 'General reference'}</dd><dt>Method</dt><dd>{article.knowledge?'Shared claim projection':article.id === 'example' ? 'Prewritten example' : 'AI-assisted research'}</dd><dt>Review</dt><dd>{article.knowledge ? 'Claim audit completed' : article.review ? 'Second pass completed' : article.id === 'example' ? 'Example only' : 'Single-pass article'}</dd>{article.createdAt && <><dt>Updated</dt><dd>{new Date(article.createdAt).toLocaleDateString()}</dd></>}</dl></aside><>{article.knowledge?<FactoidArticle article={article} load={ref=>api('knowledge/revisions/'+encodeURIComponent(ref.revisionId)+'/evidence?subject='+encodeURIComponent(article.subjectId||site.defaultSubject)+'&policy='+encodeURIComponent(article.philosophy!.id)+'&mode='+article.knowledge!.mode+'&digest='+encodeURIComponent(ref.digest))} render={text=><WikiMarkdown text={text}/>}/>:article.content?article.content.map((block,i)=>block.type==='heading'?<h2 key={i} id={slug(block.text)}>{block.text}</h2>:<WikiMarkdown key={i} text={block.text}/>):<WikiMarkdown text={article.markdown}/>}</></article>}
          {(doc || (!article && isWorking)) && <article className={`wiki-body live-document ${busy && !doc ? 'streaming' : ''}`} aria-label="Research document"><ArticleImages images={article?.images??articleImages}/>
            {(doc?.blocks || stream.trim().split(/\n\s*\n/).filter(Boolean).map((markdown,i)=>({id:`block-${i+1}`,markdown}))).map(block => block.markdown.startsWith('# ') ? null : <LiveBlock key={block.id} block={block} edit={doc?.edits.filter(e=>e.blockId===block.id).at(-1)} />)}
            {busy && !documentText && <p className="page-awaiting">Finding the evidence for this article<span className="writing-caret" aria-hidden="true"/></p>}
          </article>}

          {shownSources.length > 0 && <section className="reference-section"><h2 id="references">References{busy && step===1 && <span className="references-live"> · finding evidence</span>}</h2><SourceList sources={shownSources}/></section>}
        </>}
        {(article || isWorking) && <div className="scope-note"><b>Research scope:</b> {article?.philosophy?.description || 'Reference-source excerpts'}. Citations are checked for coverage; AI review can still miss errors. Read the linked sources to verify claims.</div>}
        <footer><p>{article?.createdAt ? `This page was generated on ${new Date(article.createdAt).toLocaleString()}.` : 'Articles and edit histories are stored on this device.'}</p><p>AutoWiki is an independent project and is not affiliated with Wikipedia or the Wikimedia Foundation.</p></footer>
      </main>
      <aside className="appearance"><div className="side-title">Appearance</div><fieldset><legend>Text</legend>{['small', 'standard', 'large'].map(size => <label key={size}><input type="radio" name="text-size" checked={textSize === size} onChange={() => setTextSize(size)}/>{size[0].toUpperCase() + size.slice(1)}</label>)}</fieldset><fieldset><legend>Width</legend><label><input type="radio" name="width" checked={!wide} onChange={() => setWide(false)}/>Standard</label><label><input type="radio" name="width" checked={wide} onChange={() => setWide(true)}/>Wide</label></fieldset>
        <div className="side-title research-heading">Research</div>{engine==='direct'&&<details className="usage-settings"><summary>Usage allowance · {requestLimit} requests</summary><label>Model requests<input type="number" min="1" max="100" value={requestLimit} disabled={busy} onChange={e=>setRequestLimit(Number(e.target.value))}/></label><label>Minutes<input type="number" min="1" max="60" value={minuteLimit} disabled={busy} onChange={e=>setMinuteLimit(Number(e.target.value))}/></label><p>Each start or continuation grants this allowance. Token use varies by request; this is not a dollar cap.</p></details>}<label htmlFor="engine">Research engine</label><select id="engine" value={engine} disabled={busy} onChange={e=>setEngine(e.target.value)}><option value="direct">Standard research engine</option><option value="app-server" disabled={philosophyId==='schematic'}>Local Codex · comparison preview</option></select>{drafts.length>0&&<details><summary>Interrupted research ({drafts.length})</summary>{drafts.map(d=><p key={d.id}><button disabled={busy} onClick={()=>void research(undefined,d.id)}>Continue {d.topic}</button></p>)}</details>}<PhilosophyPicker id="sidebar-philosophy" value={philosophyId} setValue={setPhilosophyId} customRules={customRules} setCustomRules={setCustomRules} disabled={busy}/><a href="/community">Browse shared articles</a>{session.sharing ? <><label className="model-label" htmlFor="model">Model</label><select id="model" value={model} disabled={busy} onChange={e => setModel(e.target.value)}>{models.map(m => <option key={m.slug} value={m.slug}>{m.displayName}</option>)}</select><p className="small">Using ChatGPT plan</p><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage usage</a></> : <><p>Use your ChatGPT plan to research and edit articles.</p><button className="inline-link" onClick={() => setAuthOpen(true)}>Connect ChatGPT</button></>}
        {isWorking && doc && <div className="review-sidebar"><div className="side-title">Live edits</div>{doc.edits.length ? doc.edits.slice(-4).map((edit, i) => <p key={i}><Icon name="check" size={13}/>{edit.reason}</p>) : <p>The editor is checking the draft.</p>}</div>}
      </aside>
    </div>
    {publishOpen && article && <GitHubContribution api={api} article={article} onClose={() => setPublishOpen(false)}/>}
    {authOpen && <div className="modal-backdrop" onClick={() => setAuthOpen(false)}><section ref={modal} className="modal" role="dialog" aria-modal="true" aria-labelledby="connection-title" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close connection dialog"><Icon name="close"/></button><h2 id="connection-title">{session.sharing ? 'ChatGPT connection' : 'Log in with ChatGPT'}</h2><p>{session.sharing ? `${session.identity?.email || session.identity?.name || 'Your account'} · Using ChatGPT plan` : 'Connect your eligible ChatGPT plan to research and edit articles. No API key is needed.'}</p>{error && <div className="error" role="alert">{error}</div>}
      {session.sharing ? <><a className="primary" href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage usage</a><button className="disconnect" onClick={async () => { try { await api('auth/disconnect', 'POST'); await refreshSession(); setAuthOpen(false); } catch (e) { setError((e as Error).message); } }}>Disconnect account</button></> : session.status === 'connecting' ? <><p role="status"><span className="spinner"/>Waiting for ChatGPT sign-in…</p>{authUrl && <a className="primary" href={authUrl} target="_blank" rel="noreferrer">Open ChatGPT sign-in ↗</a>}<button className="disconnect" onClick={async () => { try { await api('auth/cancel', 'POST'); await refreshSession(); } catch (e) { setError((e as Error).message); } }}>Cancel sign-in</button></> : <button className="primary" onClick={() => void connect()}>Continue with ChatGPT</button>}
      <p className="small">Credentials are encrypted on this device. WikiChat does not receive your ChatGPT conversation history.</p></section></div>}
  </div>;
}
function PhilosophyPicker({id,value,setValue,customRules,setCustomRules,disabled=false}:{id:string;value:string;setValue:(s:string)=>void;customRules:string;setCustomRules:(s:string)=>void;disabled?:boolean}) {
 const preset=PHILOSOPHIES.find(p=>p.id===value);
 return <div className="philosophy-selector"><label htmlFor={id}>Research philosophy</label><select id={id} value={value} disabled={disabled||!!site.subjectId} onChange={e=>setValue(e.target.value)}>{PHILOSOPHIES.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}<option value="custom">Custom standards</option></select><p>{preset?.description || 'Define your standards. Reference sources are used; unmet rules must be disclosed.'}</p>{value==='custom'&&<textarea aria-label="Custom research rules" placeholder="Describe your research standards…" value={customRules} onChange={e=>setCustomRules(e.target.value)} minLength={20} maxLength={2000} disabled={disabled}/>}</div>;
}
createRoot(document.getElementById('root')!).render(import.meta.env.MODE==='pages' || import.meta.env.VITE_PAGES_ONLY==='true' || location.pathname.startsWith('/community') ? <PagesReader/> : <App/>);
