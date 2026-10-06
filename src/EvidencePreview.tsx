import {narrativeBlocks,citedSentence} from '../shared/narrative';
import {factoidBlocks} from '../shared/article-blocks';
import React,{createContext,useContext,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Article} from '../server/research';
import type {EvidencePreview,FactoidReference} from '../shared/evidence-preview';

type Target={reference:FactoidReference;anchor:HTMLElement;pinned:boolean};
type Controls={target:Target|null;cardId:string;show:(ref:FactoidReference,anchor:HTMLElement,immediate?:boolean,pinned?:boolean)=>void;leave:()=>void};
const Context=createContext<Controls|null>(null);

export function EvidencePreviewProvider({load,scopeKey,children}:{load:(ref:FactoidReference)=>Promise<EvidencePreview>;scopeKey:string;children:React.ReactNode}){
 const [target,setTarget]=useState<Target|null>(null),[preview,setPreview]=useState<EvidencePreview|null>(null),[error,setError]=useState('');
 const [position,setPosition]=useState({left:16,top:16});
 const current=useRef<Target|null>(null),loader=useRef(load),card=useRef<HTMLDivElement|null>(null),opening=useRef<ReturnType<typeof setTimeout>|null>(null),closing=useRef<ReturnType<typeof setTimeout>|null>(null),ignoreFocus=useRef(false),cache=useRef(new Map<string,EvidencePreview>());
 const cardId=useId();loader.current=load;
 function clearTimers(){if(opening.current)clearTimeout(opening.current);if(closing.current)clearTimeout(closing.current);opening.current=closing.current=null;}
 function dismiss(restoreFocus=false){clearTimers();const old=current.current;current.current=null;setTarget(null);if(restoreFocus&&old?.anchor.isConnected){ignoreFocus.current=true;old.anchor.focus({preventScroll:true});queueMicrotask(()=>{ignoreFocus.current=false;});}}
 function show(reference:FactoidReference,anchor:HTMLElement,immediate=false,pinned=false){
  if(ignoreFocus.current||current.current?.pinned&&!pinned)return;
  clearTimers();const apply=()=>{const next={reference,anchor,pinned};current.current=next;setTarget(next);};
  if(immediate)apply();else opening.current=setTimeout(apply,180);
 }
 function leave(){clearTimers();if(!current.current?.pinned)closing.current=setTimeout(()=>dismiss(),180);}
 useEffect(()=>{dismiss();cache.current.clear();},[scopeKey]);
 useEffect(()=>()=>clearTimers(),[]);
 const reference=target?.reference;
 useEffect(()=>{
  let cancelled=false;setPreview(null);setError('');if(!reference)return;
  const key=reference.revisionId+':'+reference.digest+':'+reference.statement;
  const resolve=async()=>{
   try{const result=cache.current.get(key)||await loader.current(reference);
    if(result.revisionId!==reference.revisionId||result.digest!==reference.digest||result.statement!==reference.statement)throw Error('The evidence does not match this exact statement.');
    if(cancelled)return;if(cache.current.size>=100)cache.current.delete(cache.current.keys().next().value!);cache.current.set(key,result);setPreview(result);
   }catch(e){if(!cancelled)setError((e as Error).message);}
  };void resolve();return()=>{cancelled=true;};
 },[reference?.revisionId,reference?.digest,reference?.statement,scopeKey]);
 useLayoutEffect(()=>{
  if(!target)return;
  function place(){const rect=target!.anchor.getBoundingClientRect(),width=card.current?.offsetWidth||420,height=card.current?.offsetHeight||100;
   const left=Math.max(16,Math.min(rect.left,innerWidth-width-16));
   const below=rect.bottom+8,top=below+height<=innerHeight-16?below:Math.max(16,rect.top-height-8);
   setPosition({left,top});
  }
  place();const observer=new ResizeObserver(place);if(card.current)observer.observe(card.current);
  addEventListener('resize',place);addEventListener('scroll',place,true);
  return()=>{observer.disconnect();removeEventListener('resize',place);removeEventListener('scroll',place,true);};
 },[target,preview,error]);
 useEffect(()=>{
  if(!target)return;
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();dismiss(!!card.current?.contains(document.activeElement));}};
  const outside=(e:PointerEvent)=>{if(!target.anchor.contains(e.target as Node)&&!card.current?.contains(e.target as Node))dismiss();};
  document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};
 },[target]);
 return <Context.Provider value={{target,cardId,show,leave}}>{children}{target&&createPortal(
  <div ref={card} id={cardId} className="factoid-preview" role="region" aria-label="Factoid evidence" style={position} onPointerEnter={clearTimers} onPointerLeave={leave} onFocusCapture={clearTimers} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)&&!target.anchor.contains(e.relatedTarget as Node))leave();}}>
   <div className="factoid-preview-toolbar"><strong>Source evidence</strong><div>{target.pinned?<span>Pinned</span>:<button onClick={()=>show(target.reference,target.anchor,true,true)}>Keep open</button>}<button onClick={()=>dismiss(true)} aria-label="Close evidence preview">Close</button></div></div>
   {!preview&&!error&&<p role="status">Loading captured passage…</p>}
   {error&&<p role="alert">{error}</p>}
   {preview&&<><p className="factoid-preview-status">{preview.approved?'Human approval recorded':'AI-audited draft · human approval pending'}</p>{preview.passages.map((p,i)=><section key={p.captureId+'-'+i}>
    <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a><p className="factoid-preview-meta">{new URL(p.url).hostname} · Captured {new Date(p.retrievedAt).toLocaleDateString()} · {p.stance}</p>
    <blockquote>{p.beforeClipped&&'… '}{p.before}<mark>{p.quote}</mark>{p.after}{p.afterClipped&&' …'}</blockquote>
    {!p.contextAvailable&&<p className="factoid-preview-meta">Exact captured quote. Open the original source for more context.</p>}
   </section>)}{preview.structures&&<details><summary>Supporting schematic facts ({preview.structures.length})</summary>{preview.structures.map((f,i)=><p key={i}>{f.statement} <small>({f.structure.predicate.replaceAll('_',' ')} · {f.structure.modality}{f.structure.attribution?' · '+f.structure.attribution:''})</small></p>)}</details>}{preview.structure&&!preview.structures&&<details><summary>Claim structure</summary><p>{preview.structure.predicate.replaceAll('_',' ')} · {preview.structure.modality}{preview.structure.attribution?' · '+preview.structure.attribution:''}</p><dl>{preview.structure.arguments.map((a,i)=><React.Fragment key={i}><dt>{a.role}</dt><dd>{a.value} <small>({a.type})</small></dd></React.Fragment>)}</dl></details>}<p className="factoid-preview-hint">Highlighted text is the exact cited passage. Escape closes this preview.</p></>}
  </div>,document.body)}</Context.Provider>;
}

