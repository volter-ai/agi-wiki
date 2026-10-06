import {assertFactoidCoverage} from '../server/knowledge-articles.js';
import {approvedKnowledge} from './knowledge-publication.js';
import {currentFacts,emptyKnowledge} from '../shared/knowledge.js';
import {mergeKnowledge} from '../server/knowledge-bundle.js';
import {factArticle} from '../server/knowledge-articles.js';
import {resolvePhilosophy} from '../shared/philosophies.js';
import {resolveSubject} from '../shared/subjects.js';
import {readFile,readdir,mkdir,writeFile,lstat} from 'node:fs/promises';
import {approvedArticle} from './publication.js';
import type {Receipt} from './ledger.js';
const config=JSON.parse(await readFile('github/site.json','utf8'));
if(process.env.GITHUB_ACTIONS==='true'&&config.repository!==process.env.GITHUB_REPOSITORY)throw new Error('Configure the exact publication repository before deployment.');
let receipts:Receipt[]=[];
try{receipts=JSON.parse(await readFile('.data/publication-receipts.json','utf8'));}catch{}
const articles:any[]=[];
const knowledge=emptyKnowledge(),credit=new Map<string,any>(),illustrations=new Map<string,any>(),narratives=new Map<string,any>();
const approvedBundles=[];
for(const name of (await readdir('knowledge/changes').catch(()=>[])).filter(n=>n.endsWith('.json'))){
 const path='knowledge/changes/'+name;if(!(await lstat(path)).isFile())throw Error('Knowledge symlinks are not permitted.');
 approvedBundles.push(approvedKnowledge(path,await readFile(path,'utf8'),receipts,config.subjectId));
}
for(const {bundle,receipt} of approvedBundles.sort((a,b)=>a.receipt.approvedAt!.localeCompare(b.receipt.approvedAt!))){
 mergeKnowledge(knowledge,bundle,{reviewer:'github:'+receipt.approvedBy,approvedAt:receipt.approvedAt!});
 for(const article of bundle.articles||[])narratives.set(article.knowledge!.entityId,{article,receipt});
 for(const illustration of bundle.illustrations||[])illustrations.set(illustration.entityId,{image:illustration.image,receipt});
 for(const fact of bundle.snapshot.revisions)if(!credit.has(fact.id))credit.set(fact.id,receipt);
}

for(const name of (await readdir('articles')).filter(n=>n.endsWith('.json'))){
 if(!/^[a-z0-9][a-z0-9-]{0,100}\.json$/.test(name))throw new Error('Invalid article filename.');
 if(!(await lstat('articles/'+name)).isFile())throw new Error('Article symlinks are not permitted.');
 const bytes=await readFile('articles/'+name,'utf8');
 articles.push(approvedArticle('articles/'+name,bytes,receipts));
}
for(const entity of knowledge.entities){
 try{const subject=resolveSubject(entity.subjectId);let a=factArticle(knowledge,entity.id,resolvePhilosophy(subject.philosophyId),'approved');const composed=narratives.get(entity.id);if(composed){const candidate={...composed.article,knowledge:{...composed.article.knowledge,mode:'approved' as const}};const current=new Map(currentFacts(knowledge,a.knowledge!.policyKey,'approved').map(f=>[f.factId,f.id]));if([...candidate.knowledge.dependencies,...candidate.knowledge.scope||[]].every((d:any)=>current.get(d.factId)===d.revisionId)){assertFactoidCoverage(candidate,knowledge);a=candidate;}}const contributions=a.knowledge!.dependencies.map(d=>credit.get(d.revisionId)).filter(Boolean);const receipt=composed&&a.knowledge?.narrative?composed.receipt:contributions.at(-1);if(!receipt)continue;
 const illustration=illustrations.get(entity.id);
 articles.push({...a,...(illustration?{images:[illustration.image],imageProvenance:{pr:illustration.receipt.pr,digest:illustration.receipt.digest,approvedAt:illustration.receipt.approvedAt}}:{}),contributor:{login:receipt.login,id:receipt.userId},contributors:[...new Map(contributions.map(r=>[r.userId,{login:r.login,id:r.userId}])).values()],provenance:{pr:receipt.pr,head:receipt.head,approvedBy:receipt.approvedBy,approvedAt:receipt.approvedAt,digest:receipt.digest,path:receipt.path,kind:'knowledge'}});
 }catch(error){if(!(error as Error).message.includes('No eligible claims')&&!(error as Error).message.includes('incomplete or malformed'))throw error;}
}
await mkdir('public',{recursive:true});await writeFile('public/catalog.json',JSON.stringify({repository:config.repository,title:config.title,subject:config.defaultSubject?resolveSubject(config.defaultSubject):null,knowledge,articles}));
console.log(`Built catalog of ${articles.length} explicitly approved articles.`);
