import {resolve} from 'node:path';
import {KnowledgeStore} from '../server/knowledge-store.js';
const [command,revisionId,digest,reviewer]=process.argv.slice(2);
const store=new KnowledgeStore(resolve('.data/knowledge.sqlite'));
try{
 if(command==='inspect'){
  const k=store.snapshot(),fact=k.revisions.find(f=>f.id===revisionId);if(!fact)throw Error('Unknown revision.');
  console.log(JSON.stringify({revision:fact,audit:k.audits.find(a=>a.revisionId===revisionId),captures:fact.evidence.map(e=>{const c=k.captures.find(c=>c.id===e.captureId)!;return {url:c.url,title:c.title,sha256:c.sha256,classification:c.classificationReason,quote:e.quote,context:c.text.slice(Math.max(0,e.start-500),Math.min(c.text.length,e.end+500))};})},null,2));
 }else if(command==='approve'){
  if(!digest||!reviewer)throw Error('Supply the exact revision digest and local human reviewer name after inspecting its evidence.');
  store.approve(revisionId,digest,reviewer);console.log('Exact claim revision approved locally. Article publication remains a separate approval.');
 }else throw Error('Usage: knowledge:review -- inspect REVISION or approve REVISION DIGEST HUMAN_REVIEWER');
}finally{store.close();}
