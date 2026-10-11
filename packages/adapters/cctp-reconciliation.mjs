// Parse chain receipts and protocol bytes locally. Provider claims cannot synthesize evidence.
import {PublicKey,Transaction} from '@solana/web3.js';
import {ensure,hash,snapshot,atomic,sameHash} from '../core/canonical.mjs';
import {CCTP_CANDIDATE as P} from './cctp-readonly.mjs';
import {bytes,hex,keccak,verifyMessage,verifyAttestation,verifySourceCall,disc,solBytes,sha,cctpAccounts} from './cctp-codec.mjs';
import {readOnlyRpc,accountBytes,decodeCctpAccount} from './cctp-observation.mjs';
export function decodeMessageSentLog(log){
 ensure(log.address.toLowerCase()===P.transmitter.toLowerCase()&&log.topics?.length===1&&log.topics[0]===keccak(Buffer.from('MessageSent(bytes)'))&&log.removed===false,'MESSAGE_SENT_LOG_BINDING');
 const b=bytes(log.data);ensure(b.length>=64&&BigInt(hex(b.subarray(0,32)))===32n,'MESSAGE_SENT_ABI_OFFSET');
 const length=BigInt(hex(b.subarray(32,64)));ensure(length===376n&&b.length===64+Math.ceil(Number(length)/32)*32&&b.subarray(64+Number(length)).every(x=>x===0),'MESSAGE_SENT_ABI_LENGTH');
 return hex(b.subarray(64,64+Number(length)));
}
export function verifySourceBurnEvidence(request,{transaction,receipt,finalizedBlock,receiptBlock,expectedTransactionHash,expectedNonce}){
 const tx=transaction,r=receipt;
 ensure(/^0x[0-9a-f]{64}$/.test(expectedTransactionHash)&&tx?.hash===expectedTransactionHash&&r?.transactionHash===expectedTransactionHash,'BURN_TX_HASH');
 ensure(tx.chainId===P.chainId&&tx.nonce===expectedNonce&&tx.blockHash===r.blockHash&&tx.blockNumber===r.blockNumber&&r.blockHash===receiptBlock.hash&&r.blockNumber===receiptBlock.number&&BigInt(r.blockNumber)<=BigInt(finalizedBlock.number)&&r.status==='0x1','BURN_RECEIPT_FINALITY');
 verifySourceCall(request,{chainId:84532,from:tx.from,to:tx.to,value:tx.value,data:tx.input},'BURN');
 const matching=r.logs.filter(l=>l.address.toLowerCase()===P.transmitter.toLowerCase()&&l.topics?.[0]===keccak(Buffer.from('MessageSent(bytes)')));
 ensure(matching.length===1&&matching[0].transactionHash===expectedTransactionHash&&matching[0].blockHash===r.blockHash,'BURN_LOG_CORRELATION');
 const message=decodeMessageSentLog(matching[0]),decoded=verifyMessage(request,message);
 ensure(BigInt(r.operatorFeeScalar??'0x0')===0n&&BigInt(r.operatorFeeConstant??'0x0')===0n,'UNSUPPORTED_BASE_OPERATOR_FEE');
 const fee=BigInt(r.gasUsed)*BigInt(r.effectiveGasPrice)+BigInt(r.l1Fee??'0x0');
 ensure(Object.hasOwn(r,'l1Fee')&&fee<=atomic(request.feeCaps.sourceNativeAtomic),'SOURCE_RECEIPT_NATIVE_FEE_OR_MISSING_L1');
 return snapshot('CctpBurnObservation',{schemaVersion:1,scope:'READ_ONLY_TESTNET',transactionHash:expectedTransactionHash,nonce:expectedNonce,blockHash:r.blockHash,blockNumber:r.blockNumber,logIndex:matching[0].logIndex,sourceMessage:message,sourceMessageHash:decoded.messageHash,protocolCommitmentHash:decoded.immutableHash,nativeFeeAtomic:fee.toString(),
 burnIdentity:hash('CctpBurnIdentity',{chainId:84532,transactionHash:expectedTransactionHash,blockHash:r.blockHash,logIndex:matching[0].logIndex,messageHash:decoded.messageHash})});
}
export async function readSourceBurnEvidence(request,attempt,{rpc=readOnlyRpc()}={}){
 const [transaction,receipt,finalizedBlock]=await Promise.all([rpc.read(P.baseRpc,'eth_getTransactionByHash',[attempt.transactionRef]),rpc.read(P.baseRpc,'eth_getTransactionReceipt',[attempt.transactionRef]),rpc.read(P.baseRpc,'eth_getBlockByNumber',['finalized',false])]);
 if(!transaction||!receipt)return {state:'UNKNOWN',nextAction:'RECONCILE',canResend:false};
 const receiptBlock=await rpc.read(P.baseRpc,'eth_getBlockByNumber',[receipt.blockNumber,false]);
 return verifySourceBurnEvidence(request,{transaction,receipt,finalizedBlock,receiptBlock,expectedTransactionHash:attempt.transactionRef,expectedNonce:attempt.nativeIdentity});
}
export function verifyIrisObservation(request,burn,body,configuration){
 ensure(body&&Array.isArray(body.messages)&&body.messages.length===1,'IRIS_AMBIGUOUS_MESSAGE_SET');
 const item=body.messages[0];
 if(item.status==='pending'&&(!item.attestation||item.attestation==='PENDING'))return {state:'SETTLING',nextAction:'OBSERVE_ATTESTATION',canResend:false};
 ensure(item.status==='complete'&&typeof item.message==='string'&&typeof item.attestation==='string','IRIS_CONTRADICTORY_STATUS');
 const message=verifyMessage(request,item.message,{sourceMessage:burn.sourceMessage,attested:true}),attestation=verifyAttestation(item.message,item.attestation,configuration.destination);
 return snapshot('CctpAttestedObservation',{schemaVersion:1,scope:'READ_ONLY_TESTNET',burnIdentity:burn.burnIdentity,message,attestation,attestationBytes:item.attestation,nextAction:'PREPARE_UNSIGNED_DESTINATION',canSign:false,canSend:false});
}
export async function observeAttestation(request,burn,configuration,{fetchImpl=globalThis.fetch}={}){
 const url='https://iris-api-sandbox.circle.com/v2/messages/6?transactionHash='+burn.transactionHash;
 const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(20000)});ensure(response.ok,'IRIS_READ_HTTP');
 return verifyIrisObservation(request,burn,await response.json(),configuration);
}
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function decode58(s){ensure(typeof s==='string'&&s.length<=4096,'BASE58_DATA');let n=0n;for(const c of s){const v=alphabet.indexOf(c);ensure(v>=0,'BASE58_DATA');n=n*58n+BigInt(v);}let b=n?Buffer.from(n.toString(16).padStart(Math.ceil(n.toString(16).length/2)*2,'0'),'hex'):Buffer.alloc(0);let zeros=0;for(const c of s){if(c!=='1')break;zeros++;}return Buffer.concat([Buffer.alloc(zeros),b]);}
export function verifyDestinationEvidence(request,candidate,attestedMessage,{transactionResult,signatureStatus,usedNonceAccount,usedNonceAddress}){
 ensure(signatureStatus?.confirmationStatus==='finalized'&&signatureStatus.err===null&&transactionResult?.meta?.err===null&&transactionResult.slot===signatureStatus.slot,'DESTINATION_FINALITY');
 ensure(transactionResult.transaction?.[1]==='base64','DESTINATION_TRANSACTION_ENCODING');
 const tx=Transaction.from(Buffer.from(transactionResult.transaction[0],'base64'));
 ensure(sha(tx.serializeMessage())===candidate.messageSha256&&tx.signatures.every(s=>s.signature),'DESTINATION_EXACT_MESSAGE');
 ensure(signatureStatus.signature===candidate.transactionRef&&tx.signatures[0].signature.equals(decode58(candidate.transactionRef))&&tx.verifySignatures(),'DESTINATION_SIGNATURE_BINDING');
 const decoded=verifyMessage(request,attestedMessage,{attested:true}),a=cctpAccounts(decoded.nonce),used=decodeCctpAccount('UsedNonce',accountBytes(usedNonceAccount,P.solTransmitter));
 ensure(used.is_used===true&&usedNonceAddress===a.usedNonce,'DESTINATION_NONCE_NOT_CONSUMED_OR_ADDRESS');
 const keys=tx.compileMessage().accountKeys.map(p=>p.toBase58()),inner=transactionResult.meta.innerInstructions??[],events=[];
 for(const group of inner)for(const ix of group.instructions){
  if(keys[ix.programIdIndex]!==P.solMessenger)continue;
  const b=decode58(ix.data);if(b.subarray(0,8).toString('hex')!=='e445a52e51cb9a1d'||!b.subarray(8,16).equals(disc('event:MintAndWithdraw')))continue;
  ensure(b.length===96,'MINT_EVENT_LAYOUT');events.push({recipient:new PublicKey(b.subarray(16,48)).toBase58(),amountAtomic:b.readBigUInt64LE(48).toString(),mint:new PublicKey(b.subarray(56,88)).toBase58(),feeAtomic:b.readBigUInt64LE(88).toString()});
 }
 ensure(events.length===1,'CORRELATED_MINT_EVENT_REQUIRED');const e=events[0],net=atomic(request.amountAtomic)-atomic(decoded.feeExecutedAtomic);
 ensure(e.recipient===request.recipient&&e.mint===P.mint&&atomic(e.amountAtomic)===net&&e.feeAtomic===decoded.feeExecutedAtomic&&net>=atomic(request.minimumDestinationAtomic),'DESTINATION_MINT_BINDING');
 const meta=transactionResult.meta,recipientIndex=keys.indexOf(request.recipient);
 const before=meta.preTokenBalances?.find(b=>b.accountIndex===recipientIndex),after=meta.postTokenBalances?.find(b=>b.accountIndex===recipientIndex);
 ensure(after?.mint===P.mint&&after.owner===request.destinationBinding.fundsAddress&&(!before||before.mint===P.mint&&before.owner===after.owner)&&atomic(after.uiTokenAmount.amount)-atomic(before?.uiTokenAmount?.amount??'0')===net,'DESTINATION_BALANCE_CORRELATION');
 // Include ATA rent, used-nonce rent, and the network fee in the payer debit.
 const payerIndex=keys.indexOf(candidate.feePayer);ensure(payerIndex===0&&Number.isSafeInteger(meta.preBalances[0])&&Number.isSafeInteger(meta.postBalances[0]),'DESTINATION_PAYER_BALANCE');
 const debit=BigInt(meta.preBalances[0])-BigInt(meta.postBalances[0]);ensure(debit>=0n&&debit<=atomic(request.feeCaps.destinationNativeAtomic),'DESTINATION_TOTAL_NATIVE_FEE');
 return snapshot('CctpMintObservation',{schemaVersion:1,scope:'READ_ONLY_TESTNET',signature:candidate.transactionRef,slot:transactionResult.slot,nonce:decoded.nonce,usedNonce:a.usedNonce,messageHash:decoded.messageHash,recipient:e.recipient,mint:e.mint,owner:after.owner,amountAtomic:e.amountAtomic,nativeFeeAtomic:debit.toString(),mintIdentity:candidate.mintIdentity});
}
