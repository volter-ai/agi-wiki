import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {emptyKnowledge,type KnowledgeSnapshot,type SourceCapture,type KnowledgeEntity,type FactRevision,type FactAudit,type ArticleDependency} from '../shared/knowledge.js';
import {validateSchematicFact} from '../shared/schematic.js';
export const knowledgeHash=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export class KnowledgeStore {
 readonly db:DatabaseSync;
 constructor(path:string){if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);if(path!==':memory:')chmodSync(path,0o600);this.db.exec(`
 PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS captures(id TEXT PRIMARY KEY,record TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY,record TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,fact_id TEXT NOT NULL,policy_key TEXT NOT NULL,capture_job TEXT NOT NULL,record TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS audits(revision_id TEXT PRIMARY KEY REFERENCES revisions(id),record TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS approvals(revision_id TEXT PRIMARY KEY REFERENCES revisions(id),record TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS dependencies(article_id TEXT PRIMARY KEY,record TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,profile_id TEXT NOT NULL,record TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,id TEXT NOT NULL,kind TEXT NOT NULL,record TEXT NOT NULL,created_at TEXT NOT NULL) STRICT;
 `);
 for(const table of ['captures','entities','revisions','audits','approvals'])this.db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Knowledge evidence and revisions are immutable'); END; CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Knowledge evidence and revisions are immutable'); END;`);
 }
 close(){this.db.close();}
 snapshot():KnowledgeSnapshot{const k=emptyKnowledge();for(const table of ['captures','entities','revisions','audits','approvals'] as const)k[table]=this.db.prepare(`SELECT record FROM ${table} ORDER BY rowid`).all().map(r=>JSON.parse(String(r.record))) as any;return k;}
 entity(e:KnowledgeEntity){const old=this.db.prepare('SELECT record FROM entities WHERE id=?').get(e.id);if(old){if(String(old.record)!==JSON.stringify(e))throw Error('Entity identity is immutable; propose a separate entity rather than merging a name.');return;}this.db.prepare('INSERT INTO entities VALUES (?,?)').run(e.id,JSON.stringify(e));}
 capture(s:SourceCapture){const old=this.db.prepare('SELECT record FROM captures WHERE id=?').get(s.id);if(old){const existing=JSON.parse(String(old.record));if(existing.sha256!==s.sha256||existing.url!==s.url||existing.text!==s.text)throw Error('Capture identity mismatch.');return existing as SourceCapture;}this.db.prepare('INSERT INTO captures VALUES (?,?)').run(s.id,JSON.stringify(s));return s;}
 saveAuditedBatch(entities:KnowledgeEntity[],facts:FactRevision[],audits:FactAudit[]){
  if(facts.length!==audits.length||new Set(audits.map(a=>a.revisionId)).size!==facts.length||facts.some(f=>!audits.some(a=>a.revisionId===f.id)))throw Error('Every fact needs its own audit.');
  this.db.exec('BEGIN IMMEDIATE');try{
   for(const e of entities)this.entity(e);
   const allEntities=this.snapshot().entities;
   for(const f of facts)if(f.policyKey.startsWith('schematic@2:'))validateSchematicFact(f,allEntities);
   for(const f of facts){const existing=this.db.prepare('SELECT record FROM revisions WHERE id=?').get(f.id);if(existing){if(String(existing.record)!==JSON.stringify(f))throw Error('Revision replay mismatch.');continue;}if(knowledgeHash({...f,digest:undefined})!==f.digest)throw Error('Fact digest mismatch.');this.db.prepare('INSERT INTO revisions VALUES (?,?,?,?,?)').run(f.id,f.factId,f.policyKey,f.extractionJobId,JSON.stringify(f));}
   for(const a of audits){const old=this.db.prepare('SELECT record FROM audits WHERE revision_id=?').get(a.revisionId);if(old){if(String(old.record)!==JSON.stringify(a))throw Error('Audit replay mismatch.');continue;}this.db.prepare('INSERT INTO audits VALUES (?,?)').run(a.revisionId,JSON.stringify(a));}
   this.event(facts[0]?.extractionJobId||randomUUID(),'facts-audited',{revisionIds:facts.map(f=>f.id)});this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 approve(revisionId:string,digest:string,reviewer:string){
  if(!reviewer.trim()||reviewer.length>120)throw Error('Identify the local human reviewer.');
  const row=this.db.prepare('SELECT record FROM revisions WHERE id=?').get(revisionId);if(!row)throw Error('Unknown revision.');const fact:FactRevision=JSON.parse(String(row.record));
  const audit=this.db.prepare('SELECT record FROM audits WHERE revision_id=?').get(revisionId);
  if(fact.digest!==digest||!audit||JSON.parse(String(audit.record)).outcome!=='supported')throw Error('Approve an exact supported revision after reviewing its evidence.');
  this.db.prepare('INSERT OR IGNORE INTO approvals VALUES (?,?)').run(revisionId,JSON.stringify({revisionId,digest,reviewer:reviewer.trim(),approvedAt:new Date().toISOString()}));
  this.event(revisionId,'local-fact-approval',{digest,reviewer});
 }
 dependencies(articleId:string,dependencies?:ArticleDependency[]){if(dependencies)this.db.prepare('INSERT INTO dependencies VALUES (?,?) ON CONFLICT(article_id) DO UPDATE SET record=excluded.record').run(articleId,JSON.stringify(dependencies));const row=this.db.prepare('SELECT record FROM dependencies WHERE article_id=?').get(articleId);return row?JSON.parse(String(row.record)) as ArticleDependency[]:[];}
 job(id:string,profileId:string,value?:unknown){if(value)this.db.prepare('INSERT INTO jobs VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record WHERE profile_id=excluded.profile_id').run(id,profileId,JSON.stringify(value));const row=this.db.prepare('SELECT record,profile_id FROM jobs WHERE id=?').get(id);if(row&&row.profile_id!==profileId)throw Error('This source task belongs to another account.');return row?JSON.parse(String(row.record)):null;}
 jobs(profileId:string){return this.db.prepare('SELECT record FROM jobs WHERE profile_id=? ORDER BY rowid DESC').all(profileId).map(r=>JSON.parse(String(r.record)));}
 event(id:string,kind:string,record:unknown){this.db.prepare('INSERT INTO events(id,kind,record,created_at) VALUES (?,?,?,?)').run(id,kind,JSON.stringify(record),new Date().toISOString());}
}
