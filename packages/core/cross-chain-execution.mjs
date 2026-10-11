// Pure failure-first incident model. All authorization/receipt events are explicitly SIMULATED.
import {ensure,hash,sameHash,snapshot,canonicalize,atomic} from './canonical.mjs';
import {decode,s,hashRef,network} from './schema.mjs';
import {verifyCrossChainPreparation} from './cross-chain.mjs';
const attemptSchema={attemptId:s.string,stage:s.enum(['SOURCE_APPROVAL','SOURCE_BURN','DESTINATION_MINT']),networkRef:network,transactionRef:s.string,payloadHash:hashRef,nativeIdentity:s.string,maximumNativeFeeAtomic:s.atomic};
const proofSchema={transactionRef:s.string,networkRef:network,recipient:s.string,token:s.string,amountAtomic:s.atomic,finality:s.enum(['FINALIZED','PENDING']),correlationHash:hashRef,nativeFeeAtomic:s.atomic};
export const crossChainEventSchema={schemaVersion:s.literal(1),scope:s.literal('SIMULATED'),eventId:s.string,planHash:hashRef,expectedRevision:s.integer,at:s.time,
 kind:s.enum(['AUTHORIZATION','ATTEMPT_INTENT','SEND_RESPONSE','RPC_TIMEOUT','RECONCILE_SOURCE','MESSAGE_OBSERVED','ATTESTATION_OBSERVED','RECONCILE_DESTINATION','PROVIDER_STATUS','REORG','DESTINATION_UNAVAILABLE','FAIL_BEFORE_SUBMISSION']),
 attempt:s.optional(attemptSchema),proof:s.optional(proofSchema),identityHash:s.optional(hashRef),messageHash:s.optional(hashRef),status:s.optional(s.enum(['PENDING','COMPLETED','FAILED','REFUNDED']))};
