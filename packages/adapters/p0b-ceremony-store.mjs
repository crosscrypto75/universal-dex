// Durable per-stage journal. Stores public identities, never signed wire or key material.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,openSync,closeSync} from 'node:fs';
import {ensure,hash,sameHash,canonicalize,parseStrictJson} from '../core/canonical.mjs';
import {reduceCeremony} from '../core/p0b-ceremony.mjs';
export class CeremonyStore{
 constructor(path,{create=false,readOnly=false}={}){
  ensure(!(create&&readOnly),'CEREMONY_STORE_MODE');
  if(create){ensure(!existsSync(path),'CEREMONY_STORE_EXISTS');closeSync(openSync(path,'wx'));}else ensure(existsSync(path),'CEREMONY_STORE_MISSING');
  this.readOnly=readOnly;this.db=new DatabaseSync(path,{readOnly});try{this.db.exec('PRAGMA busy_timeout=5000');
  if(create){this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;'+
   'CREATE TABLE ceremonies (id TEXT PRIMARY KEY, account TEXT NOT NULL, request TEXT NOT NULL, definition TEXT NOT NULL, definition_hash TEXT NOT NULL, revision INTEGER NOT NULL, state_hash TEXT NOT NULL, journal_hash TEXT NOT NULL, UNIQUE(account,request));'+
   'CREATE TABLE events (ceremony TEXT NOT NULL, revision INTEGER NOT NULL, event_id TEXT NOT NULL, body TEXT NOT NULL, event_hash TEXT NOT NULL, prior_hash TEXT NOT NULL, journal_hash TEXT NOT NULL, PRIMARY KEY(ceremony,revision), UNIQUE(ceremony,event_id));'+
   'CREATE TABLE native_attempts (identity TEXT PRIMARY KEY, ceremony TEXT NOT NULL, stage_id TEXT NOT NULL UNIQUE);'+
   'CREATE TABLE wires (wire_hash TEXT PRIMARY KEY, tx_ref TEXT NOT NULL UNIQUE, ceremony TEXT NOT NULL, stage_id TEXT NOT NULL);');}
  else {ensure(this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ceremonies','events','native_attempts','wires')").all().length===4,'CEREMONY_STORE_PARTIAL_INITIALIZATION');if(!readOnly)this.db.exec('PRAGMA synchronous=FULL');}
  }catch(e){this.db.close();throw e;}
 }
 transact(work,crashAt){ensure(!this.readOnly,'CEREMONY_STORE_READ_ONLY');this.db.exec('BEGIN IMMEDIATE');try{const x=work();if(crashAt==='BEFORE_COMMIT')process.exit(71);this.db.exec('COMMIT');if(crashAt==='AFTER_COMMIT')process.exit(72);return x;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 create(definition){return this.transact(()=>{
  const state=reduceCeremony(definition,[]),old=this.db.prepare('SELECT id,definition_hash FROM ceremonies WHERE id=? OR (account=? AND request=?)').get(definition.ceremonyId,definition.accountId,definition.requestId);
  if(old){ensure(old.id===definition.ceremonyId&&old.definition_hash===definition.contentHash.digest,'CEREMONY_DUPLICATE_REQUEST_CONFLICT');return this.read(old.id);}
  const journal=hash('CeremonyJournalAnchor',{definitionHash:definition.contentHash});
  this.db.prepare('INSERT INTO ceremonies VALUES(?,?,?,?,?,0,?,?)').run(definition.ceremonyId,definition.accountId,definition.requestId,canonicalize(definition),definition.contentHash.digest,state.contentHash.digest,journal.digest);
  return this.read(definition.ceremonyId);
 });}
 read(id){
  const row=this.db.prepare('SELECT * FROM ceremonies WHERE id=?').get(id);ensure(row,'CEREMONY_NOT_FOUND');
  const definition=parseStrictJson(row.definition);ensure(definition.contentHash.digest===row.definition_hash,'CEREMONY_DEFINITION_HASH');
  const rows=this.db.prepare('SELECT * FROM events WHERE ceremony=? ORDER BY revision').all(id),events=[];let journal=hash('CeremonyJournalAnchor',{definitionHash:definition.contentHash});
  for(const [i,r]of rows.entries()){
   const e=parseStrictJson(r.body),eventHash=hash('CeremonyJournalEvent',e),next=hash('CeremonyJournalLink',{prior:journal,eventHash});
   ensure(r.revision===i+1&&r.prior_hash===journal.digest&&r.event_hash===eventHash.digest&&r.journal_hash===next.digest&&r.event_id===e.eventId,'CEREMONY_JOURNAL_TORN_OR_CHANGED');
   events.push(e);journal=next;
  }
  const state=reduceCeremony(definition,events);ensure(rows.length===row.revision&&state.contentHash.digest===row.state_hash&&journal.digest===row.journal_hash,'CEREMONY_STORE_HEAD_MISMATCH');
  // Native/wire reservations are durable crash boundaries, not removable cache rows.
  for(const spec of definition.stages){const stage=state.stages[spec.key];if(stage.signRequested){
   const native=this.db.prepare('SELECT identity,ceremony,stage_id FROM native_attempts WHERE stage_id=?').get(stage.stageId);const expected=spec.role==='DESTINATION_EFFECT'?spec.networkRef+':destination-nonce:'+stage.prepared.nativeIdentity:spec.networkRef+':'+spec.actor+':'+stage.prepared.nativeIdentity;ensure(native?.ceremony===id&&native.identity===expected,'CEREMONY_NATIVE_ANCHOR_MISSING');
  }if(stage.signedWireHash){const w=this.db.prepare('SELECT * FROM wires WHERE wire_hash=?').get(stage.signedWireHash.digest);ensure(w?.ceremony===id&&w.stage_id===stage.stageId&&w.tx_ref===stage.transactionRef,'CEREMONY_WIRE_ANCHOR_MISSING');}}
  return {definition,state,events,journalHash:journal};
 }
 append(id,event,{crashAt=null,exclusive=false}={}){
  return this.transact(()=>{
   const current=this.read(id),old=current.events.find(x=>x.eventId===event.eventId);
   if(old){ensure(!exclusive,'CEREMONY_EXCLUSIVE_CLAIM_ALREADY_TAKEN');ensure(canonicalize(old)===canonicalize(event),'CEREMONY_EVENT_REPLAY_MUTATION');return current;}
   const state=reduceCeremony(current.definition,[...current.events,event]),stage=state.stages[event.stageKey??state.activeStage];
   if(event.kind==='SIGN_REQUESTED'){
    const spec=current.definition.stages.find(x=>x.key===event.stageKey),identity=spec.role==='DESTINATION_EFFECT'?spec.networkRef+':destination-nonce:'+stage.prepared.nativeIdentity:spec.networkRef+':'+spec.actor+':'+stage.prepared.nativeIdentity;
    this.db.prepare('INSERT INTO native_attempts VALUES(?,?,?)').run(identity,id,stage.stageId);
   }
   if(event.kind==='SIGNED')this.db.prepare('INSERT INTO wires VALUES(?,?,?,?)').run(event.signedWireHash.digest,event.transactionRef,id,stage.stageId);
   const eventHash=hash('CeremonyJournalEvent',event),journal=hash('CeremonyJournalLink',{prior:current.journalHash,eventHash});
   this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?)').run(id,state.revision,event.eventId,canonicalize(event),eventHash.digest,current.journalHash.digest,journal.digest);
   if(crashAt==='AFTER_EVENT_BEFORE_HEAD')process.exit(73);
   const changed=this.db.prepare('UPDATE ceremonies SET revision=?,state_hash=?,journal_hash=? WHERE id=? AND revision=?').run(state.revision,state.contentHash.digest,journal.digest,id,current.state.revision);
   ensure(changed.changes===1,'CEREMONY_STORE_CAS');return {definition:current.definition,state,events:[...current.events,event],journalHash:journal};
  },crashAt);
 }
 list(){return this.db.prepare('SELECT id FROM ceremonies ORDER BY id').all().map(r=>this.read(r.id));}
 close(){this.db.close();}
}
