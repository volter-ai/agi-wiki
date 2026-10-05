import {validateKnowledgeBundle} from '../server/knowledge-bundle.js';
import site from './site.json' with {type:'json'};
import {assertSubjectPolicy} from '../shared/subjects.js';
import {createHash} from 'node:crypto';
import {validateUpload} from '../community/content.js';
import {api,repository} from './api.js';
export const digest=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
export function parseContribution(bytes:string,subjectId:unknown=null){
 if(Buffer.byteLength(bytes)>160000)throw new Error('Article file exceeds 160 KB.');
 const article=validateUpload({article:JSON.parse(bytes)});if(subjectId){if(article.subjectId!==subjectId)throw Error('Article belongs to a different subject wiki.');assertSubjectPolicy(subjectId,article.philosophy);}return article;
}
export function getContribution(repo:string,number:number){
 repository(repo);if(!Number.isSafeInteger(number)||number<1)throw new Error('Invalid PR number.');
 const pr=api(`repos/${repo}/pulls/${number}`);
 if(pr.state!=='open'||pr.draft||pr.base.repo.full_name.toLowerCase()!==repo.toLowerCase())throw new Error('An open, non-draft PR in this repository is required.');
 const files=api(`repos/${repo}/pulls/${number}/files?per_page=100`);
 if(pr.changed_files!==1||files.length!==1||!['added','modified'].includes(files[0].status)||! /^(?:articles\/|knowledge\/changes\/)[a-z0-9][a-z0-9-]{0,100}\.json$/.test(files[0].filename))throw new Error('Submit exactly one article or knowledge-bundle JSON file; code, renames, and deletions require separate maintainer review.');
 const headRepo=repository(pr.head.repo.full_name);const content=api(`repos/${headRepo}/contents/${files[0].filename}?ref=${pr.head.sha}`);
 if(content.type!=='file'||content.size>160000||content.encoding!=='base64')throw new Error('Invalid article file.');
 const bytes=Buffer.from(content.content,'base64').toString('utf8');const kind=files[0].filename.startsWith('knowledge/')?'knowledge' as const:'article' as const;const bundle=kind==='knowledge'?validateKnowledgeBundle(JSON.parse(bytes)):undefined;if(bundle&&site.subjectId&&bundle.subjectId!==site.subjectId)throw Error('Wrong subject wiki.');const article=kind==='article'?parseContribution(bytes,site.subjectId):undefined;
 const fresh=api(`repos/${repo}/pulls/${number}`);if(fresh.head.sha!==pr.head.sha)throw new Error('PR changed during validation. Retry.');
 return {pr,kind,article:article!,bundle:bundle!,bytes,receipt:{pr:number,head:pr.head.sha,userId:pr.user.id,login:pr.user.login,path:files[0].filename,digest:digest(bytes),day:new Date().toISOString().slice(0,10)}};
}
