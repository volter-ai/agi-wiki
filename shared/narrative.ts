/** Article prose is a separately reviewed view of schematic facts, never a replacement for them. */
export interface NarrativeSentence {id:string;text:string;revisionIds:string[];section:string;paragraph:number;sourceIds:number[]}
export interface ArticleNarrative {version:1;entityId:string;sentences:NarrativeSentence[];factStatements:Record<string,string>;audit:{model:string;createdAt:string;decisions:{sentenceId:string;outcome:'supported';reason:string;textDigest:string}[]};digest:string}
export const citedSentence=(s:NarrativeSentence)=>s.text.slice(0,-1)+' '+s.sourceIds.map(id=>`[${id}](#source-${id})`).join(' ')+s.text.at(-1);
export function narrativeBlocks(n:ArticleNarrative){
 const blocks:{type:'heading'|'paragraph';text:string;sentences:NarrativeSentence[]}[]=[];let section='',paragraph=-1;
 for(const s of n.sentences){
  if(s.section!==section){section=s.section;blocks.push({type:'heading',text:section,sentences:[]});paragraph=-1;}
  if(s.paragraph!==paragraph){paragraph=s.paragraph;blocks.push({type:'paragraph',text:'',sentences:[]});}
  const block=blocks.at(-1)!;block.sentences.push(s);block.text=block.sentences.map(citedSentence).join(' ');
 }
 return blocks;
}
export const narrativeMarkdown=(n:ArticleNarrative)=>narrativeBlocks(n).map(b=>b.type==='heading'?'## '+b.text:b.text).join('\n\n');
