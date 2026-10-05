/** Explicit, bounded local comparison. Never changes defaults or publishes. */
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chatgpt} from '../server/auth.js';
import {AppServerClient,initialEngineState,validateStructuredArticle} from '../server/app-server.js';
import {writeAndReview} from '../server/review.js';
import {resolvePhilosophy} from '../shared/philosophies.js';
import {collectSources} from '../shared/sources.js';
import {citationIssues} from '../server/research.js';
const topic=process.argv[2]||'Observatory';const philosophy=resolvePhilosophy(process.argv[3]||'general',undefined,1);
const signal=AbortSignal.timeout(480000);const models=await chatgpt.listModels({signal});
const model=process.argv[4]||models[0]?.slug;if(!models.some(m=>m.slug===model))throw Error('Choose an available model.');
const sources=await collectSources(topic,philosophy,signal);const id=randomUUID();const folder='.data/comparisons/'+id;await mkdir(folder,{recursive:true,mode:0o700});
const report:any={id,topic,philosophy,model,sources,createdAt:new Date().toISOString(),runs:[],defaultChanged:false};
console.log(JSON.stringify({comparison:id,model,topic,sources:sources.length}));
for(const engine of ['direct','app-server']){
 const state=initialEngineState();const started=Date.now();const events:any[]=[];
 const save=async()=>writeFile(folder+'/'+engine+'-state.json',JSON.stringify(state),{mode:0o600});
 const run=async(client:any)=>writeAndReview({id:randomUUID(),topic,philosophy,sources,model,signal,client,emit:e=>{if(e.type==='review-edit')events.push(e);},saveDraft:async d=>{await writeFile(folder+'/'+engine+'-draft.json',JSON.stringify(d),{mode:0o600});}});
 try{
  const article=engine==='app-server'?await chatgpt.withAccessToken(async(token,authSignal)=>{const child=new AppServerClient(token,state,authSignal,save,randomUUID());try{await child.start();return await run(child);}catch(error){return {engineError:(error as Error).message};}finally{await child.close();}},signal):await run({streamResponse:async(o:any)=>{state.turns++;return chatgpt.streamResponse({...o,onUsage:(u:any)=>state.usage.push(u)});}});
  if('engineError' in article)throw Error(article.engineError);
  if(engine==='app-server')validateStructuredArticle('# '+article.title+'\n\n'+article.markdown);
  report.runs.push({engine,status:'complete',elapsedMs:Date.now()-started,usage:state.usage,turns:state.turns,toolCalls:state.toolCalls,citationIssues:citationIssues(article.markdown,sources),article,edits:events.length,citationAccuracy:'requires claim-by-claim evidence review'});
 }catch(e){report.runs.push({engine,status:'failed',elapsedMs:Date.now()-started,usage:state.usage,turns:state.turns,error:(e as Error).message});}
 await writeFile(folder+'/report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({engine,...report.runs.at(-1),article:undefined,usage:state.usage}));
}
console.log('Saved '+folder+'/report.json');
