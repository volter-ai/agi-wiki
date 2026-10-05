import {atomicSentenceCount} from './sentences.js';
import {ENTITY_TYPES,type EntityType,type FactArgument,type FactRevision,type KnowledgeEntity} from './knowledge.js';

type Role=FactArgument['role'];
type Rule={subject:readonly EntityType[];object?:readonly EntityType[];required:readonly Role[];optional?:readonly Role[]};
const actors=['person','organization'] as const;
const artifacts=['paper','model','product','benchmark','technique','hardware','dataset','law','concept'] as const;
/** Published to the extractor and enforced independently by the host. */
export const PREDICATE_SCHEMAS:Record<FactRevision['predicate'],Rule>={
 compares:{subject:['person','organization','paper'],object:['model','product','technique','hardware','benchmark','dataset'],required:['subject','object','baseline','property','value','conditions'],optional:['participant','version']},
 implemented_by:{subject:['technique','model'],object:['product'],required:['subject','object'],optional:['conditions','version']},
 describes:{subject:['paper','organization','product'],object:artifacts,required:['subject','object'],optional:['property','value','unit','conditions']},
 introduced:{subject:actors,object:artifacts,required:['subject','object'],optional:['version']},
 released:{subject:actors,object:artifacts,required:['subject','object'],optional:['version']},
 authored:{subject:actors,object:['paper','dataset','law','concept'],required:['subject','object'],optional:['participant']},
 developed_by:{subject:artifacts,object:actors,required:['subject','object'],optional:['participant','version']},
 uses:{subject:ENTITY_TYPES,object:artifacts,required:['subject','object'],optional:['participant','conditions','version']},
 evaluated_on:{subject:['model','product','technique','hardware'],object:['benchmark','dataset'],required:['subject','object','conditions'],optional:['version','participant']},
 reports_result:{subject:['person','organization','paper'],object:['benchmark','dataset'],required:['subject','object','participant','property','value','unit','conditions'],optional:['version']},
 has_property:{subject:ENTITY_TYPES,required:['subject','property','value'],optional:['unit','conditions','version','participant']},
 located_at:{subject:ENTITY_TYPES,object:['place'],required:['subject','object']},
 regulates:{subject:['law'],object:ENTITY_TYPES,required:['subject','object'],optional:['conditions']},
 requires:{subject:ENTITY_TYPES,object:ENTITY_TYPES,required:['subject','object'],optional:['conditions','version']},
 related_to:{subject:ENTITY_TYPES,object:ENTITY_TYPES,required:['subject','object']},
};
export const FACT_UNITS=['count','percent','ratio','seconds','milliseconds','minutes','hours','bytes','kilobytes','megabytes','gigabytes','terabytes','bits','watts','kilowatts','joules','hertz','megahertz','gigahertz','meters','kilometers','degrees','tokens','tokens_per_second','operations_per_second','flops','teraflops','petaflops','usd','square_millimeters','gigabytes_per_second','terabytes_per_second'] as const;
type PropertyRule={type:NonNullable<FactArgument['valueType']>;units?:readonly string[];subject?:readonly EntityType[];conditions?:boolean;values?:readonly string[]};
export const PROPERTY_SCHEMAS:Record<string,PropertyRule>={
 method:{type:'text',subject:['technique','model']},implementation:{type:'text',subject:['technique','product']},limitation:{type:'text'},configuration:{type:'text',subject:['hardware','product','technique','model']},form_factor:{type:'text',subject:['hardware','product']},named_after:{type:'text'},task_input:{type:'text',subject:['benchmark','dataset']},task_output:{type:'text',subject:['benchmark','dataset']},publication_venue:{type:'text',subject:['paper']},publication_date:{type:'date',subject:['paper']},
 chip_area:{type:'number',units:['square_millimeters'],subject:['hardware']},streaming_multiprocessor_count:{type:'number',units:['count'],subject:['hardware']},cuda_core_count:{type:'number',units:['count'],subject:['hardware']},tensor_core_count:{type:'number',units:['count'],subject:['hardware']},cache_capacity:{type:'number',units:['bytes','kilobytes','megabytes','gigabytes'],subject:['hardware']},memory_bandwidth:{type:'number',units:['gigabytes_per_second','terabytes_per_second'],subject:['hardware']},interconnect_bandwidth:{type:'number',units:['gigabytes_per_second','terabytes_per_second'],subject:['hardware']},partition_count:{type:'number',units:['count'],subject:['hardware']},
 performance_preference:{type:'text',values:['preferred','slightly_preferred','less_preferred','similar'],conditions:true},efficiency_comparison:{type:'text',values:['higher','lower','similar'],conditions:true},runtime_comparison:{type:'text',values:['higher','lower','similar','different'],conditions:true},forgetting_comparison:{type:'text',values:['less','more','similar'],conditions:true},
 definition:{type:'text'},purpose:{type:'text'},capability:{type:'text'},architecture:{type:'text'},manufacturing_process:{type:'text'},license:{type:'text'},status:{type:'text'},publication_status:{type:'text',subject:['paper']},jurisdiction:{type:'text',subject:['law']},input_modality:{type:'text'},output_modality:{type:'text'},precision:{type:'text'},availability:{type:'text'},training_data:{type:'text'},
 trainable_parameter_count:{type:'number',units:['count'],subject:['model','technique'],conditions:true},
 parameter_count:{type:'number',units:['count'],subject:['model']},transistor_count:{type:'number',units:['count'],subject:['hardware']},memory_capacity:{type:'number',units:['bytes','kilobytes','megabytes','gigabytes','terabytes'],subject:['hardware','product']},problem_count:{type:'number',units:['count'],subject:['benchmark','dataset']},repository_count:{type:'number',units:['count'],subject:['benchmark','dataset']},context_length:{type:'number',units:['tokens'],subject:['model','product']},
 effective_date:{type:'date',subject:['law']},open_weights:{type:'boolean',subject:['model']},
 accuracy:{type:'number',units:['percent','ratio'],conditions:true},pass_rate:{type:'number',units:['percent','ratio'],conditions:true},resolved_rate:{type:'number',units:['percent','ratio'],conditions:true},score:{type:'number',units:['count','percent','ratio'],conditions:true},latency:{type:'number',units:['seconds','milliseconds'],conditions:true},throughput:{type:'number',units:['tokens_per_second','operations_per_second','flops','teraflops','petaflops'],conditions:true},training_cost:{type:'number',units:['usd'],conditions:true},inference_cost:{type:'number',units:['usd'],conditions:true},energy:{type:'number',units:['joules'],conditions:true},power:{type:'number',units:['watts','kilowatts'],conditions:true},memory_usage:{type:'number',units:['bytes','megabytes','gigabytes'],conditions:true},
};
const literalRoles=new Set<Role>(['property','value','unit','version','conditions']);
export function validateSchematicFact(f:FactRevision,entities:KnowledgeEntity[]){
 const rule=PREDICATE_SCHEMAS[f.predicate];if(!rule)throw Error('Unknown schematic predicate.');
 if(typeof f.statement!=='string'||f.statement.length>900||/[<>\n\r]|https?:\/\/|\[[^\]]*\]\(/.test(f.statement)||!/[.!?]$/.test(f.statement)||atomicSentenceCount(f.statement)!==1)throw Error('A schematic fact must contain exactly one plain sentence.');
 if(!Array.isArray(f.arguments)||f.arguments.length>12)throw Error('Invalid schematic arguments.');
 const allowed=new Set([...rule.required,...rule.optional||[]]),counts=new Map<Role,number>();
 const entityMap=new Map(entities.map(e=>[e.id,e]));
 for(const a of f.arguments){
  if(!allowed.has(a.role))throw Error(`Role ${a.role} is not allowed for ${f.predicate}.`);
  counts.set(a.role,(counts.get(a.role)||0)+1);if(a.role!=='participant'&&counts.get(a.role)!>1)throw Error(`Duplicate schematic role ${a.role}.`);
  if(literalRoles.has(a.role)){
   if(a.entityId!==undefined||typeof a.value!=='string'||!a.value.trim()||a.value.length>500||/[\u0000-\u001f<>]/.test(a.value)||!['text','number','boolean','date'].includes(a.valueType||''))throw Error(`Role ${a.role} needs a typed literal.`);
   if(a.role!=='value'&&a.valueType!=='text')throw Error(`Role ${a.role} requires text.`);
   if(a.valueType==='number'&&(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(a.value)||!Number.isFinite(Number(a.value))))throw Error('Numeric literals must be finite canonical decimals.');
   if(a.valueType==='boolean'&&!['true','false'].includes(a.value))throw Error('Invalid boolean literal.');
   if(a.valueType==='date'){const d=new Date(a.value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(a.value)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==a.value)throw Error('Invalid date literal.');}
   if(a.role==='property'&&!/^[a-z][a-z0-9_]{0,79}$/.test(a.value))throw Error('Property names must be schematic identifiers.');
   if(a.role==='unit'&&!FACT_UNITS.includes(a.value as any))throw Error('Use a registered fact unit.');
  }else{
   const entity=entityMap.get(a.entityId||'');
   if(a.value!==undefined||a.valueType!==undefined||!entity||entity.subjectId!==f.subjectId)throw Error(`Role ${a.role} needs an explicit entity in this subject.`);
   const types=a.role==='subject'?rule.subject:a.role==='object'?rule.object:undefined;
   if(types&&!types.includes(entity.type))throw Error(`Entity type ${entity.type} is not allowed as ${a.role} of ${f.predicate}.`);
   if(f.predicate==='compares'&&a.role==='baseline'&&!['model','product','technique','hardware','benchmark','dataset'].includes(entity.type))throw Error('A comparison baseline must be an evaluated artifact.');
   if(f.predicate==='reports_result'&&a.role==='participant'&&!['model','product','technique','hardware'].includes(entity.type))throw Error('A reported result needs an evaluated model, product, technique or hardware.');
  }
 }
 for(const role of rule.required)if(!counts.get(role))throw Error(`Predicate ${f.predicate} requires ${role}.`);
 const value=f.arguments.find(a=>a.role==='value'),unit=f.arguments.find(a=>a.role==='unit'),property=f.arguments.find(a=>a.role==='property');
 if((value||unit)&&!property)throw Error('Schematic values require a registered property.');
 if(property){
  const shape=PROPERTY_SCHEMAS[property.value!];if(!shape)throw Error('Unknown schematic property; register its shape before extracting claims.');
  if(shape.values&&(f.predicate!=='compares'||!shape.values.includes(value?.value||''))||f.predicate==='compares'&&!shape.values)throw Error('Qualitative comparisons require a registered outcome and an explicit baseline.');
  if(shape.type!==value?.valueType)throw Error(`Property ${property.value} requires a ${shape.type} value.`);
  if(shape.units&&!shape.units.includes(unit?.value||''))throw Error(`Property ${property.value} requires a compatible registered unit.`);
  const subject=entityMap.get(f.arguments.find(a=>a.role==='subject')?.entityId||'');
  if(f.predicate==='has_property'&&shape.subject&&!shape.subject.includes(subject!.type))throw Error(`Property ${property.value} does not apply to ${subject!.type}.`);
  if(shape.conditions&&(!counts.get('conditions')||f.modality!=='reported'||!f.attribution?.trim()))throw Error('Measured properties require evidenced conditions and an attributed report.');
 }
 if(value?.valueType==='number'&&!unit)throw Error('Numeric facts require an explicit unit (count for dimensionless counts).');
 if(unit&&value?.valueType!=='number')throw Error('Units require a numeric value.');
 if(f.predicate==='reports_result'&&(f.modality!=='reported'||value?.valueType!=='number'))throw Error('Results must be attributed reports with numeric values.');
 if(f.modality==='reported'&&(!f.attribution?.trim()||f.attribution.length>180))throw Error('Reported schematic facts require attribution.');
}
