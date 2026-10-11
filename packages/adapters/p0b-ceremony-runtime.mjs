// Public local runtime. Initialization never loads a wallet or makes an RPC call.
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {ensure,parseStrictJson} from '../core/canonical.mjs';
import {CCTP_CANDIDATE as P} from './cctp-readonly.mjs';
import {defineCctpCeremony,normalizeOperatorSelection} from './p0b-ceremony-cctp.mjs';
import {CeremonyStore} from './p0b-ceremony-store.mjs';
import {PublicArtifactVault} from './p0b-ceremony-artifacts.mjs';
const read=p=>parseStrictJson(readFileSync(p,'utf8'));
export function acceptedCeremonyContext(root){
 return {usdc:read(join(root,'evidence/p0b-ceremony-overnight-2026-10-08/usdc-deployment-pin.json')),identities:read(join(root,'evidence/p0b-cctp-2026-10-08/final-implementation-identities.json')),configuration:read(join(root,'evidence/p0b-cctp-2026-10-08/final-configuration.json')),presence:read(join(root,'evidence/p0b-cctp-2026-10-08/deployment-presence.json'))};
}
export function openCeremonyRuntime(root,{initialize=false,readOnly=false,selectionPath='evidence/p0b-ceremony-overnight-2026-10-08/operator-selection.json'}={}){
 const accepted=acceptedCeremonyContext(root),selection=normalizeOperatorSelection(read(resolve(root,selectionPath))),definition=defineCctpCeremony(selection,accepted);
 const dir=join(resolve(root),'.p0b-ceremony-runtime'),dbPath=join(dir,'ceremony-v2.sqlite');
 if(initialize){ensure(!readOnly,'CEREMONY_INIT_READ_ONLY');mkdirSync(dir,{recursive:true});}
 const store=new CeremonyStore(dbPath,{create:initialize&&!existsSync(dbPath),readOnly}),vault=new PublicArtifactVault(join(dir,'public-artifacts'),{create:initialize});
 const current=initialize?store.create(definition):store.read(definition.ceremonyId);
 ensure(current.definition.contentHash.digest===definition.contentHash.digest,'CEREMONY_RUNTIME_BINDINGS_CHANGED');
 return {store,vault,selection,accepted,current,ceremonyId:definition.ceremonyId};
}
export function ceremonyView(current,{now=new Date().toISOString()}={}){
 const d=current.definition,s=current.state,key=s.activeStage;
 const stages=d.stages.map(spec=>{
  const x=s.stages[spec.key],ready=spec.key===key&&(spec.key!=='RECEIVE'||s.watch.status==='ATTESTATION_AVAILABLE')&&!['UNKNOWN','PARTIAL','FAILED_BEFORE_SUBMISSION','COMPLETED'].includes(s.publicState);
  const expired=x.prepared?Date.parse(now)>=Date.parse(x.prepared.validUntil):true;
  const display=x.status==='FINALIZED'?'FINALIZED':x.status==='UNKNOWN'||x.signRequested&&!x.evidence?'UNKNOWN -> RECONCILE':ready?(expired?'JIT_REFRESH_REQUIRED':x.status):'LOCKED';
  return {stageId:x.stageId,key:spec.key,chain:spec.networkRef,status:display,current:spec.key===key,actor:spec.actor,amountAtomic:spec.key==='ATA'?'0':d.amountAtomic,
   recipient:spec.key==='SOURCE_APPROVAL'?P.messenger.toLowerCase():d.destinationAta,nativeCap:spec.nativeCap,prepared:x.prepared,transactionRef:x.transactionRef,reconciliationStatus:x.reconciliationStatus,
   actionEnabled:false,reason:x.status==='FINALIZED'?'Finalized evidence recorded':ready?'Fresh exact stage authorization required; effect ports disconnected':'Waiting for preceding finalized evidence'};
 });
 return {schemaVersion:1,title:'P0-B CROSS-CHAIN TEST',ceremonyId:d.ceremonyId,requestId:d.requestId,accountId:d.accountId,scope:d.scope,state:s.state,publicState:s.publicState,activeStage:key,
  sourceWallet:d.sourceWallet,destinationOwner:d.destinationOwner,destinationAta:d.destinationAta,feePayer:d.feePayer,sourceToken:d.sourceToken,destinationToken:d.destinationToken,amountAtomic:d.amountAtomic,minimumDestinationAtomic:d.minimumDestinationAtomic,feeCaps:d.feeCaps,
  providerRef:d.providerRef,stages,watch:s.watch,stageAuthorizations:stages.filter(x=>s.stages[x.key].authorization).length,signRequests:stages.filter(x=>s.stages[x.key].signRequested).length,sendIntents:stages.filter(x=>s.stages[x.key].sendIntent).length,
  walletIntegration:'DISCONNECTED_EXTERNAL_EXACT_STAGE_PORTS',canSign:false,canSend:false,liveEffects:d.scope==='SIMULATED_CEREMONY'?0:stages.some(x=>s.stages[x.key].signRequested&&!s.stages[x.key].evidence)?'UNKNOWN':stages.filter(x=>s.stages[x.key].evidence?.outcome==='SUCCESS').length,p0A3:'PROVEN_AND_FROZEN',p0BLive:'NOT_PROVEN'};
}
