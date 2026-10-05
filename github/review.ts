import {verifyBundleEvidence} from '../server/knowledge-bundle.js';
import {fetchEvidence} from '../server/web-evidence.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {api,repository} from './api.js';
import {getContribution,digest} from './articles.js';
import {refetchSource as refetchLegacy,sourcePolicyProblems} from '../shared/sources.js';
const [mode,repoArg,numberArg]=process.argv.slice(2);const repo=repository(repoArg);const number=Number(numberArg);
const item=getContribution(repo,number);const directory=resolve('.data/github-reviews',String(number),item.receipt.head);
const sourceInputs=item.kind==='knowledge'?item.bundle.snapshot.captures.map((c,i)=>({id:i+1,url:c.url,title:c.title})):item.article.sources;
const philosophy=item.kind==='knowledge'?item.bundle.philosophy:item.article.philosophy!;
const sources=await Promise.all(sourceInputs.map(s=>(new URL(s.url).hostname==='europepmc.org'||philosophy.version===1?refetchLegacy(s,AbortSignal.timeout(30000)):fetchEvidence(s.url,AbortSignal.timeout(30000)).then(page=>({...page,id:s.id})))));
const problems=sourcePolicyProblems(sources,philosophy);if(problems.length)throw new Error(problems.join('\n'));
if(item.kind==='knowledge')verifyBundleEvidence(item.bundle,sources);
const title=item.kind==='knowledge'?item.bundle.subjectId+' shared claims':item.article.title;
const content=item.kind==='knowledge'?JSON.stringify(item.bundle.snapshot.revisions,null,2):item.article.markdown;
const illustrations=item.kind==='knowledge'?(item.bundle.illustrations||[]).map(i=>i.image):item.article.images||[];
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
if(mode==='prepare'){
 await mkdir(directory,{recursive:true,mode:0o700});
 await writeFile(directory+'/review.json',JSON.stringify({repo,...item.receipt,preparedAt:new Date().toISOString(),article:item.article,bundle:item.bundle,sources},null,2),{mode:0o600});
 const html=`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Local article review</title><style>body{max-width:900px;margin:40px auto;padding:20px;font:17px/1.6 sans-serif}pre{white-space:pre-wrap}h1,h2{font-family:Georgia}section{border-top:1px solid #aaa}</style><h1>${escape(title)}</h1><p>LOCAL REVIEW · PR ${number} · ${item.receipt.head}</p><p>No AI service was called. Verify every sentence, structured relationship, identity, date and coordinate against its cited evidence, check abuse and the research standards, then explicitly approve this exact revision.</p><h2>Research standards</h2><p>${escape(philosophy.rules)}</p><h2>Article</h2><pre>${escape(content)}</pre><h2>Article illustrations</h2>${illustrations.length?illustrations.map(i=>`<figure><a href="${escape(i.pageUrl)}" rel="noreferrer"><img src="${escape(i.thumbnailUrl)}" alt="${escape(i.caption)}" referrerpolicy="no-referrer" style="max-width:400px;max-height:350px"></a><figcaption>${escape(i.caption)} · ${escape(i.artist)} · <a href="${escape(i.licenseUrl)}" rel="noreferrer">${escape(i.license)}</a></figcaption></figure>`).join(''):'No illustrations.'}<p>Inspect each image for subject relevance and abuse, and confirm its author and licence on the original file page. The exact approval also covers these image selections.</p><h2>Retrieved evidence</h2>${sources.map(s=>`<section><h3>[${s.id}] ${escape(s.title)}</h3><a href="${escape(s.url)}" rel="noreferrer">Original source</a><p>${escape(s.extract)}</p></section>`).join('')}<h2>Approval command</h2><pre>volter world run -- npm run review:approve -- ${escape(repo)} ${number} ${item.receipt.digest}</pre><p>Only run this after completing the review. It posts an approval instruction to GitHub using your account. It does not merge or publish.</p>`;
 await writeFile(directory+'/index.html',html,{mode:0o600});console.log(`Review at http://127.0.0.1:4317/local-reviews/${number}/${item.receipt.head}/index.html`);
}else if(mode==='approve'){
 const expected=process.argv[5];const saved=JSON.parse(await readFile(directory+'/review.json','utf8'));
 if(digest(JSON.stringify(saved.sources.map((s:any)=>({id:s.id,url:s.url,extract:s.extract}))))!==digest(JSON.stringify(sources.map(s=>({id:s.id,url:s.url,extract:s.extract})))))throw new Error('Source evidence changed. Prepare and inspect a fresh review.');
 if(expected!==item.receipt.digest||saved.digest!==expected||saved.repo!==repo)throw new Error('Review receipt mismatch. Prepare and inspect the current revision first.');
 if(Date.now()-Date.parse(saved.preparedAt)>86400000)throw new Error('Review is older than 24 hours. Prepare again.');
 // Approval is an explicit CLI action, never part of prepare or an AI callback.
 api(`repos/${repo}/issues/${number}/comments`,'POST',{body:`/approve ${item.receipt.head} ${item.receipt.digest}`});
 console.log('Explicit approval submitted for the exact revision. Merge and Pages deployment remain separate actions.');
}else throw new Error('Use prepare or approve.');