export function reduceCrossChainExecution(plan,events=[]){
 // Reconciliation intentionally survives preparation expiry; no live authorization exists here.
 const request={...plan.request};delete request.contentHash;
 verifyCrossChainPreparation(plan,request,plan.profile,plan.createdAt,{reconcile:true});
 let state='PREPARED',revision=0;const seen=new Map(),attempts=[],authorizations=[],observations=[];let source=null,message=null,attestation=null,destination=null,uncertain=false;const unresolved=new Set();
 const expectedSource=plan.proposal.protocolCommitmentHash,r=plan.request;
 for(const input of events){
  const e=decode(crossChainEventSchema,input);ensure(sameHash(e.planHash,plan.contentHash),'EVENT_PLAN_BINDING');
  const prior=seen.get(e.eventId);if(prior){ensure(canonicalize(prior)===canonicalize(e),'EVENT_ID_REPLAY_MUTATION');continue;}
  ensure(e.expectedRevision===revision,'REVISION_CONFLICT');ensure(Date.parse(e.at)>=Date.parse(observations.at(-1)?.at??plan.createdAt),'EVENT_TIME_ORDER');
  ensure(!['COMPLETED','FAILED_BEFORE_SUBMISSION'].includes(state)||['REORG','PROVIDER_STATUS','RECONCILE_DESTINATION'].includes(e.kind),'TERMINAL_STATE');
  if(e.kind==='AUTHORIZATION'){
   ensure(state!=='UNKNOWN'&&e.identityHash&&e.attempt&&(e.attempt.stage==='DESTINATION_MINT'?source&&attestation:Date.parse(e.at)<Date.parse(plan.validUntil)),'AUTHORIZATION_EXPIRED_OR_UNKNOWN');
   ensure(sameHash(e.identityHash,hash('CrossChainAuthorizationFixture',{planHash:plan.contentHash,attempt:e.attempt})),'AUTHORIZATION_ATTEMPT_BINDING');
   ensure(!authorizations.some(a=>sameHash(a.identityHash,e.identityHash)),'DUPLICATE_AUTHORIZATION');authorizations.push({identityHash:e.identityHash,attempt:e.attempt});if(state==='PREPARED')state='AUTHORIZED';
  }else if(e.kind==='ATTEMPT_INTENT'){
   ensure(state!=='UNKNOWN'&&!uncertain&&e.attempt&&authorizations.some(a=>canonicalize(a.attempt)===canonicalize(e.attempt)),'NO_AUTHORIZED_NEW_ATTEMPT');
   if(e.attempt.stage==='DESTINATION_MINT')ensure(/^0x[0-9a-f]{64}$/.test(e.attempt.nativeIdentity)&&e.attempt.nativeIdentity!=='0x'+'0'.repeat(64),'DESTINATION_NATIVE_NONCE');
   else ensure(/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(e.attempt.nativeIdentity),'CANONICAL_SOURCE_NATIVE_NONCE');
   ensure(!attempts.some(a=>a.stage===e.attempt.stage||a.attemptId===e.attempt.attemptId||a.transactionRef===e.attempt.transactionRef||a.networkRef===e.attempt.networkRef&&a.nativeIdentity===e.attempt.nativeIdentity),'NO_ATTEMPT_REPLAY');
   if(e.attempt.stage==='DESTINATION_MINT')ensure(source&&message&&attestation&&e.attempt.networkRef===r.destinationBinding.networkRef,'DESTINATION_PRECONDITIONS');
   else {ensure(Date.parse(e.at)<Date.parse(plan.validUntil)&&e.attempt.networkRef===r.sourceBinding.networkRef,'SOURCE_EXPIRED_OR_CHAIN');if(e.attempt.stage==='SOURCE_BURN')ensure(!attempts.some(a=>a.stage==='SOURCE_APPROVAL')||attempts.find(a=>a.stage==='SOURCE_APPROVAL').finalized,'APPROVAL_UNRESOLVED');}
   ensure(atomic(e.attempt.maximumNativeFeeAtomic)<=atomic(e.attempt.stage==='DESTINATION_MINT'?r.feeCaps.destinationNativeAtomic:r.feeCaps.sourceNativeAtomic),'ATTEMPT_FEE_CAP');
   attempts.push({...e.attempt,finalized:false});unresolved.add(e.attempt.stage);uncertain=true;state='UNKNOWN';
  }else if(e.kind==='SEND_RESPONSE'){ensure(attempts.length>0&&uncertain,'NO_ATTEMPT');unresolved.delete(attempts.at(-1).stage);uncertain=unresolved.size>0;state=source?'SETTLING':'SUBMITTED';}
  else if(e.kind==='RPC_TIMEOUT'){ensure(attempts.length>0,'NO_ATTEMPT');unresolved.add(attempts.at(-1).stage);uncertain=true;state='UNKNOWN';}
  else if(e.kind==='REORG'){ensure(attempts.length>0,'NO_ATTEMPT');attempts.forEach(a=>unresolved.add(a.stage));source=null;destination=null;message=null;attestation=null;uncertain=true;state='UNKNOWN';}
  else if(e.kind==='RECONCILE_SOURCE'){
   ensure(e.proof,'SOURCE_PROOF_REQUIRED');const p=e.proof,a=attempts.find(a=>a.transactionRef===p.transactionRef&&a.stage!=='DESTINATION_MINT');
   ensure(a&&p.networkRef===r.sourceBinding.networkRef&&p.recipient===r.sourceBinding.fundsAddress&&p.token===r.sourceToken&&sameHash(p.correlationHash,a.stage==='SOURCE_APPROVAL'?a.payloadHash:expectedSource)&&p.amountAtomic===r.amountAtomic,'SOURCE_RECEIPT_BINDING');
   ensure(atomic(p.nativeFeeAtomic)<=atomic(a.maximumNativeFeeAtomic),'SOURCE_ACTUAL_FEE_CAP');
   if(p.finality==='FINALIZED'){a.finalized=true;unresolved.delete(a.stage);uncertain=unresolved.size>0;if(a.stage==='SOURCE_BURN'){ensure(!source||canonicalize(source)===canonicalize(p),'SOURCE_RECEIPT_MUTATION');source=p;state=destination?'COMPLETED':'SETTLING';}else state='AUTHORIZED';}
  }else if(e.kind==='MESSAGE_OBSERVED'){
   ensure(source&&e.identityHash&&e.messageHash&&sameHash(e.identityHash,expectedSource),'BURN_MESSAGE_IDENTITY');
   ensure(!message||sameHash(message,e.messageHash),'MESSAGE_IDENTITY_MUTATION');message=e.messageHash;
  }else if(e.kind==='ATTESTATION_OBSERVED'){
   ensure(source&&message&&e.identityHash&&e.messageHash&&sameHash(e.messageHash,message),'ATTESTATION_MESSAGE_BINDING');
   ensure(!attestation||sameHash(attestation,e.identityHash),'ATTESTATION_IDENTITY_MUTATION');attestation=e.identityHash;
  }else if(e.kind==='RECONCILE_DESTINATION'){
   ensure(source&&message&&attestation&&e.proof,'DESTINATION_PROOF_REQUIRED');const p=e.proof,a=attempts.find(a=>a.stage==='DESTINATION_MINT');
   ensure(a&&p.transactionRef===a.transactionRef&&p.networkRef===r.destinationBinding.networkRef&&p.recipient===r.recipient&&p.token===r.destinationToken&&sameHash(p.correlationHash,message),'DESTINATION_RECEIPT_BINDING');
   ensure(atomic(p.nativeFeeAtomic)<=atomic(a.maximumNativeFeeAtomic),'DESTINATION_ACTUAL_FEE_CAP');
   if(p.finality==='FINALIZED'){
    ensure(!destination||canonicalize(destination)===canonicalize(p),'DESTINATION_RECEIPT_MUTATION');
    destination=p;a.finalized=true;unresolved.delete(a.stage);uncertain=unresolved.size>0;state=atomic(p.amountAtomic)>=atomic(r.minimumDestinationAtomic)&&atomic(p.amountAtomic)<=atomic(r.amountAtomic)?'COMPLETED':'PARTIAL';
   }
  }else if(e.kind==='PROVIDER_STATUS'){
   ensure(e.status&&attempts.length,'PROVIDER_STATUS_PRECONDITION');
   const contradiction=e.status==='REFUNDED'||e.status==='COMPLETED'&&!destination||e.status==='FAILED'&&(source||destination)||e.status==='PENDING'&&destination;
   if(contradiction){uncertain=true;state='UNKNOWN';} // Provider claims never establish completion/refund.
  }else if(e.kind==='DESTINATION_UNAVAILABLE'){ensure(source,'SOURCE_REQUIRED');if(!uncertain)state='PARTIAL';}
  else if(e.kind==='FAIL_BEFORE_SUBMISSION'){ensure(attempts.length===0,'POSSIBLE_EFFECT');state='FAILED_BEFORE_SUBMISSION';}
  if(unresolved.size>0)state='UNKNOWN';
  seen.set(e.eventId,e);observations.push(e);revision++;
 }
 // In particular, a late source receipt cannot turn known insufficient output into COMPLETED.
 if(!uncertain&&source&&destination)state=atomic(destination.amountAtomic)>=atomic(r.minimumDestinationAtomic)&&atomic(destination.amountAtomic)<=atomic(r.amountAtomic)?'COMPLETED':'PARTIAL';
 const sourceFees=attempts.filter(a=>a.networkRef===r.sourceBinding.networkRef).reduce((n,a)=>n+atomic(a.maximumNativeFeeAtomic),0n);
 ensure(sourceFees<=atomic(r.feeCaps.sourceNativeAtomic),'TOTAL_SOURCE_NATIVE_FEE_CAP');
 return snapshot('CrossChainExecution',{schemaVersion:1,scope:'SIMULATED',planHash:plan.contentHash,state,revision,attempts,authorizations,source,message,attestation,destination,uncertain,observations,
 currentAssetLocation:destination?'SOLANA_DESTINATION_OBSERVED':source?'BURNED_AWAITING_DESTINATION':attempts.length?'SOURCE_EFFECT_UNCERTAIN':'SOURCE_NOT_SUBMITTED',
 refundSupport:'UNAVAILABLE',nextAction:state==='UNKNOWN'?'RECONCILE':state==='COMPLETED'?'OBSERVE_ONLY':state==='PARTIAL'?'RECONCILE_INCOMPLETE_SETTLEMENT':'OBSERVE_OR_PREPARE_UNSIGNED',
 canSign:false,canSend:false});
}
