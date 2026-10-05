import type {Receipt} from './ledger.js';
import {digest} from './articles.js';
import {validateKnowledgeBundle} from '../server/knowledge-bundle.js';
export function approvedKnowledge(path:string,bytes:string,receipts:Receipt[],subjectId:unknown=null){
 if(!/^knowledge\/changes\/[a-z0-9][a-z0-9-]{0,100}\.json$/.test(path)||Buffer.byteLength(bytes)>160000)throw Error('Invalid knowledge contribution file.');
 const receipt=receipts.find(r=>r.path===path&&r.digest===digest(bytes)&&Number.isSafeInteger(r.approvedBy)&&(r.approvedBy||0)>0&&r.approvedAt);
 if(!receipt)throw Error('No exact-content approval receipt for '+path+'. Publication stopped.');
 const bundle=validateKnowledgeBundle(JSON.parse(bytes));if(subjectId&&bundle.subjectId!==subjectId)throw Error('Wrong subject bundle.');return {bundle,receipt};
}
