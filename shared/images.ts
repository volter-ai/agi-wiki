/** Commons metadata is checked by the app; publication still requires human approval. */
export interface ImageCandidate {title:string;pageUrl:string;thumbnailUrl:string;artist:string;license:string;licenseUrl:string;retrievedAt:string;description?:string}
export interface ArticleImage extends ImageCandidate {caption:string}
const plain=(value:unknown)=>typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().slice(0,500):'';
function trustedUrl(value:unknown,host:string,path:string){
 try{const u=new URL(String(value));return u.protocol==='https:'&&u.hostname===host&&!u.port&&!u.username&&!u.password&&u.pathname.startsWith(path)?u.href:undefined;}catch{return undefined;}
}
export function imageCandidates(data:any):ImageCandidate[]{
 const pages=Array.isArray(data?.query?.pages)?data.query.pages:[];
 return pages.sort((a:any,b:any)=>(a.index??0)-(b.index??0)).flatMap((p:any)=>{
  const i=p.imageinfo?.[0],m=i?.extmetadata;if(!i||!m||!['image/jpeg','image/png','image/webp'].includes(i.mime)||i.thumbmime&&!['image/jpeg','image/png','image/webp'].includes(i.thumbmime))return [];
  const pageUrl=trustedUrl(i.descriptionurl,'commons.wikimedia.org','/wiki/File:');
  const thumbnailUrl=trustedUrl(i.thumburl,'upload.wikimedia.org','/wikipedia/commons/')||trustedUrl(i.thumburl,'thumb.wikimedia.org','/wikipedia/commons/');
  const license=plain(m.LicenseShortName?.value),artist=plain(m.Artist?.value);
  const licenseUrl=trustedUrl(m.LicenseUrl?.value,'creativecommons.org','/licenses/')||trustedUrl(m.LicenseUrl?.value,'creativecommons.org','/publicdomain/')||trustedUrl(m.LicenseUrl?.value,'commons.wikimedia.org','/wiki/Help:Public_domain');
  if(!pageUrl||!thumbnailUrl||!artist||!licenseUrl||! /^(?:CC BY(?:-SA)? (?:[1-4]\.0|2\.5)|CC0|Public domain)$/i.test(license))return [];
  const licensePath=new URL(licenseUrl).pathname.replace(/\/$/,'');
  const cc=license.match(/^CC (BY(?:-SA)?) ((?:[1-4]\.0|2\.5))$/i);
  if(cc&&licensePath!==`/licenses/${cc[1].toLowerCase()}/${cc[2]}`)return [];
  if(license==='CC0'&&licensePath!=='/publicdomain/zero/1.0')return [];
  if(license==='Public domain'&&!['/publicdomain/mark/1.0','/wiki/Help:Public_domain'].includes(licensePath))return [];
  if(/nonfree|fair use|copyrighted/i.test(plain(m.UsageTerms?.value))||String(m.Restrictions?.value||'').trim())return [];
  return [{title:plain(p.title).replace(/^File:/,''),pageUrl,thumbnailUrl,artist,license,licenseUrl,retrievedAt:new Date().toISOString(),...(plain(m.ImageDescription?.value)?{description:plain(m.ImageDescription.value)}:{})}];
 }).slice(0,3);
}
export async function findImages(query:string,signal:AbortSignal,fetcher:typeof fetch=fetch){
 if(!query.trim()||query.length>160)throw Error('Invalid image query.');
 const url=new URL('https://commons.wikimedia.org/w/api.php');
 url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'6',prop:'imageinfo',iiprop:'url|mime|extmetadata',iiurlwidth:'400',iiextmetadatafilter:'Artist|LicenseShortName|LicenseUrl|UsageTerms|Restrictions|ImageDescription',format:'json',formatversion:'2'}).toString();
 const response=await fetcher(url,{signal,redirect:'manual',headers:{'User-Agent':'WikiChat/1.0 (local image research)'}});
 if(!response.ok)throw Error('Commons image search is unavailable.');
 return imageCandidates(await response.json());
}

// Captions are asset labels, not new factual claims written outside the factoid audit.
export const imageCaption=(title:string)=>title.replace(/\.[a-z0-9]{2,5}$/i,'').replace(/_/g,' ');
export function validateArticleImages(raw:unknown):ArticleImage[]{
 if(raw===undefined)return [];
 if(!Array.isArray(raw)||raw.length>1)throw Error('An article may have at most one lead illustration.');
 return raw.map((i:any)=>{
  if(!i||['title','artist','license','licenseUrl','pageUrl','thumbnailUrl','retrievedAt','caption'].some(k=>typeof i[k]!=='string'||!i[k].trim()||i[k].length>1800)||i.title.length>300||i.artist.length>500||!Number.isFinite(Date.parse(i.retrievedAt))||i.caption!==imageCaption(i.title)||/[<>\u0000-\u001f]/.test(i.title+i.artist+i.caption))throw Error('Invalid article illustration.');
  const [safe]=imageCandidates({query:{pages:[{title:i.title,imageinfo:[{mime:'image/png',descriptionurl:i.pageUrl,thumburl:i.thumbnailUrl,extmetadata:{Artist:{value:i.artist},LicenseShortName:{value:i.license},LicenseUrl:{value:i.licenseUrl}}}]}]}});
  if(!safe||['title','artist','license','licenseUrl','pageUrl','thumbnailUrl'].some(k=>(safe as any)[k]!==i[k]))throw Error('Illustrations require a trusted Commons file, credit and reusable licence.');
  return {...safe,retrievedAt:i.retrievedAt,caption:i.caption};
 });
}
export function imageMarkdown(images:ArticleImage[]=[]){
 return validateArticleImages(images).map(i=>`[![${i.caption.replace(/[\\\[\]]/g,'\\$&')}](${i.thumbnailUrl})](${i.pageUrl})\n\n${i.caption} · ${i.artist} · [${i.license}](${i.licenseUrl})`).join('\n\n');
}
