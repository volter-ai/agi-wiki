export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T=Record<string,unknown>>(): Promise<T|null>;
  all<T=Record<string,unknown>>(): Promise<{results:T[]}>;
  run(): Promise<{meta:{changes:number}}>;
}
export interface Database { prepare(sql:string):Statement; batch(statements:Statement[]):Promise<unknown[]> }
export interface Bucket { put(key:string,value:string,options?:unknown):Promise<unknown>; get(key:string):Promise<{text():Promise<string>}|null> }
export interface Env {
  DB:Database; ARTICLES:Bucket;
  ASSETS?:{fetch(request:Request):Promise<Response>};
  MODE?:string; PUBLIC_ORIGIN:string; AUTH_SECRET:string;
  RESEND_API_KEY?:string; RESEND_FROM?:string; OPENAI_API_KEY?:string;
  REVIEW_MODEL?:string; ADMIN_EMAILS?:string;
}
export interface Context { waitUntil(promise:Promise<unknown>):void }
export interface User { id:string;email:string;username:string;bio:string;role:string;blocked:number;created_at:number }
export interface Submission { id:string;author_id:string;username?:string;title:string;topic_key:string;policy_key:string;policy_name:string;digest:string;object_key:string;status:string;created_at:number;published_at:number|null;moderation:string;generation_model:string }
export class HttpError extends Error { constructor(public status:number,message:string){super(message)} }
export const now=()=>Math.floor(Date.now()/1000);
export function localDevelopment(env:Env,request?:Request){return env.MODE==='development'&&/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.PUBLIC_ORIGIN)&&(!request||['127.0.0.1','localhost'].includes(new URL(request.url).hostname));}
