import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ArticleImages from '../src/ArticleImages.js';
import {validateKnowledgeBundle} from '../server/knowledge-bundle.js';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {KnowledgeStore} from '../server/knowledge-store.js';
import {loadDemoKnowledge} from '../server/demo-knowledge.js';
import {assertFactoidCoverage} from '../server/knowledge-articles.js';
import {evidencePreview} from '../shared/evidence-preview.js';
import {RequestBudget,researchBudget} from '../server/budget.js';
import {reserve,type Receipt,type Store} from '../github/ledger.js';
import {approvedKnowledge} from '../github/knowledge-publication.js';
import {digest} from '../github/articles.js';
import {startApp} from '../server/index.js';
import type {ChatGPTClient} from '../vendor/siwc/src/types.js';

const receipt=(n:number):Receipt=>({pr:n,head:String(n).padStart(40,'a'),userId:42,login:'author',path:'knowledge/changes/demo.json',digest:'a'.repeat(64),day:'2026-10-05'});
const demoRoot=existsSync('demo/articles')?'demo':'test/fixtures/demo';

test('demo articles have typed factoids and exact quoted evidence; changed prose is rejected',async()=>{
 const store=new KnowledgeStore(':memory:');
 try{
  await loadDemoKnowledge(store,demoRoot);
  const snapshot=store.snapshot();
  for(const name of await readdir(demoRoot+'/articles')){
   const article=JSON.parse(await readFile(demoRoot+'/articles/'+name,'utf8'));
   assertFactoidCoverage(article,snapshot);
   const pin=article.knowledge.dependencies[0];
   assert.ok(evidencePreview(snapshot,pin.revisionId,pin.digest).passages[0].contextAvailable);
   assert.throws(()=>assertFactoidCoverage({...article,markdown:article.markdown+'\n\nAn unsupported claim.'},snapshot));
  }
 }finally{store.close();}
});

test('research cannot exceed the selected request allowance',()=>{
 const budget=new RequestBudget(2);
 budget.reserve();budget.reserve();
 assert.throws(()=>budget.reserve(),/allowance reached/);
 assert.equal(budget.used,2);
 assert.throws(()=>researchBudget({requests:101}));
});