/** Only the hovered or pinned instance is highlighted; related articles are unaffected. */
export function Factoid({reference,children,inline=false}:{reference:FactoidReference;children:React.ReactNode;inline?:boolean}){
 const context=useContext(Context),anchor=useRef<HTMLDivElement&HTMLSpanElement>(null);
 if(!context)return <>{children}</>;
 const active=context.target?.anchor===anchor.current;
 const Tag=inline?'span':'div';
 return <Tag ref={anchor} className={'factoid-trigger'+(active?' factoid-active':'')} data-revision-id={reference.revisionId} tabIndex={0} role="group" aria-label="Claim and cited evidence" aria-describedby={active?context.cardId:undefined}
  onPointerEnter={e=>{if(e.pointerType!=='touch')context.show(reference,e.currentTarget);}}
  onPointerLeave={context.leave} onFocusCapture={e=>context.show(reference,e.currentTarget,true)}
  onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)&&!(e.relatedTarget as Element)?.closest?.('.factoid-preview'))context.leave();}}
  onClick={e=>{const link=(e.target as Element).closest('a');if(link){if(!link.getAttribute('href')?.startsWith('#source-'))return;e.preventDefault();}context.show(reference,e.currentTarget,true,true);}}
  onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();context.show(reference,e.currentTarget,true,true);}}}>
  {children}
 </Tag>;
}

