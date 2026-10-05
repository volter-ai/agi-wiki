// Trusted default-branch code only. PR content is parsed JSON, never checked out or executed.
import {readFileSync} from 'node:fs';
import {api,GitStore,repository} from './api.js';
import {getContribution} from './articles.js';
import {reserve} from './ledger.js';
const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!,'utf8'));const repo=repository();
const command=String(event.comment?.body||'').trim();const number=Number(event.issue?.number||event.inputs?.pr);
const approval=command.match(/^\/approve ([a-f0-9]{40}) ([a-f0-9]{64})$/);
if(command!=='/submit'&&!approval&&process.env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw new Error('Unsupported command.');
const item=getContribution(repo,number);const sender=event.sender;
const isAuthor=sender.id===item.pr.user.id;
if(!isAuthor||approval){
 const permission=api(`repos/${repo}/collaborators/${encodeURIComponent(sender.login)}/permission`).permission;
 if(!['admin','maintain','write'].includes(permission))throw new Error('Only the author may submit; approval requires a maintainer.');
}
if(approval&&(approval[1]!==item.receipt.head||approval[2]!==item.receipt.digest))throw new Error('Approval does not match the current research content and commit. Review again locally.');
const result=await reserve(new GitStore(repo),item.receipt,approval?{id:sender.id,at:new Date().toISOString()}:undefined);
api(`repos/${repo}/statuses/${item.receipt.head}`,'POST',{state:result.approvedBy?'success':'pending',context:'WikiChat / local approval',description:result.approvedBy?'Exact research revision approved locally.':'Admitted. Awaiting explicit local source review.'});
console.log(JSON.stringify({pr:number,head:item.receipt.head,admitted:true,approved:!!result.approvedBy}));
