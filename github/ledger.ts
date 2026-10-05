export type Receipt={pr:number;head:string;userId:number;login:string;path:string;digest:string;day:string;approvedBy?:number;approvedAt?:string};
export interface Store {read():Promise<{version:string;receipts:Receipt[]}>;write(version:string,receipts:Receipt[]):Promise<boolean>}
export async function reserve(store:Store,receipt:Receipt,approve?:{id:number;at:string}){
 for(let attempt=0;attempt<12;attempt++){
  const state=await store.read();const previous=state.receipts.find(r=>r.pr===receipt.pr&&r.head===receipt.head);
  if(previous&&(previous.digest!==receipt.digest||previous.userId!==receipt.userId))throw new Error('Receipt identity mismatch.');
  if(!previous&&state.receipts.filter(r=>r.userId===receipt.userId&&r.day===receipt.day).length>=100)throw new Error('100 submissions per UTC day reached.');
  if(previous&&(!approve||previous.approvedBy))return previous;
  const next={...(previous||receipt),...(approve?{approvedBy:approve.id,approvedAt:approve.at}:{})};
  const receipts=previous?state.receipts.map(r=>r===previous?next:r):[...state.receipts,next];
  if(await store.write(state.version,receipts))return next;
 }
 throw new Error('Quota ledger is busy. Retry; no admission was granted.');
}
