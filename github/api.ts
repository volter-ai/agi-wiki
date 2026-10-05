import {execFileSync} from 'node:child_process';
import type {Receipt,Store} from './ledger.js';
export function repository(value=process.env.GITHUB_REPOSITORY||''){if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value))throw new Error('Configure GITHUB_REPOSITORY as owner/repository.');return value;}
export function api(path:string,method='GET',body?:unknown):any{
 if(!path.startsWith('repos/'))throw new Error('Unsupported GitHub API route.');
 const args=['api',path,'--method',method];if(body!==undefined)args.push('--input','-');
 try{return JSON.parse(execFileSync('gh',args,{input:body===undefined?undefined:JSON.stringify(body),encoding:'utf8',maxBuffer:5_000_000,stdio:['pipe','pipe','pipe']}));}
 catch{throw new Error(`GitHub ${method} request failed for ${path.split('?')[0]}.`);}
}
export class GitStore implements Store {
 constructor(public repo:string){}
 async read(){
  const ref=api(`repos/${this.repo}/git/ref/heads/wiki-ledger`);const commit=api(`repos/${this.repo}/git/commits/${ref.object.sha}`);
  const tree=api(`repos/${this.repo}/git/trees/${commit.tree.sha}`);const entry=tree.tree.find((x:any)=>x.path==='receipts.json');
  if(!entry)throw new Error('Missing quota ledger. Run the explicit setup command.');
  const blob=api(`repos/${this.repo}/git/blobs/${entry.sha}`);const receipts=JSON.parse(Buffer.from(blob.content,'base64').toString('utf8'));
  if(!Array.isArray(receipts))throw new Error('Invalid ledger.');return {version:ref.object.sha,receipts};
 }
 async write(version:string,receipts:Receipt[]){
  const tree=api(`repos/${this.repo}/git/trees`,'POST',{tree:[{path:'receipts.json',mode:'100644',type:'blob',content:JSON.stringify(receipts)}]});
  const commit=api(`repos/${this.repo}/git/commits`,'POST',{message:'Record article admission or explicit local approval',tree:tree.sha,parents:[version]});
  try{api(`repos/${this.repo}/git/refs/heads/wiki-ledger`,'PATCH',{sha:commit.sha,force:false});return true;}catch{
   const current=api(`repos/${this.repo}/git/ref/heads/wiki-ledger`);if(current.object.sha===version)throw new Error('Ledger update refused. Check branch permissions.');return false;
  }
 }
}
