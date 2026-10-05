/** Model requests are enforceable before dispatch; token usage is reported afterward. */
export function researchBudget(value:any={}) {
 const requests=value.requests??8,minutes=value.minutes??8;
 if(!Number.isInteger(requests)||requests<1||requests>100||!Number.isInteger(minutes)||minutes<1||minutes>60)throw Error('Choose 1–100 model requests and 1–60 minutes.');
 return {requests,minutes};
}
export class RequestBudget {
 used=0;
 constructor(readonly limit:number){}
 reserve(){if(this.used>=this.limit)throw Error('Usage allowance reached. Your draft is retained; continue explicitly with a new allowance.');this.used++;}
}
export async function researchCycles<T>(review:()=>Promise<T>,inspect:()=>Promise<{needsEvidence:boolean;addedEvidence:boolean}>,prepareReview:()=>Promise<void>):Promise<T>{
 let article=await review();
 for(;;){
  const check=await inspect();
  if(!check.needsEvidence)return article;
  if(!check.addedEvidence)throw Error('No new qualifying evidence was found. The draft is retained for inspection or an explicit continuation.');
  await prepareReview();article=await review();
 }
}
