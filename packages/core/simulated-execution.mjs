import {ensure,hash,sameHash,atomic,snapshot} from './canonical.mjs';
import {s,decode,hashRef,network} from './schema.mjs';
import {validatePreparationPlan} from './preparation-plan.mjs';

const eventSchema={schemaVersion:s.literal(1),scope:s.literal('SIMULATED'),eventId:s.string,planHash:hashRef,expectedRevision:s.integer,at:s.time,kind:s.enum(['FIXTURE_AUTHORIZATION','SUBMISSION_INTENT','LOST_RESPONSE','SOURCE_RECEIPT','DESTINATION_RECEIPT','PROVIDER_CLAIM','FAIL_BEFORE_SUBMISSION','REORG']),receipt:s.optional({scope:s.literal('SIMULATED'),source:s.literal('INDEPENDENT_CHAIN_FIXTURE'),networkRef:network,transactionRef:s.string,recipient:s.string,representationId:s.string,amountAtomic:s.atomic,finality:s.enum(['FINALIZED','PENDING']),planHash:hashRef})};
// Pure incident model. Events are synthetic observations, never executable permissions.
export function simulateExecution(planInput,events=[]){
  const plan=validatePreparationPlan(planInput);
  let state='PREPARED',revision=0,submissionAttempted=false;const observations=[],seen=new Set();let sourceReceipt=null,destinationReceipt=null;
  for(const input of events){const event=decode(eventSchema,input);ensure(sameHash(event.planHash,plan.contentHash),'EVENT_PLAN_BINDING');ensure(Date.parse(event.at)>=Date.parse(observations.at(-1)?.at??plan.createdAt),'EVENT_TIME_ORDER');if(['FIXTURE_AUTHORIZATION','SUBMISSION_INTENT'].includes(event.kind))ensure(Date.parse(event.at)<Date.parse(plan.submissionValidUntil),'NEW_SPEND_EXPIRED');ensure(event.expectedRevision===revision,'REVISION_CONFLICT');ensure(!seen.has(event.eventId),'DUPLICATE_EVENT');seen.add(event.eventId);ensure(!['COMPLETED','FAILED_BEFORE_SUBMISSION'].includes(state)||event.kind==='REORG','TERMINAL_STATE');
    if(event.kind==='FIXTURE_AUTHORIZATION'){ensure(state==='PREPARED'&&!submissionAttempted,'NO_AUTHORIZATION_REPLAY');state='AUTHORIZED';}
    else if(event.kind==='SUBMISSION_INTENT'){ensure(state==='AUTHORIZED'&&!submissionAttempted,'NO_NEW_SOURCE_ATTEMPT');submissionAttempted=true;state='SUBMITTED';}
    else if(event.kind==='LOST_RESPONSE'){ensure(submissionAttempted,'NO_SUBMISSION_TO_RECONCILE');state='UNKNOWN';}
    else if(event.kind==='FAIL_BEFORE_SUBMISSION'){ensure(!submissionAttempted,'POSSIBLE_EFFECT_NOT_FAILED');state='FAILED_BEFORE_SUBMISSION';}
    else if(event.kind==='REORG'){ensure(submissionAttempted,'NO_EFFECT_TO_RECONCILE');state='UNKNOWN';sourceReceipt=null;destinationReceipt=null;}
    else if(event.kind==='PROVIDER_CLAIM'){ensure(submissionAttempted,'NO_SUBMISSION_TO_RECONCILE');/* A provider claim cannot establish finality. */}
    else {
      ensure(submissionAttempted&&event.receipt,'CHAIN_RECEIPT_REQUIRED');const r=event.receipt;ensure(sameHash(r.planHash,plan.contentHash),'RECEIPT_PLAN_BINDING');
      if(event.kind==='SOURCE_RECEIPT'){ensure(r.networkRef===plan.steps[0].sourceNetwork&&r.recipient===plan.fundingPosition.fundsAddress&&r.representationId===plan.fundingPosition.representationId&&atomic(r.amountAtomic)===atomic(plan.acceptedEconomics.inputAtomic),'SOURCE_RECEIPT_BINDING');if(r.finality==='FINALIZED'){sourceReceipt=r;state='SETTLING';}}
      else {ensure(r.networkRef===plan.steps[0].destinationNetwork&&r.recipient===plan.acceptedEconomics.recipient&&r.representationId===plan.acceptedEconomics.outputRepresentationId,'DESTINATION_RECEIPT_BINDING');if(r.finality==='FINALIZED'){destinationReceipt=r;state=sourceReceipt&&atomic(r.amountAtomic)>=atomic(plan.acceptedEconomics.minFinalNetOutput)?'COMPLETED':'PARTIAL';}}
      if(sourceReceipt&&destinationReceipt)state=atomic(destinationReceipt.amountAtomic)>=atomic(plan.acceptedEconomics.minFinalNetOutput)?'COMPLETED':'PARTIAL';
    }
    observations.push(event);revision++;
  }
  return snapshot('SimulatedExecutionRecord',{schemaVersion:1,scope:'SIMULATED',planHash:plan.contentHash,state,revision,submissionAttempted,sourceReceipt,destinationReceipt,observations,nextAction:state==='UNKNOWN'?'RECONCILE_EXACT_RECORDED_ATTEMPT':state==='PREPARED'?'HUMAN_BOUNDARY_NOT_CONSUMED':'OBSERVE_ONLY',canSign:false,canSend:false});
}
