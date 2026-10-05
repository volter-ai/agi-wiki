import React,{useState} from 'react';
import {validateArticleImages,type ArticleImage} from '../shared/images';

function Illustration({image}:{image:ArticleImage}){
 const [failed,setFailed]=useState(false);
 return <figure className="article-illustration">
  <a href={image.pageUrl} target="_blank" rel="noreferrer">{failed?<span className="image-unavailable">View image at source</span>:<img src={image.thumbnailUrl} alt={image.caption} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>}</a>
  <figcaption><a href={image.pageUrl} target="_blank" rel="noreferrer">{image.caption}</a><small>{image.artist} · <a href={image.licenseUrl} target="_blank" rel="noreferrer">{image.license}</a></small></figcaption>
 </figure>;
}
export default function ArticleImages({images}:{images?:ArticleImage[]}){
 let safe:ArticleImage[];try{safe=validateArticleImages(images);}catch{return null;}
 if(!safe.length)return null;
 return <aside className="article-illustrations" aria-label="Article illustration">{safe.map(image=><Illustration key={image.thumbnailUrl} image={image}/>)}</aside>;
}
