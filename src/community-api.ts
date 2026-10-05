export const communityOnly=import.meta.env.VITE_COMMUNITY_ONLY==='true';
export async function communityApi(path:string,method='GET',body?:unknown){
 const headers:Record<string,string>={'Content-Type':'application/json','X-WikiChat-Client':'1'};
 if(!communityOnly&&method!=='GET'){
   const session=await fetch('/api/session').then(r=>r.json());headers['X-WikiChat-Token']=session.csrf;
 }
 const response=await fetch('/api/community'+path,{method,headers,credentials:'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'The request failed.');return data;
}
