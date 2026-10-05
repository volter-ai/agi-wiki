/** Protect conventional middle initials, without suppressing actual prose boundaries. */
export function atomicSentenceCount(text:string){
 const protectedText=text.replace(/\b[A-Z][a-z]+ (?:[A-Z]\. )+[A-Z][a-z]+\b/g,name=>name.replace(/\./g,''));
 return [...new Intl.Segmenter('en',{granularity:'sentence'}).segment(protectedText)].filter(s=>/[\p{L}\p{N}]/u.test(s.segment)).length;
}
