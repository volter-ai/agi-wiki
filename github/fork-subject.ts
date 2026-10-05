import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile,lstat,copyFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveSubject,validateSubject,type SubjectWiki} from '../shared/subjects.js';

/** Export tracked source only. No credentials, local drafts, approval receipts or Git history. */
export async function createSubjectFork(root:string,destination:string,repository:string,subject:SubjectWiki){
 validateSubject(subject);
 if(!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw Error('Supply the intended owner/repository.');
 const target=resolve(destination),source=resolve(root);
 if(target===source||target.startsWith(source+'/'))throw Error('Choose a destination outside the current repository.');
 const tracked=execFileSync('git',['ls-files','-z'],{cwd:source,encoding:'utf8'}).split('\0').filter(Boolean);
 const fixtures=tracked.filter(p=>/^demo\/(?:articles|knowledge|captures)\/.+\.json$/.test(p));
 const paths=tracked.filter(p=>! /^(?:\.volter\/|articles\/|knowledge\/changes\/|demo\/|public\/catalog\.json$|\.data\/|\.env(?:\.|$))/.test(p));
 for(const path of paths){if(path.split('/').includes('..')||!(await lstat(join(source,path))).isFile())throw Error('Only regular tracked source files can be forked.');}
 await mkdir(target,{recursive:false});
 for(const path of paths){await mkdir(dirname(join(target,path)),{recursive:true});await copyFile(join(source,path),join(target,path));}
 // Fixtures exercise the five checks; they are never loaded into the app or Pages catalog.
 for(const path of fixtures){if(!(await lstat(join(source,path))).isFile())throw Error('Only regular fixture files can be copied.');const dest=join(target,'test/fixtures',path);await mkdir(dirname(dest),{recursive:true});await copyFile(join(source,path),dest);}
 await mkdir(join(target,'subjects'),{recursive:true});
 await writeFile(join(target,'subjects/subject.json'),JSON.stringify(subject,null,2)+'\n');
 const registry=await readFile(join(target,'shared/subjects.ts'),'utf8');
 await writeFile(join(target,'shared/subjects.ts'),"import forkSubject from '../subjects/subject.json'; // fork-subject\n"+registry.replace(/^import forkSubject.*\n/gm,'').replace(/export const SUBJECTS:SubjectWiki\[\]=.*;/,"export const SUBJECTS:SubjectWiki[]=[validateSubject(forkSubject),...(forkSubject.id!==ai.id?[validateSubject(ai)]:[])];"));
 await writeFile(join(target,'github/site.json'),JSON.stringify({repository,title:subject.title,defaultSubject:subject.id,subjectId:subject.id,publication:'manual'},null,2)+'\n');
 await mkdir(join(target,'articles'));await writeFile(join(target,'articles/README.md'),'Only explicitly reviewed article JSON belongs here. No approvals are inherited from the parent repository.\n');
 await mkdir(join(target,'knowledge/changes'),{recursive:true});await writeFile(join(target,'knowledge/changes/README.md'),'Only exact-content approved claim bundles belong here. No claims or approvals are inherited from the parent repository.\n');
 await mkdir(join(target,'.volter'));await writeFile(join(target,'.volter/world.json'),JSON.stringify({id:subject.id+'-wiki',manifestVersion:2,description:'Subject wiki. No substituted vendors; ChatGPT sign-in and public evidence are live integrations.',services:[],env:{}})+'\n');
 await writeFile(join(target,'.volter/.gitignore'),'*\n!.gitignore\n!world.json\n!handlers/\n');
 await writeFile(join(target,'SUBJECT-WIKI.md'),`# ${subject.title}\n\nRepository: ${repository}\n\nThis local fork contains source code and the subject map, with an empty article collection. It has no remote, credentials, approval ledger or deployment.\n\nInstall locked dependencies, start its World and run the app using the README. Before enabling GitHub admission: install your own GitHub App, protect the default and wiki-ledger branches, initialize an empty ledger, configure the Pages environment with required reviewers, and keep public admission disabled until tested. The existing 100-submissions-per-user-per-UTC-day quota applies independently in this repository, not across forks.\n\nReview each source against the subject philosophy and explicitly approve each article locally. Creating this fork grants no publication approval.\n`);
 execFileSync('git',['init','--initial-branch=main'],{cwd:target,stdio:'pipe'});
 return target;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [id,destination,repository]=process.argv.slice(2);
 if(!id||!destination||!repository)throw Error('Usage: npm run subject:fork -- <subject-id-or-manifest.json> <new-directory> <owner/repository>');
 const subject=id.endsWith('.json')?validateSubject(JSON.parse(await readFile(id,'utf8'))):resolveSubject(id);
 console.log('Created local subject repository: '+await createSubjectFork(process.cwd(),destination,repository,subject));
}
