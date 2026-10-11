// Native SQLite incident storage. No credentials, signed wire, wallets or send transports.
import {DatabaseSync} from 'node:sqlite';
import {openSync,closeSync,existsSync} from 'node:fs';
import {ensure,hash,sameHash,canonicalize,parseStrictJson,atomic} from '../core/canonical.mjs';
import {reduceCrossChainExecution} from '../core/cross-chain-execution.mjs';
export class CrossChainStore {
 constructor(path,{create=false}={}){
  if(create){ensure(!existsSync(path),'STORE_EXISTS');closeSync(openSync(path,'wx'));}
  else ensure(existsSync(path),'STORE_MISSING_NO_REINITIALIZATION');
  this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000;');
  if(create)this.db.exec(`
   CREATE TABLE metadata(version INTEGER NOT NULL CHECK(version=1)); INSERT INTO metadata VALUES(1);
   CREATE TABLE executions(id TEXT PRIMARY KEY,account TEXT NOT NULL,idempotency TEXT NOT NULL,request_hash TEXT NOT NULL,plan_hash TEXT NOT NULL,plan TEXT NOT NULL,revision INTEGER NOT NULL,head TEXT,UNIQUE(account,idempotency),UNIQUE(account,request_hash));
   CREATE TABLE reservations(execution TEXT PRIMARY KEY REFERENCES executions(id),position TEXT NOT NULL,amount TEXT NOT NULL,active INTEGER NOT NULL CHECK(active=1));
   CREATE TABLE events(execution TEXT NOT NULL REFERENCES executions(id),revision INTEGER NOT NULL,event_id TEXT NOT NULL,body TEXT NOT NULL,previous TEXT,hash TEXT NOT NULL,PRIMARY KEY(execution,revision),UNIQUE(execution,event_id));
   CREATE TABLE native_attempts(network TEXT NOT NULL,identity TEXT NOT NULL,execution TEXT NOT NULL REFERENCES executions(id),stage TEXT NOT NULL,PRIMARY KEY(network,identity),UNIQUE(execution,stage));
  `);
  ensure(this.db.prepare('SELECT version FROM metadata').get()?.version===1,'STORE_SCHEMA');
 }
 close(){this.db.close();}
 transaction(work){this.db.exec('BEGIN IMMEDIATE');try{const result=work();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 create({plan,idempotencyKey}){
  const initial=reduceCrossChainExecution(plan);ensure(typeof idempotencyKey==='string'&&idempotencyKey.length>0&&idempotencyKey.length<=512,'IDEMPOTENCY_KEY');
  return this.transaction(()=>{
   const account=plan.request.accountId,requestHash=plan.request.contentHash.digest,planHash=plan.contentHash.digest;
   const keyed=this.db.prepare('SELECT * FROM executions WHERE account=? AND idempotency=?').get(account,idempotencyKey);
   if(keyed){ensure(keyed.plan_hash===planHash,'IDEMPOTENCY_PLAN_CONFLICT');return this.read(keyed.id);}
   const intent=this.db.prepare('SELECT * FROM executions WHERE account=? AND request_hash=?').get(account,requestHash);
   if(intent){ensure(intent.plan_hash===planHash,'INTENT_PLAN_CONFLICT');return this.read(intent.id);}
   // Scope reservation by actual network/token/funds address; different binding labels cannot bypass it.
   const position=canonicalize([plan.request.sourceBinding.networkRef,plan.request.sourceBinding.fundsAddress,plan.request.sourceToken]);
   const rows=this.db.prepare('SELECT amount FROM reservations WHERE position=?').all(position),reserved=rows.reduce((n,r)=>n+atomic(r.amount),0n);
   ensure(reserved+atomic(plan.request.amountAtomic)<=atomic(plan.request.availableAtomic),'SOURCE_POSITION_RESERVED');
   const id='cross-chain-'+planHash;
   this.db.prepare('INSERT INTO executions VALUES(?,?,?,?,?,?,?,?)').run(id,account,idempotencyKey,requestHash,planHash,canonicalize(plan),0,null);
   this.db.prepare('INSERT INTO reservations VALUES(?,?,?,1)').run(id,position,plan.request.amountAtomic);
   return {executionId:id,record:initial};
  });
 }
 read(id){
  const row=this.db.prepare('SELECT * FROM executions WHERE id=?').get(id);ensure(row,'EXECUTION_MISSING');
  const plan=parseStrictJson(row.plan);ensure(plan.contentHash.digest===row.plan_hash&&plan.request.contentHash.digest===row.request_hash,'STORE_PLAN_BINDING');
  const events=this.db.prepare('SELECT * FROM events WHERE execution=? ORDER BY revision').all(id),inputs=[];let previous=null;
  events.forEach((entry,i)=>{
   ensure(entry.revision===i+1&&entry.previous===(previous?canonicalize(previous):null),'STORE_HISTORY_PREFIX');
   const event=parseStrictJson(entry.body),expected=hash('CrossChainJournal',{executionId:id,planHash:plan.contentHash,previous,event});
   ensure(entry.hash===canonicalize(expected)&&entry.event_id===event.eventId,'STORE_EVENT_HASH');previous=expected;inputs.push(event);
  });
  ensure(row.revision===events.length&&row.head===(previous?canonicalize(previous):null),'STORE_HEAD_MISMATCH');
  return {executionId:id,plan,events:inputs,record:reduceCrossChainExecution(plan,inputs)};
 }
 append(id,event,{crashAt=null}={}){
  ensure([null,'BEFORE_COMMIT','AFTER_COMMIT'].includes(crashAt),'CRASH_PHASE');
  const result=this.transaction(()=>{
   const prior=this.read(id),old=this.db.prepare('SELECT body FROM events WHERE execution=? AND event_id=?').get(id,event.eventId);
   if(old){ensure(old.body===canonicalize(event),'EVENT_ID_REPLAY_MUTATION');return prior;}
   const record=reduceCrossChainExecution(prior.plan,[...prior.events,event]);
   if(event.kind==='ATTEMPT_INTENT')this.db.prepare('INSERT INTO native_attempts VALUES(?,?,?,?)').run(event.attempt.networkRef,canonicalize(event.attempt.stage==='DESTINATION_MINT'?['cctpNonce',event.attempt.nativeIdentity]:[prior.plan.request.sourceBinding.fundsAddress,event.attempt.nativeIdentity]),id,event.attempt.stage);
   const previous=prior.record.observations.length?parseStrictJson(this.db.prepare('SELECT head FROM executions WHERE id=?').get(id).head):null;
   const h=hash('CrossChainJournal',{executionId:id,planHash:prior.plan.contentHash,previous,event});
   this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?)').run(id,record.revision,event.eventId,canonicalize(event),previous?canonicalize(previous):null,canonicalize(h));
   const updated=this.db.prepare('UPDATE executions SET revision=?,head=? WHERE id=? AND revision=?').run(record.revision,canonicalize(h),id,prior.record.revision);ensure(updated.changes===1,'STORE_REVISION_CONFLICT');
   // Reservations remain quarantined even after completion: a fresh balance observation must precede reuse.
   if(crashAt==='BEFORE_COMMIT')process.exit(71);
   return {executionId:id,record};
  });
  if(crashAt==='AFTER_COMMIT')process.exit(72);
  return result;
 }
}
