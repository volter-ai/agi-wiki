import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chatgpt} from './auth.js';
import {KnowledgeStore} from './knowledge-store.js';
import {composeNarrative} from './article-narrative.js';
import {assertFactoidCoverage} from './knowledge-articles.js';
import {exportKnowledgeBundle} from './knowledge-bundle.js';
import type {Article} from './research.js';
const root=resolve('.data/narrative-review');await mkdir(root,{recursive:true});
const path=root+'/checkpoint.json';const state:any=await readFile(path,'utf8').then(JSON.parse).catch(()=>({requests:0,articles:{}}));
const save=async()=>{await writeFile(path+'.tmp',JSON.stringify(state,null,2),{mode:0o600});await rename(path+'.tmp',path);};
const session=await chatgpt.getSession();if(!session.sharing||!session.profileId)throw Error('Connect the existing ChatGPT account first.');
if(state.profileId&&state.profileId!==session.profileId)throw Error('This edit cycle belongs to another account.');state.profileId=session.profileId;
const signal=AbortSignal.timeout(12*60000),models=await chatgpt.listModels({signal});
const store=new KnowledgeStore(resolve('.data/knowledge.sqlite'));
try{
for(const oldId of ['807643d5-3ecb-4f4f-83ec-9277ef919020','b724d7d6-18ff-4f6d-898b-c61f2295afa7','0ad7d315-240a-41c4-a2a2-8675bff339d9']){
 let original:Article;try{original=JSON.parse(await readFile('demo/articles/'+oldId+'.json','utf8'));}catch{continue;}
 const record=state.articles[oldId]||={id:randomUUID(),editor:{}};
 if(record.complete){console.log(original.title+': already prepared');continue;}
 const model=models.find(m=>m.slug===original.model)?.slug||models[0]?.slug;if(!model)throw Error('No eligible ChatGPT model.');
 console.log('Writing '+original.title+' with '+model);
 const client={streamResponse:async(options:any)=>{signal.throwIfAborted();if(state.requests>=9)throw Error('This local editing cycle reached its nine-request cap. Drafts are preserved.');state.requests++;await save();console.log('Model request '+state.requests+'/9');return chatgpt.streamResponse({...options,model,signal});}};
 const article=await composeNarrative({article:original,k:store.snapshot(),client,model,signal,state:record.editor,save,show:(sentences,stage)=>{console.log(original.title+': '+stage+' · '+sentences.length+' sentences');}});
 article.id=record.id;article.model=model;article.createdAt=new Date().toISOString();assertFactoidCoverage(article,store.snapshot());
 const bundle=exportKnowledgeBundle(store.snapshot(),article.subjectId!,article.philosophy!,undefined,[...article.knowledge!.dependencies,...article.knowledge!.scope||[]].map(d=>d.revisionId),article.images?.map(image=>({entityId:article.knowledge!.entityId,image})),[article]);
 const bytes=JSON.stringify(bundle,null,2)+'\n';if(Buffer.byteLength(bytes)>160000)throw Error('Review bundle exceeds 160 KB.');
 await writeFile(root+'/'+record.id+'.json',JSON.stringify(article,null,2)+'\n',{mode:0o600});
 await writeFile(root+'/'+record.id+'-bundle.json',bytes,{mode:0o600});
 await writeFile('.data/articles/'+record.id+'.json',JSON.stringify(article),{mode:0o600});
 record.complete=true;record.title=article.title;record.sentences=article.knowledge!.narrative!.sentences.length;await save();console.log('Local review: http://127.0.0.1:4317/?article='+record.id);
}
}finally{store.close();}