export function FactoidArticle({article,load,render,renderInline}:{article:Article;renderInline?:(text:string)=>React.ReactNode;load:(reference:FactoidReference)=>Promise<EvidencePreview>;render:(text:string)=>React.ReactNode}){
 const pins=article.knowledge?.dependencies;
 if(!pins)return <>{render(article.markdown)}</>;
 const narrative=article.knowledge?.narrative;
 if(narrative){
  const sentenceLoad=async(reference:FactoidReference):Promise<EvidencePreview>=>{
   const sentence=narrative.sentences.find(s=>s.id===reference.revisionId);if(!sentence||reference.digest!==narrative.digest||reference.statement!==sentence.text)throw Error('Invalid narrative evidence binding.');
   const previews=await Promise.all(sentence.revisionIds.map(async id=>{const pin=pins.find(p=>p.revisionId===id);if(!pin)throw Error('Missing narrative claim pin.');const ref={revisionId:id,digest:pin.digest,statement:narrative.factStatements[id]};const p=await load(ref);if(p.revisionId!==id||p.digest!==ref.digest||p.statement!==ref.statement)throw Error('Narrative evidence no longer matches its exact fact.');return p;}));
   return {...previews[0],...reference,approved:article.knowledge!.mode==='approved'&&previews.every(p=>p.approved),passages:[...new Map(previews.flatMap(p=>p.passages).map(p=>[p.captureId+':'+p.quote,p])).values()],structures:previews.map(p=>({statement:p.statement,structure:p.structure}))};
  };
  return <EvidencePreviewProvider load={sentenceLoad} scopeKey={article.id+':'+narrative.digest}>{narrativeBlocks(narrative).map((block,i)=>block.type==='heading'?<React.Fragment key={'heading-'+i}>{render('## '+block.text)}</React.Fragment>:renderInline?<p key={'paragraph-'+i}>{block.sentences.map((s,j)=><React.Fragment key={s.id}>{j>0&&' '}<Factoid reference={{revisionId:s.id,digest:narrative.digest,statement:s.text}} inline>{renderInline(citedSentence(s))}</Factoid></React.Fragment>)}</p>:<div key={'paragraph-'+i}>{block.sentences.map(s=><Factoid key={s.id} reference={{revisionId:s.id,digest:narrative.digest,statement:s.text}}>{render(citedSentence(s))}</Factoid>)}</div>)}</EvidencePreviewProvider>;
 }
 let blocks:ReturnType<typeof factoidBlocks>;try{blocks=factoidBlocks(article.markdown);if(pins.length!==blocks.filter(b=>b.claimIndex!==null).length)throw Error('Missing claim bindings.');}catch{return <p role="alert">This article has invalid factoid bindings and cannot be displayed.</p>;}
 const content:React.ReactNode[]=[];
 // Preserve each claim binding while laying out related sentences as paragraphs.
 let paragraph:React.ReactNode[]=[];let length=0;
 const flush=()=>{if(paragraph.length){content.push(<p className="factoid-paragraph" key={'paragraph-'+content.length}>{paragraph}</p>);paragraph=[];length=0;}};
 for(const {text,claimIndex} of blocks){
  if(claimIndex===null){flush();content.push(<React.Fragment key={'heading-'+content.length}>{render(text)}</React.Fragment>);continue;}
  const reference={revisionId:pins[claimIndex].revisionId,digest:pins[claimIndex].digest,statement:text.replace(/ \[\d+\]\(#source-\d+\)/g,'')};
  if(renderInline){
   if(paragraph.length)paragraph.push(' ');
   paragraph.push(<Factoid key={reference.revisionId} reference={reference} inline>{renderInline(text)}</Factoid>);length+=text.length;
   if(length>=420)flush();
  }else content.push(<Factoid key={reference.revisionId} reference={reference}>{render(text)}</Factoid>);
 }
 flush();
 return <EvidencePreviewProvider load={load} scopeKey={article.id+':'+article.knowledge!.mode+':'+JSON.stringify(pins)}>{content}</EvidencePreviewProvider>;
}
