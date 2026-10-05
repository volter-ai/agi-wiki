import {request} from 'node:https';
import {lookup} from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import {parseHTML} from 'linkedom';
import type {Source} from './research.js';
export function publicAddress(address:string){try{return ipaddr.process(address).range()==='unicast';}catch{return false;}}
export function evidenceURL(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname.endsWith('.')||!url.hostname.includes('.')||url.hostname==='localhost'||/\.(localhost|local|internal|test|invalid)$/.test(url.hostname))throw Error('Only public HTTPS evidence pages are allowed.');
 if(/(^|\.)(wikipedia\.org|wikimedia\.org|wikidata\.org)$/.test(url.hostname))throw Error('Wikipedia is not an evidence source in independent research.');
 url.hash='';return url;
}
/** Resolve and pin a public address on every hop; never send app credentials. */
export async function fetchEvidence(value:string,signal:AbortSignal):Promise<Source>{
 let url=evidenceURL(value);
 for(let hop=0;hop<4;hop++){
  signal.throwIfAborted();
  const addresses=await lookup(url.hostname,{all:true});
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Source resolved to a non-public address.');
  const target=addresses[0];
  const result=await new Promise<{status:number;location?:string;body:string;type:string}>((resolve,reject)=>{
   const req=request(url,{signal,agent:false,headers:{'User-Agent':'AutoWiki/1.0 (source verification)','Accept':'text/html,text/plain','Accept-Encoding':'identity'},lookup:((_host:any,options:any,cb:any)=>options.all?cb(null,[target]):cb(null,target.address,target.family)) as any},res=>{
    const status=res.statusCode??0;
    if(status>=300&&status<400){res.destroy();resolve({status,location:res.headers.location,body:'',type:''});return;}
    const type=String(res.headers['content-type']??'');
    if(status!==200||!/^text\/(html|plain)\b/i.test(type)){res.destroy();reject(Error('Source is unavailable or is not an HTML/text document.'));return;}
    let size=0;const chunks:Buffer[]=[];
    res.on('data',chunk=>{size+=chunk.length;if(size>2000000){res.destroy(Error('Source page exceeds 2 MB.'));return;}chunks.push(chunk);});
    res.on('error',reject);res.on('end',()=>resolve({status,type,body:Buffer.concat(chunks).toString('utf8')}));
   });req.on('error',reject);req.end();
  });
  if(result.location){url=evidenceURL(new URL(result.location,url).href);continue;}
  return extractEvidence(url.href,result.body,result.type);
 }
 throw Error('Source redirected too many times.');
}
export function extractEvidence(url:string,html:string,type='text/html'):Source{
 let title=new URL(url).hostname,text=html;
 if(type.startsWith('text/html')){
  const {document}=parseHTML(html);title=document.querySelector('title')?.textContent?.trim()||title;
  document.querySelectorAll('script,style,nav,footer,header,aside,form,iframe,noscript,svg').forEach(n=>n.remove());
  const root=document.querySelector('article')||document.querySelector('main')||document.body;
  text=root.textContent||'';
 }
 text=text.replace(/\s+/g,' ').trim();
 if(text.length<150)throw Error('Source has too little readable evidence.');
 return {id:0,title:title.slice(0,300),url,extract:text.slice(0,14000),provider:new URL(url).hostname,kind:'web-page',retrievedAt:new Date().toISOString()};
}
