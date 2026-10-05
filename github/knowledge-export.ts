import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import site from './site.json' with {type:'json'};
import {KnowledgeStore} from '../server/knowledge-store.js';
import {exportKnowledgeBundle} from '../server/knowledge-bundle.js';
import {resolveSubject} from '../shared/subjects.js';
import {resolvePhilosophy} from '../shared/philosophies.js';
const subject=resolveSubject(process.argv[2]||site.defaultSubject),philosophy=resolvePhilosophy(subject.philosophyId),jobId=process.argv[3];
if(site.subjectId&&site.subjectId!==subject.id)throw Error('Export the configured subject wiki only.');
if(jobId&&!/^[a-f0-9-]{36}$/.test(jobId))throw Error('Supply a valid source task ID.');
const store=new KnowledgeStore(resolve('.data/knowledge.sqlite'));
try{
 const bundle=exportKnowledgeBundle(store.snapshot(),subject.id,philosophy,jobId);
 const bytes=JSON.stringify(bundle,null,2)+'\n';if(Buffer.byteLength(bytes)>160000)throw Error('The review bundle exceeds 160 KB; export an individual source task with knowledge:export -- SUBJECT TASK_ID.');
 await mkdir('.data/knowledge-exports',{recursive:true,mode:0o700});const path=resolve('.data/knowledge-exports',subject.id+'-claims'+(jobId?'-'+jobId.slice(0,8):'')+'.json');await writeFile(path,bytes,{mode:0o600});
 console.log(`Review bundle: ${path}\nAdd this one file under knowledge/changes/ in a PR and /submit. Existing quota and explicit local approval apply. No approval is exported or granted.`);
}finally{store.close();}
