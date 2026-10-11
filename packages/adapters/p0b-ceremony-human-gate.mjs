// Trusted, explicitly supplied human confirmation; disconnected by default.
// A confirmation callback must represent the operator, never an AI/provider score.
import {randomUUID} from 'node:crypto';
import {ensure,sameHash} from '../core/canonical.mjs';
import {fresh} from '../core/schema.mjs';
import {createStageAuthorization} from '../core/p0b-ceremony.mjs';
export function createExactStageHumanGate({enabled=false,confirmExactStage=null,clock=()=>new Date().toISOString()}={}){
 let requested=false;
 return {async authorizeExactStage({definition,prepared,freshCheckHash}){
  ensure(enabled&&typeof confirmExactStage==='function','CEREMONY_HUMAN_GATE_DISABLED');ensure(!requested,'CEREMONY_HUMAN_GATE_ALREADY_REQUESTED');
  ensure(definition.scope==='TESTNET_CEREMONY_PREPARATION'&&sameHash(prepared.ceremonyHash,definition.contentHash)&&fresh(prepared.observedAt,prepared.validUntil,clock()),'CEREMONY_HUMAN_GATE_BINDING_OR_EXPIRY');
  const challengeId=randomUUID();requested=true;
  const result=await confirmExactStage({challengeId,ceremonyId:definition.ceremonyId,stageId:prepared.stageId,preparedHash:prepared.contentHash,intentHash:prepared.intentHash,freshCheckHash,actor:prepared.actor,chain:prepared.networkRef,summary:prepared.summary,maxNativeDebitAtomic:prepared.nativeMaximumAtomic,expiresAt:prepared.validUntil});
  ensure(result?.accepted===true&&result.challengeId===challengeId,'CEREMONY_EXACT_HUMAN_CONFIRMATION_REQUIRED');
  const authorizedAt=clock();ensure(fresh(prepared.observedAt,prepared.validUntil,authorizedAt),'CEREMONY_HUMAN_GATE_EXPIRED');
  return createStageAuthorization({schemaVersion:1,scope:'EXPLICIT_HUMAN_STAGE_ONLY',authorizationId:'human-stage:'+challengeId,ceremonyHash:definition.contentHash,stageId:prepared.stageId,preparedHash:prepared.contentHash,intentHash:prepared.intentHash,freshCheckHash,authorizedAt,expiresAt:prepared.validUntil,actor:prepared.actor,networkRef:prepared.networkRef,maxNativeDebitAtomic:prepared.nativeMaximumAtomic,acknowledgedAction:prepared.summary.authorizes});
 }};
}
