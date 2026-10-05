/** Headings are navigation; all body blocks must be individually bound factoid sentences. */
export const FACT_SECTIONS=['Origins and publication','Method and implementation','Specifications and configurations','Capabilities and deployment','Evaluation and limitations','Related work'] as const;
export function factoidBlocks(markdown:string){
 let index=0;
 return markdown.split(/\n\s*\n/).map(text=>{
  if(text.startsWith('#')){if(!FACT_SECTIONS.some(s=>text==='## '+s))throw Error('Unsupported schematic section heading.');return {text,claimIndex:null};}
  if(!text.trim())throw Error('Empty schematic body block.');
  return {text,claimIndex:index++};
 });
}

export function factSection(f:{predicate:string;arguments:{role:string;value?:string}[]}):string{
 const property=f.arguments.find(a=>a.role==='property')?.value;
 if(property==='definition')return '';
 if(['introduced','released','authored','developed_by'].includes(f.predicate)||property?.startsWith('publication_')||property==='named_after')return FACT_SECTIONS[0];
 if(f.predicate==='implemented_by'||property==='method'||property==='implementation')return FACT_SECTIONS[1];
 if(['transistor_count','chip_area','streaming_multiprocessor_count','cuda_core_count','tensor_core_count','memory_capacity','cache_capacity','memory_bandwidth','interconnect_bandwidth','partition_count','manufacturing_process','architecture','form_factor','configuration'].includes(property||''))return FACT_SECTIONS[2];
 if(['reports_result','evaluated_on','compares'].includes(f.predicate)||['accuracy','pass_rate','resolved_rate','score','latency','throughput','training_cost','inference_cost','energy','power','memory_usage','limitation'].includes(property||''))return FACT_SECTIONS[4];
 if(['related_to','describes','uses','requires'].includes(f.predicate))return FACT_SECTIONS[5];
 return FACT_SECTIONS[3];
}
