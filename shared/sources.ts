import type { Source } from '../server/research.js';
import type { Philosophy } from './philosophies.js';
const headers = { 'User-Agent':'WikiChat/1.0 (local research and source verification)' };
function plain(html: string) { return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim(); }
async function json(url: URL, signal: AbortSignal, fetcher: typeof fetch) {
  const response=await fetcher(url,{signal,headers,redirect:'manual'});
  if(!response.ok) throw new Error(`Source provider unavailable (${response.status}).`);
  return response.json();
}
async function wiki(topic: string, signal: AbortSignal, fetcher: typeof fetch): Promise<Source[]> {
  const url=new URL('https://en.wikipedia.org/w/api.php');
  url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:topic,gsrlimit:'6',gsrnamespace:'0',prop:'extracts|info',exintro:'1',explaintext:'1',inprop:'url',format:'json',formatversion:'2'}).toString();
  const data=await json(url,signal,fetcher);
  return (data.query?.pages||[]).filter((p:any)=>p.extract&&p.fullurl?.startsWith('https://en.wikipedia.org/wiki/')).sort((a:any,b:any)=>a.index-b.index).map((p:any,i:number)=>({id:i+1,title:p.title,url:p.fullurl,extract:p.extract.slice(0,14000),provider:'Wikipedia',kind:'reference',retrievedAt:new Date().toISOString()}));
}
function paperSources(data:any,originalOnly=false):Source[]{
  return (data.resultList?.result||[]).filter((p:any)=>{
    const types: string[]=p.pubTypeList?.pubType||[];
    return p.source==='MED'&&/^\d+$/.test(p.id)&&p.abstractText&&types.includes('Journal Article')&&!types.some(t=>/preprint|editorial|comment|letter|retract/i.test(t))&&(!originalOnly||(types.includes('research-article')&&!types.some(t=>/review|meta-analysis/i.test(t))));
  }).map((p:any,i:number)=>({id:i+1,title:plain(p.title),url:`https://europepmc.org/article/MED/${p.id}`,extract:plain(p.abstractText).slice(0,14000),provider:'Europe PMC',kind:(p.pubTypeList?.pubType||[]).some((t:string)=>/review|meta-analysis/i.test(t))?'review':'research',publisher:p.journalInfo?.journal?.title,retrievedAt:new Date().toISOString()}));
}
async function papers(topic:string,originalOnly:boolean,signal:AbortSignal,fetcher:typeof fetch){
  const url=new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  const terms=topic.replace(/[^\p{L}\p{N}\s-]/gu,' ').trim();
  url.search=new URLSearchParams({query:`(${terms}) AND HAS_ABSTRACT:y AND SRC:MED`,pageSize:'20',resultType:'core',format:'json'}).toString();
  return paperSources(await json(url,signal,fetcher),originalOnly).slice(0,6);
}
async function originalDocument(title:string,signal:AbortSignal,fetcher:typeof fetch):Promise<Source>{
  const url=new URL('https://en.wikisource.org/w/api.php');url.search=new URLSearchParams({action:'parse',page:title,prop:'text',format:'json',formatversion:'2'}).toString();
  const data=await json(url,signal,fetcher);
  const extract=plain(data.parse?.text||'');
  if(extract.length<150)throw new Error('Original document text was unavailable.');
  return {id:1,title:data.parse.title,url:`https://en.wikisource.org/wiki/${encodeURIComponent(data.parse.title.replace(/ /g,'_'))}`,extract:extract.slice(0,14000),provider:'Wikisource',kind:'archived-document',retrievedAt:new Date().toISOString()};
}
async function originals(topic:string,signal:AbortSignal,fetcher:typeof fetch){
  const url=new URL('https://en.wikisource.org/w/api.php');url.search=new URLSearchParams({action:'query',list:'search',srsearch:topic,srnamespace:'0',srlimit:'8',format:'json'}).toString();
  const data=await json(url,signal,fetcher);
  const titles=(data.query?.search||[]).map((r:any)=>r.title as string).filter((t:string)=>!/encyclop|dictionary|bibliograph|biograph|author:/i.test(t)).slice(0,4);
  const results=await Promise.allSettled(titles.map((title:string)=>originalDocument(title,signal,fetcher)));
  return results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
}
export async function collectSources(topic:string,policy:Philosophy,signal:AbortSignal,fetcher:typeof fetch=fetch,onSource?:(source:Source)=>void):Promise<Source[]>{
  if(policy.version>=2&&policy.sourceMode!=='science')throw Error('Independent web discovery must use the hosted search and guarded page retrieval pipeline.');
  let sources:Source[];
  const found:Source[]=[];
  const report=(batch:Source[])=>{for(const source of batch){if(found.length>=6)break;const next={...source,id:found.length+1};found.push(next);onSource?.(next);}};
  if(policy.sourceMode==='science'){sources=await papers(topic,false,signal,fetcher);report(sources);}
  else if(policy.sourceMode==='primary'){
    await Promise.allSettled([originals(topic,signal,fetcher).then(batch=>{report(batch);return batch;}),papers(topic,true,signal,fetcher).then(batch=>{report(batch);return batch;})]);
    sources=found;
  }else {sources=await wiki(topic,signal,fetcher);report(sources);}
  signal.throwIfAborted();
  if(!sources.length)throw new Error(`No usable sources found for ${policy.name}. Try a more specific topic or a different philosophy. The source rules were not relaxed.`);
  return sources.map((s,i)=>({...s,id:i+1}));
}
/** Re-fetch evidence from known providers. Never fetch an uploader-selected host or trust uploaded excerpts. */
export async function refetchSource(source:Pick<Source,'id'|'url'>,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<Source>{
  const url=new URL(source.url);
  if(url.protocol!=='https:'||url.username||url.password||url.port)throw new Error('Unsupported source address.');
  let result:Source;
  if(url.hostname==='en.wikipedia.org'&&url.pathname.startsWith('/wiki/')){
    const title=decodeURIComponent(url.pathname.slice(6)).replace(/_/g,' ');
    const api=new URL('https://en.wikipedia.org/w/api.php');api.search=new URLSearchParams({action:'query',titles:title,prop:'extracts|info',exintro:'1',explaintext:'1',inprop:'url',format:'json',formatversion:'2'}).toString();
    const data=await json(api,signal,fetcher);const p=data.query?.pages?.[0];
    if(!p?.extract||!p.fullurl?.startsWith('https://en.wikipedia.org/wiki/'))throw new Error('The Wikipedia source could not be verified.');
    result={id:source.id,title:p.title,url:p.fullurl,extract:p.extract.slice(0,14000),provider:'Wikipedia',kind:'reference'};
  }else if(url.hostname==='europepmc.org'&&/^\/article\/MED\/\d+$/.test(url.pathname)){
    const id=url.pathname.split('/').at(-1);const api=new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
    api.search=new URLSearchParams({query:`EXT_ID:${id} AND SRC:MED`,resultType:'core',format:'json'}).toString();
    const data=await json(api,signal,fetcher);const p=paperSources(data)[0];if(!p)throw new Error('The scientific source could not be verified.');result=p;
  }else if(url.hostname==='en.wikisource.org'&&url.pathname.startsWith('/wiki/')) result=await originalDocument(decodeURIComponent(url.pathname.slice(6)).replace(/_/g,' '),signal,fetcher);
  else throw new Error('This source provider is not supported for publishing.');
  return {...result,id:source.id,retrievedAt:new Date().toISOString()};
}
export function sourcePolicyProblems(sources:Source[],policy:Philosophy):string[]{
 if(policy.version>=2){
  if(sources.some(s=>/(^|\.)(wikipedia\.org|wikimedia\.org|wikidata\.org)$/.test(new URL(s.url).hostname)))return ['Independent research cannot cite Wikipedia.'];
  if(policy.sourceMode==='science'&&sources.some(s=>s.provider!=='Europe PMC'))return ['Scientific literature requires journal sources.'];
  // Relevance, primary status and ownership require evidence-based model review
  // during collection and explicit human review before publication.
  return [];
 }

  if(policy.sourceMode==='science'&&sources.some(s=>s.provider!=='Europe PMC'))return ['Scientific literature requires journal sources.'];
  if(policy.sourceMode==='primary'&&sources.some(s=>s.kind!=='research'&&s.kind!=='archived-document'))return ['Primary sources cannot include reference works or literature reviews.'];
  if(policy.sourceMode==='independent'&&sources.some(s=>s.provider!=='Wikipedia'&&s.provider!=='Wikisource'))return ['This independent-source collection excludes corporate publications.'];
  return [];
}
