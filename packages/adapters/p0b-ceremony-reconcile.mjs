// Finalized evidence is independently correlated to the one durable signed transaction.
import {PublicKey,Transaction} from '@solana/web3.js';
import {ensure,hash,snapshot,sameHash,atomic} from '../core/canonical.mjs';
import {createStageEvidence,priorEvidenceHash} from '../core/p0b-ceremony.mjs';
import {CCTP_CANDIDATE as P} from './cctp-readonly.mjs';
import {readOnlyRpc,decodeTokenAccount} from './cctp-observation.mjs';
import {verifySourceBurnEvidence,verifyDestinationEvidence} from './cctp-reconciliation.mjs';
import {bytes,hex,keccak,address32,word,sha,cctpAccounts} from './cctp-codec.mjs';
import {rlp} from './cctp-source-transaction.mjs';
import {verifyExternalSignedWire,encode58} from './p0b-ceremony-signed.mjs';
const quantity=x=>{ensure(/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x),'RECEIPT_CANONICAL_QUANTITY');const n=BigInt(x);if(n===0n)return Buffer.alloc(0);let h=n.toString(16);return Buffer.from(h.padStart(Math.ceil(h.length/2)*2,'0'),'hex');};
const signatureQuantity=x=>{ensure(/^0x[0-9a-f]{1,64}$/.test(x),'RECEIPT_SIGNATURE_ENCODING');return quantity('0x'+BigInt(x).toString(16));};
export function signedEvmWireFromRpc(tx){
 ensure(tx?.type==='0x2'&&Array.isArray(tx.accessList)&&tx.accessList.length===0,'RECEIPT_EVM_TYPE_OR_ACCESS_LIST');
 const fields=[tx.chainId,tx.nonce,tx.maxPriorityFeePerGas,tx.maxFeePerGas,tx.gas].map(quantity);
 return hex(Buffer.concat([Buffer.from([2]),rlp([...fields,bytes(tx.to.toLowerCase()),quantity(tx.value),bytes(tx.input),[],quantity(tx.yParity??tx.v),signatureQuantity(tx.r),signatureQuantity(tx.s)])]));
}
export function finalizedBaseEnvelope(current,key,material,{transaction,receipt,finalizedBlock,receiptBlock}){
 const stage=current.state.stages[key],tx=transaction,r=receipt;
 const verified=verifyExternalSignedWire(stage.prepared,material,signedEvmWireFromRpc(tx));
 ensure(verified.transactionRef===stage.transactionRef&&sameHash(verified.signedWireHash,stage.signedWireHash)&&tx.hash===stage.transactionRef&&r.transactionHash===stage.transactionRef,'CEREMONY_RECEIPT_TRANSACTION_BINDING');
 ensure(tx.from.toLowerCase()===stage.prepared.actor&&tx.blockHash===r.blockHash&&tx.blockNumber===r.blockNumber&&r.blockHash===receiptBlock.hash&&r.blockNumber===receiptBlock.number&&BigInt(r.blockNumber)<=BigInt(finalizedBlock.number),'CEREMONY_BASE_FINALITY');
 ensure(r.status==='0x1'||r.status==='0x0','CEREMONY_RECEIPT_STATUS');
 ensure(Object.hasOwn(r,'l1Fee')&&BigInt(r.operatorFeeScalar??'0x0')===0n&&BigInt(r.operatorFeeConstant??'0x0')===0n,'CEREMONY_BASE_L1_FEE_OR_OPERATOR');
 ensure(BigInt(r.l1Fee)<=atomic(material.candidate.maximumL1FeeAtomic)&&BigInt(r.gasUsed)<=atomic(material.candidate.gasLimit),'CEREMONY_RECEIPT_L1_OR_GAS_CAP');
 const debit=BigInt(r.gasUsed)*BigInt(r.effectiveGasPrice)+BigInt(r.l1Fee);
 ensure(debit<=atomic(stage.prepared.nativeMaximumAtomic),'CEREMONY_RECEIPT_STAGE_FEE_CAP');
 return {verified,nativeDebitAtomic:String(debit),outcome:r.status==='0x1'?'SUCCESS':'REVERTED'};
}
export function finalizedApprovalObservation(current,material,data){
 const verified=finalizedBaseEnvelope(current,'SOURCE_APPROVAL',material,data);
 if(verified.outcome==='SUCCESS'){
  const topic=keccak(Buffer.from('Approval(address,address,uint256)')),logs=data.receipt.logs.filter(l=>l.address.toLowerCase()===P.usdc.toLowerCase()&&l.topics?.[0]===topic);
  ensure(logs.length===1&&logs[0].removed===false&&logs[0].transactionHash===current.state.stages.SOURCE_APPROVAL.transactionRef&&logs[0].blockHash===data.receipt.blockHash&&logs[0].topics.length===3&&logs[0].topics[1]===address32(current.definition.sourceWallet)&&logs[0].topics[2]===address32(P.messenger)&&logs[0].data===hex(word(current.definition.amountAtomic)),'CEREMONY_APPROVAL_EVENT_BINDING');
 }
 return snapshot('CeremonyApprovalObservation',{schemaVersion:1,scope:'READ_ONLY_TESTNET',transactionRef:current.state.stages.SOURCE_APPROVAL.transactionRef,block:data.receipt.blockNumber,blockHash:data.receipt.blockHash,spender:P.messenger.toLowerCase(),owner:current.definition.sourceWallet,token:P.usdc.toLowerCase(),amountAtomic:current.definition.amountAtomic,...verified});
}
export function finalizedAtaObservation(current,material,{transactionResult,signatureStatus,ataAccount}){
 const stage=current.state.stages.ATA,d=current.definition,result=transactionResult,status=signatureStatus;
 ensure(result?.transaction?.[1]==='base64'&&status?.confirmationStatus==='finalized'&&result.slot===status.slot,'CEREMONY_ATA_FINALITY');
 const verified=verifyExternalSignedWire(stage.prepared,material,result.transaction[0]);ensure(verified.transactionRef===stage.transactionRef&&sameHash(verified.signedWireHash,stage.signedWireHash),'CEREMONY_ATA_EXACT_SIGNATURE');
 ensure((status.err===null)===(result.meta.err===null),'CEREMONY_ATA_CONTRADICTORY_RPC');
 const tx=Transaction.from(Buffer.from(result.transaction[0],'base64')),keys=tx.compileMessage().accountKeys.map(p=>p.toBase58());
 ensure(keys[0]===d.feePayer&&Number.isSafeInteger(result.meta.preBalances[0])&&Number.isSafeInteger(result.meta.postBalances[0]),'CEREMONY_ATA_PAYER');
 const debit=BigInt(result.meta.preBalances[0])-BigInt(result.meta.postBalances[0]);ensure(debit>=0n&&debit<=atomic(stage.prepared.nativeMaximumAtomic),'CEREMONY_ATA_DEBIT_CAP');
 const outcome=result.meta.err===null?'SUCCESS':'REVERTED';let ata=null;
 if(outcome==='SUCCESS')ata={address:d.destinationAta,...decodeTokenAccount(ataAccount,{mint:d.destinationToken,owner:d.destinationOwner})};
 return snapshot('CeremonyAtaObservation',{schemaVersion:1,scope:'READ_ONLY_TESTNET',transactionRef:stage.transactionRef,slot:result.slot,recipient:d.destinationAta,owner:d.destinationOwner,mint:d.destinationToken,outcome,nativeDebitAtomic:String(debit),ata,messageHash:material.candidate.messageSha256});
}
export function stageEvidenceForObservation(current,key,observation){
 const d=current.definition,s=current.state.stages[key];return createStageEvidence({schemaVersion:1,scope:d.scope==='SIMULATED_CEREMONY'?'SIMULATED_CEREMONY':'READ_ONLY_TESTNET',ceremonyHash:d.contentHash,stageId:s.stageId,stageKey:key,bindingsHash:d.bindingsHash,routeHash:d.routeHash,deploymentHash:d.deploymentHash,configurationHash:d.configurationHash,priorEvidenceHash:priorEvidenceHash(d,current.state.stages,key),transactionRef:s.transactionRef,preparedHash:s.prepared.contentHash,signedWireHash:s.signedWireHash,finality:'FINALIZED',outcome:observation.outcome??'SUCCESS',nativeDebitAtomic:observation.nativeDebitAtomic??observation.nativeFeeAtomic,observedAt:new Date().toISOString(),chainEvidenceHash:observation.contentHash});
}
export async function reconcileCeremonyStage(current,key,material,{rpc=readOnlyRpc()}={}){
 const s=current.state.stages[key];ensure(s?.sendIntent&&s.transactionRef&&s.signedWireHash,'CEREMONY_RECONCILE_NO_BROADCAST_REFERENCE');
 try{
  if(s.prepared.networkRef==='eip155:84532:base-sepolia'){
   const tx=await rpc.read(P.baseRpc,'eth_getTransactionByHash',[s.transactionRef]),receipt=await rpc.read(P.baseRpc,'eth_getTransactionReceipt',[s.transactionRef]);
   if(!tx||!receipt)return {status:'UNKNOWN_RECONCILIATION_REQUIRED',canResend:false};
   const finalizedBlock=await rpc.read(P.baseRpc,'eth_getBlockByNumber',['finalized',false]);
   if(!receipt.blockNumber||BigInt(receipt.blockNumber)>BigInt(finalizedBlock.number))return {status:'SETTLING',canResend:false};
   const receiptBlock=await rpc.read(P.baseRpc,'eth_getBlockByNumber',[receipt.blockNumber,false]),data={transaction:tx,receipt,finalizedBlock,receiptBlock};
   const envelope=finalizedBaseEnvelope(current,key,material,data);
   let observation;if(key==='SOURCE_APPROVAL')observation=finalizedApprovalObservation(current,material,data);
   else if(envelope.outcome==='REVERTED')observation=snapshot('CeremonyBurnReverted',{schemaVersion:1,scope:'READ_ONLY_TESTNET',transactionRef:s.transactionRef,block:receipt.blockNumber,blockHash:receipt.blockHash,...envelope});
   else observation=verifySourceBurnEvidence(material.request,{...data,expectedTransactionHash:s.transactionRef,expectedNonce:'0x'+BigInt(material.candidate.nonce).toString(16)});
   return {status:'FINALIZED',observation,proof:stageEvidenceForObservation(current,key,observation),canResend:false};
  }
  const statuses=await rpc.read(P.solRpc,'getSignatureStatuses',[[s.transactionRef],{searchTransactionHistory:true}]),status=statuses.value?.[0];
  if(!status||status.confirmationStatus!=='finalized')return {status:status?'SETTLING':'UNKNOWN_RECONCILIATION_REQUIRED',canResend:false};
  const result=await rpc.read(P.solRpc,'getTransaction',[s.transactionRef,{commitment:'finalized',encoding:'base64',maxSupportedTransactionVersion:0}]);if(!result)return {status:'UNKNOWN_RECONCILIATION_REQUIRED',canResend:false};
  let observation;
  if(key==='ATA'){
   const account=await rpc.read(P.solRpc,'getAccountInfo',[current.definition.destinationAta,{commitment:'finalized',encoding:'base64',minContextSlot:status.slot}]);
   observation=finalizedAtaObservation(current,material,{transactionResult:result,signatureStatus:status,ataAccount:account.value});
  }else{
   const candidate={...material.candidate,transactionRef:s.transactionRef},nonce=material.details.attested.message.nonce,usedNonceAddress=material.details.attested.message.nonce===s.prepared.nativeIdentity? cctpAccounts(nonce).usedNonce:null;
   ensure(usedNonceAddress,'CEREMONY_RECEIVE_NONCE_BINDING');const used=await rpc.read(P.solRpc,'getAccountInfo',[usedNonceAddress,{commitment:'finalized',encoding:'base64',minContextSlot:status.slot}]);
   if(result.meta.err!==null){
    const verified=verifyExternalSignedWire(s.prepared,material,result.transaction[0]);ensure(verified.transactionRef===s.transactionRef&&sameHash(verified.signedWireHash,s.signedWireHash),'CEREMONY_RECEIVE_REVERTED_BINDING');
    ensure(status.err!==null&&result.slot===status.slot,'CEREMONY_RECEIVE_REVERTED_STATUS');
    const debit=BigInt(result.meta.preBalances[0])-BigInt(result.meta.postBalances[0]);ensure(debit>=0n&&debit<=atomic(s.prepared.nativeMaximumAtomic),'CEREMONY_RECEIVE_REVERTED_FEE');
    observation=snapshot('CeremonyReceiveReverted',{schemaVersion:1,scope:'READ_ONLY_TESTNET',transactionRef:s.transactionRef,slot:result.slot,outcome:'REVERTED',nativeDebitAtomic:String(debit)});
   }else observation=verifyDestinationEvidence(material.request,candidate,material.details.attested.message.bytes,{transactionResult:result,signatureStatus:{...status,signature:s.transactionRef},usedNonceAccount:used.value,usedNonceAddress});
  }
  return {status:'FINALIZED',observation,proof:stageEvidenceForObservation(current,key,observation),canResend:false};
 }catch(e){return {status:'UNKNOWN_RECONCILIATION_REQUIRED',reason:'RPC_OR_EVIDENCE_REJECTED',evidenceErrorCode:/^[A-Z0-9_:]+$/.test(e.message)?e.message:'LOCAL_VERIFICATION_REJECTED',canResend:false};}
}
