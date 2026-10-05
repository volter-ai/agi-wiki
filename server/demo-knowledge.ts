import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {KnowledgeStore,knowledgeHash} from './knowledge-store.js';
import {validateKnowledgeBundle,verifyBundleEvidence} from './knowledge-bundle.js';
/** Repository demos are AI-audited private previews; importing never grants approval. */
export async function loadDemoKnowledge(store:KnowledgeStore,root='demo'){
 const names=(await readdir(join(root,'knowledge')).catch(()=>[])).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).sort();
 for(const name of names){
  const bytes=await readFile(join(root,'knowledge',name),'utf8');if(Buffer.byteLength(bytes)>160000)throw Error('Oversized demo knowledge bundle.');
  const bundle=validateKnowledgeBundle(JSON.parse(bytes));
  const captures=await Promise.all(bundle.snapshot.captures.map(async ref=>{
   const full=JSON.parse(await readFile(join(root,'captures',ref.id+'.json'),'utf8'));
   if(!full.text||full.text.length>14000||knowledgeHash(full.text)!==ref.sha256||Object.entries(ref).some(([key,value])=>key!=='text'&&JSON.stringify(full[key])!==JSON.stringify(value)))throw Error('Demo source capture checksum or identity mismatch.');
   return full;
  }));
  verifyBundleEvidence(bundle,captures.map(c=>({url:c.url,extract:c.text})));
  for(const c of captures)store.capture(c);
  store.saveAuditedBatch(bundle.snapshot.entities,bundle.snapshot.revisions,bundle.snapshot.audits);
 }
 return names.length;
}
