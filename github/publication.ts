import site from './site.json' with {type:'json'};
import type {Receipt} from './ledger.js';
import {digest,parseContribution} from './articles.js';
export function approvedArticle(path:string,bytes:string,receipts:Receipt[]){
 const hash=digest(bytes);const receipt=receipts.find(r=>r.path===path&&r.digest===hash&&Number.isSafeInteger(r.approvedBy)&&(r.approvedBy||0)>0&&r.approvedAt);
 if(!receipt)throw new Error(`No exact-content approval receipt for ${path}. Publication stopped.`);
 const article=parseContribution(bytes,site.subjectId);
 return {...article,id:path.slice(9,-5),contributor:{login:receipt.login,id:receipt.userId},provenance:{pr:receipt.pr,head:receipt.head,approvedBy:receipt.approvedBy,approvedAt:receipt.approvedAt,digest:hash}};
}
