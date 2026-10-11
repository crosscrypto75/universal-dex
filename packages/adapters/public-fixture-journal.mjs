import {openSync,closeSync,writeFileSync,readFileSync,fsyncSync,unlinkSync,existsSync,renameSync} from 'node:fs';
import {ensure,canonicalize,parseStrictJson,hash,sameHash} from '../core/canonical.mjs';
import {s,decode,hashRef} from '../core/schema.mjs';
import {simulateExecution} from '../core/simulated-execution.mjs';

const anchorSchema={schemaVersion:s.literal(1),scope:s.literal('SIMULATED'),planHash:hashRef,eventCount:s.integer,lastHash:v=>{if(v!==null)decode(hashRef,v);},contentHash:hashRef};
function writeDurable(path,text,flags='wx'){const fd=openSync(path,flags);try{writeFileSync(fd,text);fsyncSync(fd);}finally{closeSync(fd);}}
function anchor(plan,count,lastHash){const body={schemaVersion:1,scope:'SIMULATED',planHash:plan.contentHash,eventCount:count,lastHash};return {...body,contentHash:hash('FixtureJournalAnchor',body)};}
function loadJournal(path,plan,writer=false){
 ensure(!existsSync(path+'.pending')&&!existsSync(path+'.anchor-next'),'INTERRUPTED_JOURNAL_RECONCILE_ONLY');ensure(writer||!existsSync(path+'.lock'),'JOURNAL_WRITER_OR_CRASH_RECONCILE_ONLY');
 const a=decode(anchorSchema,readFileSync(path+'.anchor','utf8'));const {contentHash,...anchorBody}=a;ensure(sameHash(contentHash,hash('FixtureJournalAnchor',anchorBody))&&sameHash(a.planHash,plan.contentHash),'JOURNAL_ANCHOR_BINDING');
 const text=readFileSync(path,'utf8');ensure(text===''||text.endsWith('\n'),'TORN_JOURNAL_RECONCILE_ONLY');let previous=null;const events=[];
 for(const line of text.split('\n').filter(Boolean)){const entry=parseStrictJson(line);ensure(Object.keys(entry).sort().join(',')==='event,previousHash,recordHash','JOURNAL_SCHEMA');const computed=hash('PublicFixtureJournal',{planHash:plan.contentHash,previousHash:previous,event:entry.event});ensure(sameHash(entry.previousHash,previous)&&sameHash(entry.recordHash,computed),'JOURNAL_INTEGRITY');events.push(entry.event);previous=computed;}
 ensure(a.eventCount===events.length&&sameHash(a.lastHash,previous),'JOURNAL_PREFIX_OR_HEAD_MISMATCH');return {events,lastHash:previous,record:simulateExecution(plan,events)};
}
export function readFixtureJournal(path,plan){return loadJournal(path,plan);}
// No existing artifact can be adopted, replaced, cleared or reanchored.
export function createFixtureJournal(path,plan){simulateExecution(plan);ensure(['','.anchor','.pending','.anchor-next','.lock'].every(suffix=>!existsSync(path+suffix)),'EXISTING_JOURNAL_RECONCILE_ONLY');writeDurable(path,'');writeDurable(path+'.anchor',canonicalize(anchor(plan,0,null)));}
// Fixture-only journal: not a production database or spending authority.
// Interrupted writes retain a pending marker; opening/resubmitting fails closed.
export function appendFixtureObservation(path,plan,event,{simulateCrashAt=null}={}){
 ensure([null,'AFTER_PENDING','AFTER_APPEND','AFTER_ANCHOR'].includes(simulateCrashAt),'UNKNOWN_CRASH_FIXTURE');const lock=openSync(path+'.lock','wx');
 try{
  const prior=loadJournal(path,plan,true);simulateExecution(plan,[...prior.events,event]);const body={previousHash:prior.lastHash,event};const entry={...body,recordHash:hash('PublicFixtureJournal',{planHash:plan.contentHash,...body})};
  writeDurable(path+'.pending',canonicalize({schemaVersion:1,scope:'SIMULATED',planHash:plan.contentHash,previousHash:prior.lastHash,nextHash:entry.recordHash,nextEventCount:prior.events.length+1}));
  if(simulateCrashAt==='AFTER_PENDING')throw Error('SIMULATED_CRASH_RECONCILE_ONLY');
  writeDurable(path,canonicalize(entry)+'\n','a');if(simulateCrashAt==='AFTER_APPEND')throw Error('SIMULATED_CRASH_RECONCILE_ONLY');
  writeDurable(path+'.anchor-next',canonicalize(anchor(plan,prior.events.length+1,entry.recordHash)));renameSync(path+'.anchor-next',path+'.anchor');
  if(simulateCrashAt==='AFTER_ANCHOR')throw Error('SIMULATED_CRASH_RECONCILE_ONLY');unlinkSync(path+'.pending');return loadJournal(path,plan,true);
 }finally{closeSync(lock);unlinkSync(path+'.lock');}
}
