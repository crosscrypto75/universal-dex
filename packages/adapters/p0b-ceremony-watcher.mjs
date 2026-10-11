// Bounded Circle observer. No transaction preparation, authorization or execution port.
import {ensure,snapshot,sameHash,hash} from '../core/canonical.mjs';
import {ceremonyEvent} from '../core/p0b-ceremony.mjs';
import {verifyIrisObservation} from './cctp-reconciliation.mjs';
import {verifyCctpConfigurationObservation} from './cctp-observation.mjs';
export async function observeCircleOnce({request,burn,configuration,definition,fetchImpl=globalThis.fetch,clock=()=>new Date().toISOString()}){
 verifyCctpConfigurationObservation(configuration);ensure(sameHash(configuration.configurationHash,definition.configurationHash),'CCTP_DEPLOYMENT_CHANGED');
 const validUntil=new Date(Date.parse(configuration.observedAt)+60000).toISOString();
 ensure(Date.parse(configuration.observedAt)<=Date.parse(clock())&&Date.parse(clock())<Date.parse(validUntil),'CEREMONY_WATCH_STALE_CONFIGURATION');
 const url='https://iris-api-sandbox.circle.com/v2/messages/6?transactionHash='+burn.transactionHash;
 let status,evidence=null,responseHash=null,reason=null;
 try{
  const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(20000)});ensure(response.ok,'CIRCLE_HTTP_UNAVAILABLE');const body=await response.json();responseHash=hash('CircleResponse',{body});
  try{
   const result=verifyIrisObservation(request,burn,body,configuration.configuration);
   if(result.state==='SETTLING')status='ATTESTATION_PENDING';else{status='ATTESTATION_AVAILABLE';evidence=result;}
  }catch(e){
   status=/IRIS_|CORRELATION|BINDING/.test(e.message)?'PROVIDER_CONTRADICTION':'ATTESTATION_INVALID';reason=/^[A-Z0-9_:]+$/.test(e.message)?e.message:'LOCAL_ATTESTATION_REJECTED';
  }
 }catch{status='UNKNOWN_RECONCILIATION_REQUIRED';reason='CIRCLE_READ_UNAVAILABLE';}
 return snapshot('CeremonyCircleObservation',{schemaVersion:1,scope:'READ_ONLY_TESTNET',observedAt:clock(),status,burnIdentity:burn.burnIdentity,sourceTransactionHash:burn.transactionHash,responseHash,evidence,reason,canAuthorize:false,canSign:false,canSend:false});
}
export async function pollCircle({polls=1,intervalMs=30000,observe,persist,onProgress=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 ensure(Number.isSafeInteger(polls)&&polls>=1&&polls<=8&&Number.isSafeInteger(intervalMs)&&intervalMs>=15000&&intervalMs<=60000,'CEREMONY_WATCH_RATE_LIMIT');
 let last=null;
 for(let i=0;i<polls;i++){
  if(i)await sleep(intervalMs);last=await observe();await persist(last);await onProgress({poll:i+1,maxPolls:polls,status:last.status});
  if(last.status!=='ATTESTATION_PENDING')break;
 }
 return last;
}
export function persistCircleObservation({store,vault,ceremonyId,observation}){
 const x=store.read(ceremonyId);ensure(sameHash(observation.burnIdentity,vault.read(x.state.stages.BURN.evidence.chainEvidenceHash).burnIdentity),'CEREMONY_WATCH_BURN_MUTATION');vault.save(observation);
 const fields=observation.status==='ATTESTATION_AVAILABLE'?{attestationHash:observation.evidence.attestation.contentHash,messageHash:observation.evidence.message.contentHash}: {reason:observation.reason??'PENDING'};
 if(observation.evidence)vault.save(observation.evidence);
 const kind={ATTESTATION_PENDING:'WATCH_PENDING',ATTESTATION_AVAILABLE:'WATCH_AVAILABLE',ATTESTATION_INVALID:'WATCH_INVALID',PROVIDER_CONTRADICTION:'PROVIDER_CONTRADICTION',UNKNOWN_RECONCILIATION_REQUIRED:'WATCH_UNKNOWN'}[observation.status];
 try{return store.append(ceremonyId,ceremonyEvent(x.definition,x.state,kind,fields,observation.observedAt));}
 catch(e){if(/CEREMONY_(MESSAGE_MUTATION|ATTESTATION_MUTATION|PROVIDER_REGRESSION)/.test(e.message))return store.append(ceremonyId,ceremonyEvent(x.definition,x.state,'PROVIDER_CONTRADICTION',{reason:'OBSERVED_PROVIDER_IDENTITY_OR_STATUS_MUTATION'},observation.observedAt));throw e;}
}
