// Provider-neutral stage ledger. This module cannot sign, send or infer human consent.
import {ensure,hash,sameHash,snapshot,canonicalize,atomic} from './canonical.mjs';
import {s,decode,hashRef,network,fresh} from './schema.mjs';
const stageSchema={key:s.string,prefix:s.string,networkRef:network,actor:s.string,nativeCap:s.positive,role:s.enum(['PREREQUISITE','SOURCE_APPROVAL','SOURCE_EFFECT','DESTINATION_EFFECT'])};
const definitionSchema={schemaVersion:s.literal(1),scope:s.enum(['TESTNET_CEREMONY_PREPARATION','SIMULATED_CEREMONY']),ceremonyId:s.string,requestId:s.string,accountId:s.string,providerRef:s.string,bindingsHash:hashRef,routeHash:hashRef,deploymentHash:hashRef,configurationHash:hashRef,sourceWallet:s.string,destinationOwner:s.string,destinationAta:s.string,feePayer:s.string,sourceToken:s.string,destinationToken:s.string,amountAtomic:s.positive,minimumDestinationAtomic:s.positive,feeCaps:{protocolAtomic:s.atomic,sourceNativeAtomic:s.positive,destinationNativeAtomic:s.positive},stages:s.array(stageSchema,4,4),refundSupport:s.literal('UNAVAILABLE')};
const preparedSchema={schemaVersion:s.literal(1),scope:s.enum(['READ_ONLY_TESTNET_JIT','SIMULATED_CEREMONY']),ceremonyHash:hashRef,stageId:s.string,stageKey:s.string,networkRef:network,actor:s.string,bindingsHash:hashRef,routeHash:hashRef,deploymentHash:hashRef,configurationHash:hashRef,priorEvidenceHash:hashRef,observedAt:s.time,validUntil:s.time,nativeMaximumAtomic:s.positive,nativeIdentity:s.string,candidateHash:hashRef,observationHash:hashRef,intentHash:hashRef,summary:{chain:s.string,asset:s.string,amountAtomic:s.atomic,recipient:s.string,authorizes:s.string,excludes:s.array(s.string,1,12)},canSign:s.literal(false),canSend:s.literal(false)};
const proofSchema={schemaVersion:s.literal(1),scope:s.enum(['READ_ONLY_TESTNET','SIMULATED_CEREMONY']),ceremonyHash:hashRef,stageId:s.string,stageKey:s.string,bindingsHash:hashRef,routeHash:hashRef,deploymentHash:hashRef,configurationHash:hashRef,priorEvidenceHash:hashRef,transactionRef:s.string,preparedHash:s.optional(hashRef),signedWireHash:s.optional(hashRef),finality:s.literal('FINALIZED'),outcome:s.enum(['SUCCESS','REVERTED','PREEXISTING_EXACT']),nativeDebitAtomic:s.atomic,observedAt:s.time,chainEvidenceHash:hashRef};
const authorizationSchema={schemaVersion:s.literal(1),scope:s.enum(['EXPLICIT_HUMAN_STAGE_ONLY','SIMULATED_CEREMONY']),authorizationId:s.string,ceremonyHash:hashRef,stageId:s.string,preparedHash:hashRef,intentHash:hashRef,freshCheckHash:hashRef,authorizedAt:s.time,expiresAt:s.time,actor:s.string,networkRef:network,maxNativeDebitAtomic:s.positive,acknowledgedAction:s.string};
const eventSchema={schemaVersion:s.literal(1),ceremonyHash:hashRef,eventId:s.string,expectedRevision:s.integer,at:s.time,kind:s.enum(['PREPARE','AUTHORIZATION_REQUIRED','AUTHORIZE','SIGN_REQUESTED','SIGNED','SEND_INTENT','RPC_SEND_BEGIN','RPC_SEND_DISPATCH','RPC_SEND_END','AMBIGUOUS','FINALIZED','WATCH_PENDING','WATCH_AVAILABLE','WATCH_INVALID','WATCH_UNKNOWN','PROVIDER_CONTRADICTION','FAIL_BEFORE_SUBMISSION','DESTINATION_UNAVAILABLE']),stageKey:s.optional(s.string),prepared:s.optional(x=>verifySnapshot('CeremonyStagePreparation',preparedSchema,x)),authorization:s.optional(x=>verifySnapshot('HumanStageAuthorization',authorizationSchema,x)),signedWireHash:s.optional(hashRef),transactionRef:s.optional(s.string),proof:s.optional(x=>verifySnapshot('CeremonyStageEvidence',proofSchema,x)),attestationHash:s.optional(hashRef),messageHash:s.optional(hashRef),reason:s.optional(s.string)};
export function verifySnapshot(domain,schema,input){
 const {contentHash,...body}=input??{};decode(schema,body);ensure(sameHash(contentHash,hash(domain,body)),'CEREMONY_SNAPSHOT_HASH:'+domain);return input;
}
export function createCeremonyDefinition(input){
 const d=decode(definitionSchema,input);ensure(new Set(d.stages.map(x=>x.key)).size===4&&new Set(d.stages.map(x=>x.prefix)).size===4,'CEREMONY_STAGE_KEYS');
 ensure(canonicalize(d.stages.map(x=>x.role))===canonicalize(['PREREQUISITE','SOURCE_APPROVAL','SOURCE_EFFECT','DESTINATION_EFFECT']),'CEREMONY_STAGE_ORDER');
 ensure(atomic(d.minimumDestinationAtomic)<=atomic(d.amountAtomic)&&atomic(d.amountAtomic)-atomic(d.feeCaps.protocolAtomic)>=atomic(d.minimumDestinationAtomic),'CEREMONY_ECONOMICS');
 d.stages.forEach(x=>ensure(atomic(x.nativeCap)<=atomic(x.networkRef===d.stages[0].networkRef?d.feeCaps.destinationNativeAtomic:d.feeCaps.sourceNativeAtomic),'CEREMONY_STAGE_CAP'));
 return snapshot('CrossChainCeremonyDefinition',d);
}
export function stageId(d,key){ensure(d.stages.some(x=>x.key===key),'CEREMONY_UNKNOWN_STAGE');return d.ceremonyId+':'+key;}
export function createStagePreparation(body){return snapshot('CeremonyStagePreparation',decode(preparedSchema,body));}
export function createStageEvidence(body){return snapshot('CeremonyStageEvidence',decode(proofSchema,body));}
export function createStageAuthorization(body){return snapshot('HumanStageAuthorization',decode(authorizationSchema,body));}
export function priorEvidenceHash(d,stages,key){
 const i=d.stages.findIndex(x=>x.key===key);return hash('CeremonyPriorFinality',{ceremonyHash:d.contentHash,evidence:d.stages.slice(0,i).map(x=>stages[x.key].evidence?.contentHash??null)});
}
export function reduceCeremony(definition,events){
 const d=verifySnapshot('CrossChainCeremonyDefinition',definitionSchema,definition),states=Object.fromEntries(d.stages.map(x=>[x.key,{stageId:stageId(d,x.key),status:'LOCKED',prepared:null,authorization:null,signRequested:false,signedWireHash:null,transactionRef:null,sendIntent:false,rpcBegin:false,rpcEnd:false,evidence:null,reconciliationStatus:'NOT_NEEDED'}]));
 let revision=0,state='P0B_PREPARED',watch={status:'LOCKED',messageHash:null,attestationHash:null},lastAt=null,terminal=null;const seen=new Map(),authorizations=new Set(),signedWires=new Set(),transactionRefs=new Set();
 const activeKey=()=>d.stages.find(x=>states[x.key].status!=='FINALIZED')?.key??null;
 for(const raw of events){
  const e=decode(eventSchema,raw),duplicate=seen.get(e.eventId);if(duplicate){ensure(canonicalize(e)===canonicalize(duplicate),'CEREMONY_EVENT_REPLAY_MUTATION');continue;}
  ensure(e.expectedRevision===revision&&sameHash(e.ceremonyHash,d.contentHash),'CEREMONY_REVISION_OR_BINDING');
  ensure(!lastAt||Date.parse(e.at)>=Date.parse(lastAt),'CEREMONY_BACKDATED_EVENT');lastAt=e.at;
  const key=e.stageKey??activeKey(),spec=d.stages.find(x=>x.key===key),s0=states[key],idx=d.stages.findIndex(x=>x.key===key);
  const prior=key?priorEvidenceHash(d,states,key):null;
  if(['WATCH_PENDING','WATCH_AVAILABLE','WATCH_INVALID','WATCH_UNKNOWN','PROVIDER_CONTRADICTION'].includes(e.kind)){
   ensure(states[d.stages[2].key].status==='FINALIZED','CEREMONY_BURN_NOT_FINAL');
   if(e.kind==='WATCH_PENDING'){ensure(!watch.attestationHash,'CEREMONY_PROVIDER_REGRESSION');watch.status='ATTESTATION_PENDING';state='ATTESTATION_PENDING';}
   if(e.kind==='WATCH_AVAILABLE'){
    ensure(e.messageHash&&e.attestationHash,'CEREMONY_ATTESTATION_FIELDS');
    ensure(!watch.messageHash||sameHash(watch.messageHash,e.messageHash),'CEREMONY_MESSAGE_MUTATION');
    ensure(!watch.attestationHash||sameHash(watch.attestationHash,e.attestationHash),'CEREMONY_ATTESTATION_MUTATION');
    watch={status:'ATTESTATION_AVAILABLE',messageHash:e.messageHash,attestationHash:e.attestationHash};if(terminal==='UNKNOWN'&&!Object.values(states).some(x=>x.status==='UNKNOWN')){terminal=null;state=Object.values(states).every(x=>x.status==='FINALIZED')?'COMPLETED':'ATTESTATION_AVAILABLE';}if(activeKey()===d.stages[3].key&&states[d.stages[3].key].status==='LOCKED')state='ATTESTATION_AVAILABLE';
   }
   if(e.kind==='WATCH_INVALID'||e.kind==='WATCH_UNKNOWN'||e.kind==='PROVIDER_CONTRADICTION'){watch.status=e.kind==='WATCH_INVALID'?'ATTESTATION_INVALID':e.kind==='WATCH_UNKNOWN'?'UNKNOWN_RECONCILIATION_REQUIRED':'PROVIDER_CONTRADICTION';terminal='UNKNOWN';state='UNKNOWN';}
  }else if(e.kind==='FAIL_BEFORE_SUBMISSION'){
   ensure(!Object.values(states).some(x=>x.signRequested||x.sendIntent),'CEREMONY_POSSIBLE_EFFECT');terminal='FAILED_BEFORE_SUBMISSION';state=terminal;
  }else if(e.kind==='DESTINATION_UNAVAILABLE'){
   ensure(states[d.stages[2].key].status==='FINALIZED','CEREMONY_BURN_NOT_FINAL');terminal='PARTIAL';state=terminal;
  }else {
   ensure(spec&&s0,'CEREMONY_STAGE_REQUIRED');
   if(e.kind==='FINALIZED'){
    const p=e.proof;ensure(p&&sameHash(p.ceremonyHash,d.contentHash)&&p.stageId===s0.stageId&&p.stageKey===key&&sameHash(p.bindingsHash,d.bindingsHash)&&sameHash(p.routeHash,d.routeHash)&&sameHash(p.deploymentHash,d.deploymentHash)&&sameHash(p.configurationHash,d.configurationHash)&&sameHash(p.priorEvidenceHash,prior),'CEREMONY_PROOF_BINDING');
    ensure((d.scope==='SIMULATED_CEREMONY')===(p.scope==='SIMULATED_CEREMONY'),'CEREMONY_EVIDENCE_SCOPE');
    if(s0.evidence){ensure(sameHash(s0.evidence.contentHash,p.contentHash),'CEREMONY_RECEIPT_MUTATION');}
    else{
     ensure(d.stages.slice(0,idx).every(x=>states[x.key].status==='FINALIZED'),'CEREMONY_PRIOR_FINALITY');
     ensure(atomic(p.nativeDebitAtomic)<=atomic(s0.prepared?.nativeMaximumAtomic??spec.nativeCap),'CEREMONY_ACTUAL_STAGE_FEE');
     if(p.outcome==='PREEXISTING_EXACT')ensure(['PREREQUISITE','SOURCE_APPROVAL'].includes(spec.role)&&!s0.signRequested&&!s0.sendIntent&&p.nativeDebitAtomic==='0','CEREMONY_UNSAFE_SKIP');
     else ensure(s0.sendIntent&&s0.transactionRef===p.transactionRef&&p.preparedHash&&sameHash(p.preparedHash,s0.prepared.contentHash)&&p.signedWireHash&&sameHash(p.signedWireHash,s0.signedWireHash),'CEREMONY_EXACT_SUBMISSION_RECEIPT');
     s0.evidence=p;s0.reconciliationStatus=p.outcome==='REVERTED'?'FINALIZED_REVERTED':'FINALIZED_EXACT';
     s0.status=p.outcome==='REVERTED'?'REVERTED':'FINALIZED';
     terminal=p.outcome==='REVERTED'?'PARTIAL':terminal==='UNKNOWN'&&!Object.values(states).some(x=>x.status==='UNKNOWN')?null:terminal;
    }
    if(!terminal)state=Object.values(states).every(x=>x.status==='FINALIZED')?'COMPLETED':spec.prefix+'_FINALIZED';else state=terminal;
   }else {
    ensure(!terminal&&key===activeKey(),'CEREMONY_ONLY_CURRENT_STAGE');
    if(e.kind==='PREPARE'){
     ensure(!s0.signRequested&&!s0.sendIntent&&['LOCKED','PREPARED','AUTHORIZATION_REQUIRED','AUTHORIZED'].includes(s0.status),'CEREMONY_PREPARE_AFTER_POSSIBLE_EFFECT');
     const p=e.prepared;ensure(p&&p.stageId===s0.stageId&&p.stageKey===key&&p.networkRef===spec.networkRef&&p.actor===spec.actor&&sameHash(p.ceremonyHash,d.contentHash)&&sameHash(p.bindingsHash,d.bindingsHash)&&sameHash(p.routeHash,d.routeHash)&&sameHash(p.deploymentHash,d.deploymentHash)&&sameHash(p.configurationHash,d.configurationHash)&&sameHash(p.priorEvidenceHash,prior),'CEREMONY_PREPARATION_BINDING');
     ensure((d.scope==='SIMULATED_CEREMONY')===(p.scope==='SIMULATED_CEREMONY'),'CEREMONY_PREPARATION_SCOPE');
     const {contentHash:ph,intentHash:ih,...intentBody}=p;ensure(sameHash(ih,hash('CeremonyExactStageIntent',intentBody)),'CEREMONY_INTENT_MUTATION');
     if(spec.networkRef==='eip155:84532:base-sepolia')atomic(p.nativeIdentity);
     ensure(fresh(p.observedAt,p.validUntil,e.at)&&Date.parse(p.validUntil)-Date.parse(p.observedAt)<=60000,'CEREMONY_STALE_PREPARATION');
     ensure(atomic(p.nativeMaximumAtomic)<=atomic(spec.nativeCap),'CEREMONY_PREPARED_STAGE_CAP');
     const spent=d.stages.filter(x=>x.networkRef===spec.networkRef).reduce((n,x)=>n+atomic(states[x.key].evidence?.nativeDebitAtomic??'0'),0n);
     ensure(spent+atomic(p.nativeMaximumAtomic)<=atomic(spec.networkRef===d.stages[0].networkRef?d.feeCaps.destinationNativeAtomic:d.feeCaps.sourceNativeAtomic),'CEREMONY_PREPARED_TOTAL_FEE_CAP');
     if(spec.role==='DESTINATION_EFFECT')ensure(watch.status==='ATTESTATION_AVAILABLE','CEREMONY_ATTESTATION_NOT_VALID');
     s0.prepared=p;s0.authorization=null;s0.status='PREPARED';state=spec.prefix+'_PREPARED';
    }else if(e.kind==='AUTHORIZATION_REQUIRED'){
     ensure(s0.status==='PREPARED'&&fresh(s0.prepared.observedAt,s0.prepared.validUntil,e.at),'CEREMONY_NOT_FRESH_PREPARED');s0.status='AUTHORIZATION_REQUIRED';state=spec.prefix+'_AUTHORIZATION_REQUIRED';
    }else if(e.kind==='AUTHORIZE'){
     const a=e.authorization;ensure(s0.status==='AUTHORIZATION_REQUIRED'&&a&&fresh(s0.prepared.observedAt,s0.prepared.validUntil,e.at),'CEREMONY_NOT_AUTHORIZABLE');
     ensure((d.scope==='SIMULATED_CEREMONY')===(a.scope==='SIMULATED_CEREMONY'),'CEREMONY_AUTHORIZATION_SCOPE');
     ensure(a.stageId===s0.stageId&&sameHash(a.ceremonyHash,d.contentHash)&&sameHash(a.preparedHash,s0.prepared.contentHash)&&sameHash(a.intentHash,s0.prepared.intentHash)&&a.actor===spec.actor&&a.networkRef===spec.networkRef&&a.maxNativeDebitAtomic===s0.prepared.nativeMaximumAtomic&&a.acknowledgedAction===s0.prepared.summary.authorizes,'CEREMONY_CROSS_STAGE_AUTHORIZATION');
     ensure(a.authorizedAt===e.at&&fresh(a.authorizedAt,a.expiresAt,e.at)&&Date.parse(a.expiresAt)<=Date.parse(s0.prepared.validUntil)&&!authorizations.has(a.authorizationId),'CEREMONY_AUTHORIZATION_REPLAY_OR_EXPIRY');
     authorizations.add(a.authorizationId);s0.authorization=a;s0.status='AUTHORIZED';state=spec.prefix+'_AUTHORIZED';
    }else if(e.kind==='SIGN_REQUESTED'){
     ensure(s0.status==='AUTHORIZED'&&!s0.signRequested&&fresh(s0.prepared.observedAt,s0.prepared.validUntil,e.at)&&fresh(s0.authorization.authorizedAt,s0.authorization.expiresAt,e.at),'CEREMONY_SIGN_DENIED');
     s0.signRequested=true;s0.status='UNKNOWN';s0.reconciliationStatus='SIGN_RESULT_REQUIRED';state='UNKNOWN';
    }else if(e.kind==='SIGNED'){
     ensure(s0.signRequested&&!s0.signedWireHash&&!s0.sendIntent&&e.signedWireHash&&e.transactionRef&&!signedWires.has(e.signedWireHash.digest)&&!transactionRefs.has(e.transactionRef),'CEREMONY_SIGNED_REPLAY');
     s0.signedWireHash=e.signedWireHash;s0.transactionRef=e.transactionRef;s0.status='SIGNED';s0.reconciliationStatus='SIGNED_NOT_SENT';signedWires.add(e.signedWireHash.digest);transactionRefs.add(e.transactionRef);state='UNKNOWN';
    }else if(e.kind==='SEND_INTENT'){
     ensure(s0.status==='SIGNED'&&!s0.sendIntent&&fresh(s0.prepared.observedAt,s0.prepared.validUntil,e.at)&&fresh(s0.authorization.authorizedAt,s0.authorization.expiresAt,e.at),'CEREMONY_SEND_DENIED');
     s0.sendIntent=true;s0.status='UNKNOWN';s0.reconciliationStatus='RECONCILE';state='UNKNOWN';
    }else if(e.kind==='RPC_SEND_BEGIN'){ensure(s0.sendIntent&&!s0.rpcBegin&&!s0.rpcEnd,'CEREMONY_DUPLICATE_SEND');s0.rpcBegin=true;s0.status='UNKNOWN';state='UNKNOWN';}
    else if(e.kind==='RPC_SEND_DISPATCH'){ensure(s0.rpcBegin&&!s0.rpcDispatch&&!s0.rpcEnd,'CEREMONY_DUPLICATE_DISPATCH');ensure(fresh(s0.prepared.observedAt,s0.prepared.validUntil,e.at)&&fresh(s0.authorization.authorizedAt,s0.authorization.expiresAt,e.at),'CEREMONY_EXPIRED_DISPATCH_AUTHORITY');s0.rpcDispatch=true;s0.status='UNKNOWN';state='UNKNOWN';}
    else if(e.kind==='RPC_SEND_END'){ensure(s0.rpcBegin&&!s0.rpcEnd&&e.transactionRef===s0.transactionRef,'CEREMONY_SEND_RESPONSE_BINDING');s0.rpcEnd=true;s0.status='SUBMITTED';s0.reconciliationStatus='WAIT_FINALITY';state=spec.prefix+'_SUBMITTED';}
    else if(e.kind==='AMBIGUOUS'){ensure(s0.signRequested||s0.sendIntent,'CEREMONY_NO_POSSIBLE_EFFECT');s0.status='UNKNOWN';s0.reconciliationStatus='RECONCILE';state='UNKNOWN';}
   }
  }
  for(const net of [d.stages[0].networkRef,d.stages[1].networkRef]){
   const debit=d.stages.filter(x=>x.networkRef===net).reduce((n,x)=>n+atomic(states[x.key].evidence?.nativeDebitAtomic??'0'),0n),cap=net===d.stages[0].networkRef?d.feeCaps.destinationNativeAtomic:d.feeCaps.sourceNativeAtomic;
   ensure(debit<=atomic(cap),'CEREMONY_AGGREGATE_ACTUAL_FEES');
  }
  seen.set(e.eventId,e);revision++;
 }
 if(terminal)state=terminal;
 const key=activeKey(),burnFinal=states[d.stages[2].key].status==='FINALIZED',anySend=Object.values(states).some(x=>x.sendIntent),active=states[key];
 const publicState=['UNKNOWN','PARTIAL','FAILED_BEFORE_SUBMISSION','COMPLETED'].includes(state)?state:burnFinal?'SETTLING':active?.status==='AUTHORIZED'||active?.status==='SIGNED'?'AUTHORIZED':anySend?'SUBMITTED':'PREPARED';
 return snapshot('CrossChainCeremonyState',{schemaVersion:1,scope:d.scope,ceremonyHash:d.contentHash,revision,state,publicState,activeStage:key,stages:states,watch,lastEventAt:lastAt,nextAction:state==='UNKNOWN'?'RECONCILE':state==='PARTIAL'?'RECONCILE_PARTIAL':state==='COMPLETED'?'NON_AUTHORITATIVE_HANDOFF':active?.status==='AUTHORIZATION_REQUIRED'?'EXACT_STAGE_HUMAN_GATE':'READ_ONLY_JIT_OR_RECONCILE',canSign:false,canSend:false,refundSupport:'UNAVAILABLE'});
}
export function ceremonyEvent(d,state,kind,fields={},at=new Date().toISOString()){
 return {schemaVersion:1,ceremonyHash:d.contentHash,eventId:d.ceremonyId+':event:'+state.revision,expectedRevision:state.revision,at,kind,...fields};
}