test('only one concurrent submission can take the last daily slot',async()=>{
 let version=0,receipts=Array.from({length:99},(_,i)=>receipt(i));
 const store:Store={
  async read(){return {version:String(version),receipts:structuredClone(receipts)};},
  async write(expected,next){if(expected!==String(version))return false;receipts=structuredClone(next);version++;return true;},
 };
 const results=await Promise.allSettled([reserve(store,receipt(100)),reserve(store,receipt(101))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(receipts.length,100);
});

test('publication requires human approval of the exact file bytes',async()=>{
 const [name]=await readdir(demoRoot+'/knowledge');
 const bytes=await readFile(demoRoot+'/knowledge/'+name,'utf8');
 const path='knowledge/changes/demo.json';
 const approval={...receipt(1),digest:digest(bytes),approvedBy:9,approvedAt:'2026-10-05T12:00:00Z'};
 assert.throws(()=>approvedKnowledge(path,bytes,[]));
 assert.equal(approvedKnowledge(path,bytes,[approval],'ai').bundle.subjectId,'ai');
 assert.throws(()=>approvedKnowledge(path,bytes+' ',[approval],'ai'));
});

test('app starts, streams research, audit edits and an article illustration, then saves the article',async()=>{
 const topic='Smoke model',url='https://research.example.org/smoke-model';
 const definition='Smoke model is an experimental language model developed for controlled research demonstrations.';
 const weights='Smoke model has open weights.';
 const evidence=definition+' '+weights;
 const unsupported='Smoke model is optimized for interstellar navigation.';
 const assertion=(localId:string,statement:string,property:string,value:string,valueType='text')=>({localId,statement,predicate:'has_property',arguments:[{role:'subject',entityId:'model'},{role:'property',value:property,valueType:'text'},{role:'value',value,valueType}],modality:'asserted',evidence:[{quote:definition,stance:'supports'}]});
 let calls=0,imageRequests=0;
 const imageInfo={mime:'image/png',thumburl:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Smoke_model.png',descriptionurl:'https://commons.wikimedia.org/wiki/File:Smoke_model.png',extmetadata:{Artist:{value:'Fixture author'},LicenseShortName:{value:'CC BY 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'}}};
 const unexpected=()=>{throw Error('Unexpected authentication or external access.');};
 const client:ChatGPTClient={
  getSession:async()=>({status:'connected',sharing:true,profileId:'smoke-user'}),
  listModels:async()=>[{slug:'fake-model',displayName:'Fake model'}],
  signIn:unexpected,cancelSignIn:unexpected,listProfiles:unexpected,selectProfile:unexpected,subscribe:unexpected,disconnect:unexpected,withAccessToken:unexpected,
  async streamResponse(o){
   switch(++calls){
    case 1:o.onSearchSources?.([url]);return {text:'Found the author documentation.'};
    case 2:return {text:JSON.stringify({selected:[{id:1,reason:'Author documentation.',evidenceType:'primary'}]})};
    case 3:return {text:JSON.stringify({sourceClassification:{evidenceType:'primary',reason:'Author documentation describing its own model.'},entities:[{localId:'model',label:topic,type:'model'}],facts:[assertion('definition',definition,'definition','experimental language model developed for controlled research demonstrations'),{...assertion('weights',weights,'open_weights','true','boolean'),evidence:[{quote:weights,stance:'supports'}]},assertion('unsupported',unsupported,'capability','optimized for interstellar navigation')]})};
    case 4:return {text:JSON.stringify({assessments:JSON.parse(String(o.input)).facts.map((f:any)=>({revisionId:f.id,outcome:f.statement===unsupported?'unsupported':'supported',reason:f.statement===unsupported?'The source does not support this claim.':'Supported by the captured author documentation.'}))})};
    case 5:return {text:JSON.stringify({sourceQueries:[],imageQuery:'Smoke model diagram'})};
    case 6:return {text:JSON.stringify({selectedIndex:0,reason:'A diagram of the Smoke model.'})};
    case 7:{const input=JSON.parse(String(o.input));const text=JSON.stringify({sentences:input.facts.map((f:any,i:number)=>({id:'s'+(i+1),text:f.statement,revisionIds:[f.id],section:'',paragraph:0}))});for(let i=0;i<text.length;i+=35)o.onDelta?.(text.slice(i,i+35));return {text};}
    case 8:return {text:JSON.stringify({sentences:JSON.parse(String(o.input)).draft})};
    case 9:return {text:JSON.stringify({decisions:JSON.parse(String(o.input)).sentences.map((s:any)=>({sentenceId:s.id,outcome:'supported',reason:'Each assertion is supported by the exact model documentation quote.'}))})};
    default:throw Error('Unexpected model request.');
   }
  },
 };
 const dataRoot=await mkdtemp(join(tmpdir(),'autowiki-smoke-'));
 let app:Awaited<ReturnType<typeof startApp>>|undefined;
 try{
  app=await startApp({client,port:0,dataRoot,optimizeDependencies:false,readPage:async requested=>{assert.equal(requested,url);return {id:1,title:topic,url,extract:evidence};},imageFetcher:async(requested,init)=>{
   imageRequests++;
   const requestUrl=new URL(String(requested));
   assert.equal(requestUrl.origin,'https://commons.wikimedia.org');assert.equal(requestUrl.searchParams.get('gsrsearch'),'Smoke model diagram');assert.equal(init?.redirect,'manual');
   return Response.json({query:{pages:[{title:'File:Smoke_model.png',imageinfo:[imageInfo]},{title:'File:Unlicensed.png',imageinfo:[{...imageInfo,extmetadata:{...imageInfo.extmetadata,LicenseShortName:{value:'All rights reserved'}}}]}]}});
  }});
  const signal=AbortSignal.timeout(10000);
  assert.match(await fetch(app.url,{signal}).then(r=>r.text()),/id="root"/);
  const {csrf}=await fetch(app.url+'/api/session',{signal}).then(r=>r.json());
  const response=await fetch(app.url+'/api/research',{method:'POST',signal,headers:{'content-type':'application/json','x-wikichat-token':csrf},body:JSON.stringify({topic,subjectId:'ai',philosophyId:'schematic',model:'fake-model',budget:{requests:9,minutes:1}})});
  const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(response.status,200);
  assert.equal(events.at(-1)?.type,'complete',JSON.stringify(events.at(-1)));
  const article=events.at(-1).article;
  const draftIndex=events.findIndex(e=>e.type==='document'&&JSON.stringify(e.document).includes(unsupported));
  assert.ok(draftIndex>=0&&events.findIndex(e=>e.type==='review-edit')>draftIndex);
  assert.ok(events.some(e=>e.type==='review-edit'&&e.edit.before===unsupported&&e.edit.after===''));
  assert.doesNotMatch(article.markdown,/interstellar/);
  assert.equal(imageRequests,1);
  assert.equal(article.imageCandidates.length,1);
  assert.deepEqual(events.find(e=>e.type==='image-candidates').images,article.imageCandidates);
  assert.equal(article.imageCandidates[0].title,'Smoke_model.png');
  assert.equal(article.imageCandidates[0].artist,'Fixture author');
  assert.equal(article.imageCandidates[0].license,'CC BY 4.0');
  assert.equal(article.images[0].caption,'Smoke model');
  assert.deepEqual(events.find(e=>e.type==='article-images').images,article.images);
  const html=renderToStaticMarkup(React.createElement(ArticleImages,{images:article.images}));
  assert.match(html,/<img /);assert.match(html,/Fixture author/);assert.match(html,/CC BY 4.0/);
  const bundle=await fetch(app.url+'/api/articles/'+article.id+'/knowledge-bundle',{signal}).then(r=>r.json());
  assert.deepEqual(validateKnowledgeBundle(bundle).illustrations?.[0].image,article.images[0]);
  assert.throws(()=>validateKnowledgeBundle({...bundle,illustrations:[{...bundle.illustrations[0],image:{...article.images[0],thumbnailUrl:'https://evil.example/image.png'}}]}));
  const bytes=JSON.stringify(bundle),path='knowledge/changes/demo.json';
  const approval={...receipt(1),digest:digest(bytes),approvedBy:9,approvedAt:'2026-10-05T12:00:00Z'};
  assert.deepEqual(approvedKnowledge(path,bytes,[approval],'ai').bundle.illustrations?.[0].image,article.images[0]);
  assert.throws(()=>approvedKnowledge(path,JSON.stringify({...bundle,illustrations:[]}),[approval],'ai'));
  assert.deepEqual(JSON.parse(await readFile(join(dataRoot,'articles',article.id+'.json'),'utf8')),article);
  assert.deepEqual(await fetch(app.url+'/api/articles/'+article.id,{signal}).then(r=>r.json()),article);
  assert.equal(calls,9);
  assert.equal(article.knowledge.narrative.audit.decisions.length,2);
  assert.equal(bundle.articles[0].markdown,article.markdown);
  assert.throws(()=>validateKnowledgeBundle({...bundle,articles:[{...bundle.articles[0],markdown:bundle.articles[0].markdown+' An unbound sentence.'}]}));
 }finally{await app?.close();await rm(dataRoot,{recursive:true,force:true});}
});
