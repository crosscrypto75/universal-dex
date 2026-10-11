// CCTP implements the provider-neutral ceremony ledger; no wallet or send capability.
import {PublicKey,Transaction} from '@solana/web3.js';
import {ensure,hash,sameHash,snapshot,atomic,canonicalize} from '../core/canonical.mjs';
import {decode,s,fresh} from '../core/schema.mjs';
import {createCeremonyDefinition,createStagePreparation,createStageEvidence,stageId,priorEvidenceHash} from '../core/p0b-ceremony.mjs';
import {verifyCrossChainPreparation} from '../core/cross-chain.mjs';
import {createCrossChainAccountSelection} from '../core/cross-chain-account.mjs';
import {CCTP_CANDIDATE as P} from './cctp-readonly.mjs';
import {CctpProvider,cctpPreparationProfile,prepareCctpSource,prepareCctpDestination,createRecipientAtaInstruction,verifyCctpDestination} from './cctp-provider.mjs';
import {compareImplementationPins,verifyCctpConfigurationObservation,decodeTokenAccount,accountBytes,decodeCctpAccount,readOnlyRpc} from './cctp-observation.mjs';
import {prepareSourceTransaction,verifySourceTransaction} from './cctp-source-transaction.mjs';
import {observeBaseFeeBounds} from './cctp-fees.mjs';
import {verifyExternalSignedWire} from './p0b-ceremony-signed.mjs';
import {collectCeremonyFacts,acceptedDeploymentHash} from './p0b-ceremony-rpc.mjs';
import {ata,evmAddress,bytes,sha,burnParameters,cctpAccounts,verifyMessage,verifyAttestation} from './cctp-codec.mjs';
export const operatorSelectionSchema={schemaVersion:s.literal(1),accountId:s.string,requestId:s.string,sourceAddress:s.string,destinationOwner:s.string,destinationFeePayer:s.string,amountAtomic:s.positive,minimumDestinationAtomic:s.positive,protocolFeeCapAtomic:s.atomic,sourceNativeFeeCapAtomic:s.positive,destinationNativeFeeCapAtomic:s.positive,approvalGasLimit:s.positive,burnGasLimit:s.positive,maxFeePerGas:s.positive,maxPriorityFeePerGas:s.atomic,maximumL1FeePerTransactionAtomic:s.atomic};
export function normalizeOperatorSelection(input){
 const x=decode(operatorSelectionSchema,input);x.sourceAddress=evmAddress(x.sourceAddress);
 for(const key of ['destinationOwner','destinationFeePayer'])ensure(new PublicKey(x[key]).toBase58()===x[key],'CEREMONY_SOLANA_SELECTION');
 ensure(PublicKey.isOnCurve(new PublicKey(x.destinationFeePayer).toBuffer()),'CEREMONY_SOLANA_PAYER');
 ensure(atomic(x.amountAtomic)-atomic(x.protocolFeeCapAtomic)>=atomic(x.minimumDestinationAtomic)&&atomic(x.protocolFeeCapAtomic)<atomic(x.amountAtomic),'CEREMONY_SELECTED_MINIMUM');
 ensure(atomic(x.maxPriorityFeePerGas)<=atomic(x.maxFeePerGas)&&atomic(x.approvalGasLimit)<=3000000n&&atomic(x.burnGasLimit)<=3000000n,'CEREMONY_SELECTED_GAS');
 ensure((atomic(x.approvalGasLimit)+atomic(x.burnGasLimit))*atomic(x.maxFeePerGas)+2n*atomic(x.maximumL1FeePerTransactionAtomic)<=atomic(x.sourceNativeFeeCapAtomic),'CEREMONY_SELECTED_SOURCE_CAP');
 return x;
}
export function economicBindings(selection){const x=normalizeOperatorSelection(selection);return {...x,sourceChain:84532,sourceDomain:6,destinationGenesis:P.genesis,destinationDomain:5,sourceToken:P.usdc.toLowerCase(),destinationToken:P.mint,destinationAta:ata(x.destinationOwner)};}
export function defineCctpCeremony(input,accepted,{scope='TESTNET_CEREMONY_PREPARATION',ceremonyId=null}={}){
 const x=normalizeOperatorSelection(input),binding=economicBindings(x),identityHash=acceptedDeploymentHash(accepted);verifyCctpConfigurationObservation(accepted.configuration);
 const request=bareRequest(x,x.amountAtomic,'2026-10-08T00:00:00.000Z','2026-10-08T00:01:00.000Z').request;
 const native=(kind)=>String(atomic(kind==='APPROVAL'?x.approvalGasLimit:x.burnGasLimit)*atomic(x.maxFeePerGas)+atomic(x.maximumL1FeePerTransactionAtomic));
 return createCeremonyDefinition({schemaVersion:1,scope,ceremonyId:ceremonyId??'p0b:'+hash('CeremonyEconomicSelection',binding).digest.slice(0,24),requestId:x.requestId,accountId:x.accountId,providerRef:'CctpProvider',
  bindingsHash:hash('CeremonyEconomicSelection',binding),routeHash:hash('CrossChainCeremonyRoute',{providerRef:'CctpProvider',protocolCommitment:hash('CctpBurnCommitment',burnParameters(request))}),deploymentHash:identityHash,configurationHash:accepted.configuration.configurationHash,
  sourceWallet:x.sourceAddress,destinationOwner:x.destinationOwner,destinationAta:binding.destinationAta,feePayer:x.destinationFeePayer,sourceToken:binding.sourceToken,destinationToken:P.mint,amountAtomic:x.amountAtomic,minimumDestinationAtomic:x.minimumDestinationAtomic,
  feeCaps:{protocolAtomic:x.protocolFeeCapAtomic,sourceNativeAtomic:x.sourceNativeFeeCapAtomic,destinationNativeAtomic:x.destinationNativeFeeCapAtomic},refundSupport:'UNAVAILABLE',
  stages:[{key:'ATA',prefix:'ATA',networkRef:'solana:devnet',actor:x.destinationFeePayer,nativeCap:x.destinationNativeFeeCapAtomic,role:'PREREQUISITE'},{key:'SOURCE_APPROVAL',prefix:'SOURCE_APPROVAL',networkRef:'eip155:84532:base-sepolia',actor:x.sourceAddress,nativeCap:native('APPROVAL'),role:'SOURCE_APPROVAL'},{key:'BURN',prefix:'BURN',networkRef:'eip155:84532:base-sepolia',actor:x.sourceAddress,nativeCap:native('BURN'),role:'SOURCE_EFFECT'},{key:'RECEIVE',prefix:'RECEIVE',networkRef:'solana:devnet',actor:x.destinationFeePayer,nativeCap:x.destinationNativeFeeCapAtomic,role:'DESTINATION_EFFECT'}]});
}
export function bareRequest(selection,available,createdAt,validUntil){
 const x=normalizeOperatorSelection(selection),bindings=[{bindingId:'base-source',networkRef:'eip155:84532:base-sepolia',fundsAddress:x.sourceAddress,kind:'EVM_WALLET'},{bindingId:'solana-destination',networkRef:'solana:devnet',fundsAddress:x.destinationOwner,kind:'SOLANA_SMART_ACCOUNT'}];
 const accountSelection=createCrossChainAccountSelection({schemaVersion:1,scope:'UNSIGNED_ACCOUNT_SELECTION',accountId:x.accountId,revision:0,bindings:bindings.map(b=>({...b,provenanceHash:hash('OperatorPublicWalletSelection',{address:b.fundsAddress}),controlStatus:'NOT_OBTAINED',spendingAuthority:'NOT_OBTAINED'}))});
 return {accountSelection,request:{schemaVersion:1,scope:'TESTNET_PREPARATION',requestId:x.requestId,accountId:x.accountId,accountSelectionHash:accountSelection.contentHash,sourceBinding:bindings[0],destinationBinding:bindings[1],positionId:'base-usdc:'+x.sourceAddress,availableAtomic:available,sourceToken:P.usdc.toLowerCase(),destinationToken:P.mint,amountAtomic:x.amountAtomic,minimumDestinationAtomic:x.minimumDestinationAtomic,recipient:ata(x.destinationOwner),feeCaps:{protocolAtomic:x.protocolFeeCapAtomic,sourceNativeAtomic:x.sourceNativeFeeCapAtomic,destinationNativeAtomic:x.destinationNativeFeeCapAtomic},createdAt,validUntil}};
}
export function validateJitFacts(definition,selection,facts,now,{stageKey='ATA'}={}){
 const d=definition,x=normalizeOperatorSelection(selection),{contentHash,...payload}=facts;
 ensure(sameHash(contentHash,hash('CeremonyJitFacts',payload))&&facts.noSigning===true&&facts.noSending===true,'CEREMONY_JIT_FACT_HASH');
 ensure(sameHash(d.bindingsHash,hash('CeremonyEconomicSelection',economicBindings(x))),'CEREMONY_SELECTION_MUTATION');
 ensure(fresh(facts.startedAt,new Date(Date.parse(facts.startedAt)+60000).toISOString(),now)&&Date.parse(facts.observedAt)>=Date.parse(facts.startedAt)&&Date.parse(facts.observedAt)<=Date.parse(now),'CEREMONY_JIT_STALE');
 verifyCctpConfigurationObservation(facts.configuration);
 ensure(sameHash(d.deploymentHash,facts.identity.identityHash)&&sameHash(d.configurationHash,facts.configuration.configurationHash),'CCTP_DEPLOYMENT_CHANGED');
 const b=facts.base,z=facts.solana;
 ensure(canonicalize(z.ata)===canonicalize(facts.configuration.configuration.destination.recipientAccount),'CEREMONY_ATA_OBSERVATION_CONTRADICTION');
 ensure(b.chainId===P.chainId&&z.genesis===P.genesis&&b.walletCode==='0x','CEREMONY_CHAIN_OR_SOURCE_WALLET');
 if(stageKey!=='RECEIVE'){
  ensure(atomic(b.usdcBalance)>=atomic(x.amountAtomic)&&atomic(b.finalizedUsdcBalance)>=atomic(x.amountAtomic),'CEREMONY_SOURCE_BALANCE');
  const burnBudget=atomic(x.burnGasLimit)*atomic(x.maxFeePerGas)+atomic(x.maximumL1FeePerTransactionAtomic),approvalBudget=atomic(x.approvalGasLimit)*atomic(x.maxFeePerGas)+atomic(x.maximumL1FeePerTransactionAtomic);
  ensure(atomic(b.nativeBalance)>=burnBudget+(stageKey==='BURN'||b.allowance===x.amountAtomic?0n:approvalBudget),'CEREMONY_SOURCE_NATIVE_BALANCE');
  ensure(b.noncePending===b.nonceLatest,'CEREMONY_PENDING_SOURCE_TRANSACTION');
  ensure(b.allowance==='0'||b.allowance===x.amountAtomic,'CEREMONY_ALLOWANCE_BOUND');
  ensure(b.finalizedAllowance==='0'||b.finalizedAllowance===x.amountAtomic,'CEREMONY_FINALIZED_ALLOWANCE_BOUND');
  ensure(atomic(b.baseFeePerGas)+atomic(x.maxPriorityFeePerGas)<=atomic(x.maxFeePerGas),'CEREMONY_STALE_SOURCE_FEES');
 }
 atomic(b.priorityFeeSuggestion);
 ensure(atomic(z.nativeBalance)>0n,'CEREMONY_RELAY_BALANCE');
 if(z.ata)ensure(z.ata.address===d.destinationAta&&z.ata.owner===d.destinationOwner&&z.ata.mint===d.destinationToken&&z.ata.delegateOption===0&&z.ata.closeAuthorityOption===0,'CEREMONY_ATA_BINDING');
 ensure(z.mintIdentity.address===P.mint&&z.mintIdentity.decimals===6&&z.mintIdentity.initialized===true,'CEREMONY_MINT_IDENTITY');
 return x;
}
function stageProof(x,key,facts,outcome,chainEvidenceHash,extras={}){
 const d=x.definition;return createStageEvidence({schemaVersion:1,scope:d.scope==='SIMULATED_CEREMONY'?'SIMULATED_CEREMONY':'READ_ONLY_TESTNET',ceremonyHash:d.contentHash,stageId:stageId(d,key),stageKey:key,bindingsHash:d.bindingsHash,routeHash:d.routeHash,deploymentHash:d.deploymentHash,configurationHash:d.configurationHash,priorEvidenceHash:priorEvidenceHash(d,x.state.stages,key),transactionRef:'READ_ONLY_PREEXISTING:'+chainEvidenceHash.digest,finality:'FINALIZED',outcome,nativeDebitAtomic:'0',observedAt:facts.observedAt,chainEvidenceHash,...extras});
}
export async function prepareCctpCeremonyStage(current,input,facts,{rpc=readOnlyRpc(),clock=()=>new Date().toISOString(),attested=null,burn=null,sourceMaterial=null}={}){
 const d=current.definition,key=current.state.activeStage,x=validateJitFacts(d,input,facts,clock(),{stageKey:key}),spec=d.stages.find(s=>s.key===key);
 ensure(spec&&current.state.publicState!=='UNKNOWN'&&current.state.publicState!=='PARTIAL'&&!current.state.stages[key].signRequested,'CEREMONY_JIT_RECONCILE_ONLY');
 ensure(d.stages.slice(0,d.stages.findIndex(s=>s.key===key)).every(s=>current.state.stages[s.key].status==='FINALIZED'),'CEREMONY_PRIOR_FINALITY');
 if(key==='ATA'&&facts.solana.ata)return {kind:'PREEXISTING',proof:stageProof(current,key,facts,'PREEXISTING_EXACT',hash('CeremonyAtaFinalizedObservation',{genesis:P.genesis,slot:facts.solana.slot,ata:facts.solana.ata}))};
 if(key==='SOURCE_APPROVAL'&&facts.base.allowance===x.amountAtomic){
  if(facts.base.finalizedAllowance!==x.amountAtomic)return {kind:'WAIT_FINALITY',reason:'ALLOWANCE_NOT_FINALIZED'};
  return {kind:'PREEXISTING',proof:stageProof(current,key,facts,'PREEXISTING_EXACT',hash('CeremonyAllowanceFinalizedObservation',{wallet:d.sourceWallet,spender:P.messenger.toLowerCase(),token:d.sourceToken,amountAtomic:x.amountAtomic,block:facts.base.finalizedBlock,blockHash:facts.base.finalizedHash}))};
 }
 if(key==='SOURCE_APPROVAL')ensure(facts.base.finalizedAllowance==='0','CEREMONY_ALLOWANCE_CHANGED');
 if(key==='BURN')ensure(facts.solana.ata&&facts.base.allowance===x.amountAtomic&&facts.base.finalizedAllowance===x.amountAtomic,'CEREMONY_BURN_PREREQUISITES');
 const observedAt=facts.startedAt,validUntil=new Date(Date.parse(observedAt)+60000).toISOString();
 let request,accountSelection,plan;
 if(key==='RECEIVE'){
  ensure(sourceMaterial,'CEREMONY_RECEIVE_SOURCE_MATERIAL_REQUIRED');verifyBurnMaterial(current,x,sourceMaterial);
  request=sourceMaterial.request;accountSelection=sourceMaterial.accountSelection;plan=sourceMaterial.plan;
 }else{
  ({request,accountSelection}=bareRequest(x,facts.base.usdcBalance,observedAt,validUntil));
  const profile=cctpPreparationProfile(d.deploymentHash,facts.configuration),provider=new CctpProvider({profile,observation:facts.configuration,accountSelection});
  plan=provider.prepare(request,provider.propose(request),clock());
 }
 if(key==='BURN'){
  const approval=current.state.stages.SOURCE_APPROVAL;
  if(approval.prepared&&approval.evidence.outcome==='SUCCESS')ensure(atomic(facts.base.noncePending)>atomic(approval.prepared.nativeIdentity),'CEREMONY_BURN_STALE_APPROVAL_NONCE');
 }
 let candidate,nativeMaximumAtomic,nativeIdentity,details;
 if(key==='SOURCE_APPROVAL'||key==='BURN'){
  const kind=key==='SOURCE_APPROVAL'?'APPROVAL':'BURN',source=prepareCctpSource(request),call=kind==='APPROVAL'?source.calls.approval:source.calls.burn,gasLimit=kind==='APPROVAL'?x.approvalGasLimit:x.burnGasLimit;
  nativeMaximumAtomic=String(atomic(gasLimit)*atomic(x.maxFeePerGas)+atomic(x.maximumL1FeePerTransactionAtomic));nativeIdentity=facts.base.noncePending;
  const inputTx={schemaVersion:1,scope:'UNSIGNED_TESTNET_ONLY',kind,requestHash:hash('CrossChainRequest',request),chainId:84532,from:d.sourceWallet,to:call.to,value:'0',data:call.data,nonce:nativeIdentity,gasLimit,maxFeePerGas:x.maxFeePerGas,maxPriorityFeePerGas:x.maxPriorityFeePerGas,maximumL1FeeAtomic:x.maximumL1FeePerTransactionAtomic,observedL1FeeAtomic:'0',feeBudgetAtomic:nativeMaximumAtomic};
  const provisional=prepareSourceTransaction(request,inputTx),fees=await observeBaseFeeBounds({transactionBytes:bytes(provisional.signingPreimage).length+75,rpc});
  ensure(atomic(fees.l1UpperBoundAtomic)<=atomic(x.maximumL1FeePerTransactionAtomic)&&atomic(fees.baseFeePerGas)+atomic(x.maxPriorityFeePerGas)<=atomic(x.maxFeePerGas),'CEREMONY_SOURCE_FEE_CHANGED');
  const simulationCall={from:call.from,to:call.to,data:call.data,value:'0x0',gas:'0x'+atomic(gasLimit).toString(16),maxFeePerGas:'0x'+atomic(x.maxFeePerGas).toString(16),maxPriorityFeePerGas:'0x'+atomic(x.maxPriorityFeePerGas).toString(16)};
  const simulation=await rpc.read(P.baseRpc,'eth_call',[simulationCall,'latest']),estimate=BigInt(await rpc.read(P.baseRpc,'eth_estimateGas',[simulationCall]));
  ensure(estimate<=atomic(gasLimit)&&(kind!=='APPROVAL'||BigInt(simulation)===1n),'CEREMONY_SOURCE_SIMULATION');
  candidate=prepareSourceTransaction(request,{...inputTx,observedL1FeeAtomic:fees.l1UpperBoundAtomic});details={fees,simulationHash:sha(simulation),estimatedGasAtomic:String(estimate),expectedSourceMessage:source.expectedSourceMessage};
 }else{
  const z=facts.solana,recent=z.blockhash.value;ensure(Number.isSafeInteger(recent.lastValidBlockHeight)&&z.blockHeight+5<recent.lastValidBlockHeight,'CEREMONY_SOLANA_BLOCKHASH_EXPIRED');
  if(key==='ATA'){
   const tx=new Transaction({feePayer:new PublicKey(d.feePayer),blockhash:recent.blockhash,lastValidBlockHeight:recent.lastValidBlockHeight});tx.add(createRecipientAtaInstruction(d.destinationOwner,d.feePayer));
   candidate=snapshot('CeremonyUnsignedSolana',{schemaVersion:1,scope:'UNSIGNED_TESTNET_ONLY',stageKey:key,feePayer:d.feePayer,blockhash:recent.blockhash,lastValidBlockHeight:recent.lastValidBlockHeight,unsignedWireBase64:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),messageSha256:sha(tx.serializeMessage()),canSign:false,canSend:false});
  }else{
   ensure(key==='RECEIVE'&&current.state.watch.status==='ATTESTATION_AVAILABLE'&&attested&&burn&&facts.solana.ata,'CEREMONY_RECEIVE_PREREQUISITES');
   const {contentHash:attestedHash,...attestedBody}=attested;ensure(sameHash(attestedHash,hash('CctpAttestedObservation',attestedBody))&&sameHash(attested.burnIdentity,burn.burnIdentity),'CEREMONY_ATTESTED_OBSERVATION_MUTATION');
   const decoded=verifyMessage(request,attested.message.bytes,{sourceMessage:burn.sourceMessage,attested:true}),verified=verifyAttestation(decoded.bytes,attested.attestationBytes,facts.configuration.configuration.destination);
   ensure(canonicalize(decoded)===canonicalize(attested.message)&&canonicalize(verified)===canonicalize(attested.attestation),'CEREMONY_ATTESTED_DECODED_MUTATION');
   ensure(sameHash(decoded.contentHash,current.state.watch.messageHash)&&sameHash(verified.contentHash,current.state.watch.attestationHash),'CEREMONY_RECEIVE_ATTESTATION_MUTATION');
   const nonceAddress=cctpAccounts(decoded.nonce).usedNonce,a=await rpc.read(P.solRpc,'getAccountInfo',[nonceAddress,{commitment:'finalized',encoding:'base64'}]);
   ensure(a.value===null,'CEREMONY_RECEIVE_NONCE_ALREADY_EXISTS_RECONCILE');
   candidate=prepareCctpDestination({request,plan,acceptedAccountSelection:accountSelection,observation:facts.configuration,identityHash:d.deploymentHash,now:clock(),sourceMessage:burn.sourceMessage,message:decoded.bytes,attestation:attested.attestationBytes,feePayer:d.feePayer,blockhash:recent.blockhash,lastValidBlockHeight:recent.lastValidBlockHeight,createAta:false});
   nativeIdentity=decoded.nonce;
  }
  const tx=Transaction.from(Buffer.from(candidate.unsignedWireBase64,'base64')),fee=await rpc.read(P.solRpc,'getFeeForMessage',[tx.serializeMessage().toString('base64'),{commitment:'finalized'}]);
  ensure(Number.isSafeInteger(fee.value)&&fee.value>=0,'CEREMONY_SOLANA_FEE_UNKNOWN');
  nativeMaximumAtomic=String(BigInt(fee.value)+atomic(key==='ATA'?z.ataRentAtomic:z.nonceRentAtomic));nativeIdentity??=candidate.messageSha256;
  const sim=await rpc.read(P.solRpc,'simulateTransaction',[candidate.unsignedWireBase64,{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,commitment:'finalized',accounts:{encoding:'base64',addresses:[d.destinationAta]}}]);
  ensure(sim.value.err===null&&Number.isSafeInteger(sim.value.unitsConsumed)&&sim.value.unitsConsumed<=200000,'CEREMONY_SOLANA_SIMULATION_REJECTED');
  const simulatedAta=decodeTokenAccount(sim.value.accounts?.[0],{mint:d.destinationToken,owner:d.destinationOwner});
  if(key==='RECEIVE')ensure(atomic(simulatedAta.amountAtomic)-atomic(z.ata.amountAtomic)===atomic(d.amountAtomic)-atomic(attested.message.feeExecutedAtomic),'CEREMONY_RECEIVE_SIMULATED_DELTA');
  details={networkFeeAtomic:String(fee.value),rentAtomic:key==='ATA'?z.ataRentAtomic:z.nonceRentAtomic,simulation:{slot:sim.context.slot,units:sim.value.unitsConsumed,simulatedAta},attested:attested??null,burn:burn??null,sourceMaterial:sourceMaterial??null};
 }
 const spent=d.stages.filter(s=>s.networkRef===spec.networkRef).reduce((n,s)=>n+atomic(current.state.stages[s.key].evidence?.nativeDebitAtomic??'0'),0n);
 ensure(spent+atomic(nativeMaximumAtomic)<=atomic(spec.networkRef==='solana:devnet'?d.feeCaps.destinationNativeAtomic:d.feeCaps.sourceNativeAtomic)&&atomic(nativeMaximumAtomic)<=atomic(spec.nativeCap),'CEREMONY_STAGE_TOTAL_FEE_CAP');
 ensure(atomic(spec.networkRef==='solana:devnet'?facts.solana.nativeBalance:facts.base.nativeBalance)>=atomic(nativeMaximumAtomic),'CEREMONY_STAGE_NATIVE_BALANCE');
 const material=snapshot('CeremonyTransactionMaterial',{schemaVersion:1,scope:'UNSIGNED_TESTNET_ONLY',stageKey:key,selection:x,request,accountSelection,plan,candidate,facts,details});
 const body={schemaVersion:1,scope:d.scope==='SIMULATED_CEREMONY'?'SIMULATED_CEREMONY':'READ_ONLY_TESTNET_JIT',ceremonyHash:d.contentHash,stageId:stageId(d,key),stageKey:key,networkRef:spec.networkRef,actor:spec.actor,bindingsHash:d.bindingsHash,routeHash:d.routeHash,deploymentHash:d.deploymentHash,configurationHash:d.configurationHash,priorEvidenceHash:priorEvidenceHash(d,current.state.stages,key),observedAt,validUntil,nativeMaximumAtomic,nativeIdentity,candidateHash:material.contentHash,observationHash:facts.contentHash,
 summary:stageSummary(d,key),canSign:false,canSend:false};
 const prepared=createStagePreparation({...body,intentHash:hash('CeremonyExactStageIntent',body)});
 ensure(fresh(observedAt,validUntil,clock()),'CEREMONY_JIT_EXPIRED_DURING_PREPARATION');
 return {kind:'PREPARED',prepared,material};
}
export function stageSummary(d,key){const spec=d.stages.find(s=>s.key===key);return {chain:spec.networkRef,asset:key==='ATA'?'USDC ATA prerequisite':d.sourceToken+' -> '+d.destinationToken,amountAtomic:key==='ATA'?'0':d.amountAtomic,recipient:key==='SOURCE_APPROVAL'?P.messenger.toLowerCase():d.destinationAta,authorizes:{ATA:'Create only this destination USDC ATA',SOURCE_APPROVAL:'Approve only the exact bounded USDC amount',BURN:'Burn only the exact USDC amount for the bound CCTP destination',RECEIVE:'Receive only this verified CCTP message into the bound USDC ATA'}[key],excludes:d.stages.filter(s=>s.key!==key).map(s=>s.key).concat(['SWAP','SPONSOR_SPEND','OTHER_INTENT'])};}
function verifyBurnMaterial(current,selection,material){
 const {contentHash,...body}=material,d=current.definition;
 ensure(material.stageKey==='BURN'&&sameHash(contentHash,hash('CeremonyTransactionMaterial',body))&&sameHash(contentHash,current.state.stages.BURN.prepared.candidateHash),'CEREMONY_SOURCE_MATERIAL_MUTATION');
 const expected=bareRequest(selection,material.facts.base.usdcBalance,material.request.createdAt,material.request.validUntil);
 ensure(canonicalize(expected.request)===canonicalize(material.request)&&sameHash(expected.accountSelection.contentHash,material.accountSelection.contentHash),'CEREMONY_SOURCE_MATERIAL_ECONOMICS');
 verifyCrossChainPreparation(material.plan,expected.request,cctpPreparationProfile(d.deploymentHash,material.facts.configuration),material.plan.createdAt,{reconcile:true,accountSelection:expected.accountSelection});
 verifySourceTransaction(expected.request,material.candidate);ensure(material.candidate.kind==='BURN','CEREMONY_SOURCE_MATERIAL_KIND');
}
export class CctpStageVerifier{
 constructor({selection,accepted,rpc=readOnlyRpc(),collect=collectCeremonyFacts,clock=()=>new Date().toISOString()}){this.selection=normalizeOperatorSelection(selection);this.accepted=accepted;this.rpc=rpc;this.collect=collect;this.clock=clock;}
 async assertFresh(current,key,material,now){
  await this.assertMaterial(current,key,material);
  const stage=current.state.stages[key],p=stage?.prepared,{contentHash,...body}=material;
  ensure(p&&material.stageKey===key&&sameHash(contentHash,hash('CeremonyTransactionMaterial',body))&&sameHash(p.candidateHash,contentHash),'CEREMONY_MATERIAL_MUTATION');
  const {contentHash:ignored,intentHash,...intentBody}=p;ensure(sameHash(intentHash,hash('CeremonyExactStageIntent',intentBody)),'CEREMONY_INTENT_MUTATION');
  ensure(fresh(p.observedAt,p.validUntil,now),'CEREMONY_EXPIRED_HUMAN_GATE');
  ensure(sameHash(hash('CeremonyEconomicSelection',economicBindings(material.selection)),current.definition.bindingsHash),'CEREMONY_MATERIAL_ECONOMICS');
  ensure(canonicalize(p.summary)===canonicalize(stageSummary(current.definition,key)),'CEREMONY_MATERIAL_DISPLAY_BINDING');
  ensure(sameHash(p.observationHash,material.facts.contentHash),'CEREMONY_MATERIAL_OBSERVATION');
  const expectedCap=p.networkRef==='eip155:84532:base-sepolia'?String(atomic(key==='SOURCE_APPROVAL'?this.selection.approvalGasLimit:this.selection.burnGasLimit)*atomic(this.selection.maxFeePerGas)+atomic(this.selection.maximumL1FeePerTransactionAtomic)):String(atomic(material.details.networkFeeAtomic)+atomic(key==='ATA'?material.facts.solana.ataRentAtomic:material.facts.solana.nonceRentAtomic));
  ensure(p.nativeMaximumAtomic===expectedCap,'CEREMONY_MATERIAL_FEE_BINDING');
  const facts=await this.collect(this.selection,this.accepted,{rpc:this.rpc,clock:this.clock});validateJitFacts(current.definition,this.selection,facts,this.clock(),{stageKey:key});
  ensure(atomic(p.networkRef==='solana:devnet'?facts.solana.nativeBalance:facts.base.nativeBalance)>=atomic(p.nativeMaximumAtomic),'CEREMONY_STAGE_NATIVE_BALANCE_CHANGED');
  ensure(sameHash(hash('CeremonyMintControls',facts.solana.mintIdentity),hash('CeremonyMintControls',material.facts.solana.mintIdentity)),'CEREMONY_TOKEN_CONTROL_CHANGED');
  if(p.networkRef==='eip155:84532:base-sepolia'){
   verifySourceTransaction(material.request,material.candidate);
   ensure(facts.base.noncePending===material.candidate.nonce,'CEREMONY_SOURCE_NONCE_CHANGED');
   if(key==='BURN')ensure(facts.solana.ata&&facts.base.allowance===this.selection.amountAtomic&&facts.base.finalizedAllowance===this.selection.amountAtomic,'CEREMONY_BURN_PREREQUISITES');
   else ensure(facts.base.allowance==='0'&&facts.base.finalizedAllowance==='0','CEREMONY_ALLOWANCE_CHANGED');
   const fee=await observeBaseFeeBounds({transactionBytes:bytes(material.candidate.signingPreimage).length+75,rpc:this.rpc});ensure(atomic(fee.l1UpperBoundAtomic)<=atomic(material.candidate.maximumL1FeeAtomic)&&atomic(fee.baseFeePerGas)+atomic(this.selection.maxPriorityFeePerGas)<=atomic(material.candidate.maxFeePerGas),'CEREMONY_SOURCE_FEE_CHANGED');
  }else{
   ensure(facts.solana.blockHeight+5<material.candidate.lastValidBlockHeight,'CEREMONY_SOLANA_BLOCKHASH_EXPIRED');
   if(key==='ATA')ensure(!facts.solana.ata,'CEREMONY_ATA_NOW_EXISTS_RECONCILE');else{
    ensure(facts.solana.ata,'CEREMONY_ATA_PREREQUISITE_LOST');
    const a=await this.rpc.read(P.solRpc,'getAccountInfo',[cctpAccounts(p.nativeIdentity).usedNonce,{commitment:'finalized',encoding:'base64'}]);ensure(a.value===null,'CEREMONY_RECEIVE_NONCE_ALREADY_EXISTS_RECONCILE');
   }
   const tx=Transaction.from(Buffer.from(material.candidate.unsignedWireBase64,'base64')),fee=await this.rpc.read(P.solRpc,'getFeeForMessage',[tx.serializeMessage().toString('base64'),{commitment:'finalized'}]);
   const cost=BigInt(fee.value)+atomic(key==='ATA'?facts.solana.ataRentAtomic:facts.solana.nonceRentAtomic);ensure(cost<=atomic(p.nativeMaximumAtomic),'CEREMONY_SOLANA_FEE_CHANGED');
  }
  ensure(fresh(p.observedAt,p.validUntil,this.clock()),'CEREMONY_EXPIRED_DURING_FRESH_RECHECK');
  return snapshot('CeremonyFreshCheck',{schemaVersion:1,stageId:p.stageId,preparedHash:p.contentHash,checkedAt:this.clock(),factsHash:facts.contentHash,scope:'READ_ONLY_TESTNET'});
 }
 async verifySigned(current,key,material,wire){await this.assertMaterial(current,key,material);return verifyExternalSignedWire(current.state.stages[key].prepared,material,wire);}
 async assertMaterial(current,key,material){
  const {contentHash,...body}=material,p=current.state.stages[key]?.prepared;
  ensure(p&&material.stageKey===key&&sameHash(contentHash,hash('CeremonyTransactionMaterial',body))&&sameHash(p.candidateHash,contentHash),'CEREMONY_MATERIAL_MUTATION');
  ensure(sameHash(hash('CeremonyEconomicSelection',economicBindings(material.selection)),current.definition.bindingsHash),'CEREMONY_MATERIAL_ECONOMICS');
  ensure(canonicalize(p.summary)===canonicalize(stageSummary(current.definition,key)),'CEREMONY_MATERIAL_DISPLAY_BINDING');
  ensure(sameHash(p.observationHash,material.facts.contentHash),'CEREMONY_MATERIAL_OBSERVATION');
  const expectedCap=p.networkRef==='eip155:84532:base-sepolia'?String(atomic(key==='SOURCE_APPROVAL'?this.selection.approvalGasLimit:this.selection.burnGasLimit)*atomic(this.selection.maxFeePerGas)+atomic(this.selection.maximumL1FeePerTransactionAtomic)):String(atomic(material.details.networkFeeAtomic)+atomic(key==='ATA'?material.facts.solana.ataRentAtomic:material.facts.solana.nonceRentAtomic));
  ensure(p.nativeMaximumAtomic===expectedCap,'CEREMONY_MATERIAL_FEE_BINDING');
  validateJitFacts(current.definition,this.selection,material.facts,material.facts.observedAt,{stageKey:key});
  const source=key==='RECEIVE'?material.details.sourceMaterial:null;
  if(source)verifyBurnMaterial(current,this.selection,source);
  const expected=source?{request:source.request,accountSelection:source.accountSelection}:bareRequest(this.selection,material.facts.base.usdcBalance,p.observedAt,p.validUntil);
  ensure(canonicalize(material.request)===canonicalize(expected.request)&&sameHash(material.accountSelection.contentHash,expected.accountSelection.contentHash),'CEREMONY_MATERIAL_REQUEST_BINDING');
  const acceptedProfile=source?source.plan.profile:cctpPreparationProfile(current.definition.deploymentHash,material.facts.configuration);
  verifyCrossChainPreparation(material.plan,expected.request,acceptedProfile,material.facts.observedAt,{reconcile:true,accountSelection:expected.accountSelection});
  ensure(sameHash(material.plan.profile.identityHash,current.definition.deploymentHash)&&sameHash(material.plan.profile.configurationHash,current.definition.configurationHash),'CEREMONY_MATERIAL_ROUTE');
  if(p.networkRef==='eip155:84532:base-sepolia'){
   verifySourceTransaction(material.request,material.candidate);
   const c=material.candidate,kind=key==='SOURCE_APPROVAL'?'APPROVAL':'BURN',gas=kind==='APPROVAL'?this.selection.approvalGasLimit:this.selection.burnGasLimit;
   ensure(c.kind===kind&&c.nonce===p.nativeIdentity&&c.gasLimit===gas&&c.maxFeePerGas===this.selection.maxFeePerGas&&c.maxPriorityFeePerGas===this.selection.maxPriorityFeePerGas&&c.maximumL1FeeAtomic===this.selection.maximumL1FeePerTransactionAtomic&&c.feeBudgetAtomic===p.nativeMaximumAtomic,'CEREMONY_MATERIAL_SOURCE_ENVELOPE');
  }else if(key==='ATA'){
   const c=material.candidate,tx=new Transaction({feePayer:new PublicKey(current.definition.feePayer),blockhash:c.blockhash,lastValidBlockHeight:c.lastValidBlockHeight});
   tx.add(createRecipientAtaInstruction(current.definition.destinationOwner,current.definition.feePayer));
   ensure(c.unsignedWireBase64===tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64')&&c.messageSha256===sha(tx.serializeMessage()),'CEREMONY_MATERIAL_ATA_MUTATION');
  }else{
   const a=material.details.attested,b=material.details.burn,c=material.candidate;
   ensure(a&&b&&sameHash(a.message.contentHash,current.state.watch.messageHash)&&sameHash(a.attestation.contentHash,current.state.watch.attestationHash),'CEREMONY_MATERIAL_ATTESTATION');
   verifyCctpDestination(c,{request:material.request,plan:material.plan,acceptedAccountSelection:expected.accountSelection,observation:material.facts.configuration,identityHash:current.definition.deploymentHash,now:material.facts.observedAt,sourceMessage:b.sourceMessage,message:a.message.bytes,attestation:a.attestationBytes,feePayer:current.definition.feePayer,blockhash:c.blockhash,lastValidBlockHeight:c.lastValidBlockHeight,createAta:false});
  }
 }
}
