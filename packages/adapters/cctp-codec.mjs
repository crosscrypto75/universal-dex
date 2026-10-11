// CCTP V2 bytes are decoded locally; Iris/provider status is never authority.
import {createHash} from 'node:crypto';
import {keccak_256} from '@noble/hashes/sha3';
import {secp256k1} from '@noble/curves/secp256k1';
import {PublicKey} from '@solana/web3.js';
import {ensure,atomic,hash,canonicalize,snapshot} from '../core/canonical.mjs';
import {CCTP_CANDIDATE as P} from './cctp-readonly.mjs';
export const ZERO32='0x'+'0'.repeat(64),U64=(1n<<64n)-1n;
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function bytes(hex){ensure(typeof hex==='string'&&/^0x(?:[0-9a-f]{2})*$/.test(hex),'CANONICAL_HEX');return Buffer.from(hex.slice(2),'hex');}
export const hex=b=>'0x'+Buffer.from(b).toString('hex');
export function evmAddress(a){ensure(typeof a==='string'&&/^0x[0-9a-fA-F]{40}$/.test(a)&&!/^(?:0x)?0+$/.test(a),'EVM_ADDRESS');return a.toLowerCase();}
export const address32=a=>'0x'+'0'.repeat(24)+evmAddress(a).slice(2);
export function solBytes(a){const p=new PublicKey(a);ensure(p.toBase58()===a,'SOLANA_CANONICAL_ADDRESS');return p.toBuffer();}
export const solHex=a=>hex(solBytes(a));
export function word(n,width=32){const x=atomic(String(n));ensure(x<(1n<<BigInt(width*8)),'INTEGER_WIDTH');return Buffer.from(x.toString(16).padStart(width*2,'0'),'hex');}
export const keccak=b=>hex(keccak_256(b));
export const selector=signature=>keccak(Buffer.from(signature)).slice(2,10);
export const disc=name=>createHash('sha256').update(name).digest().subarray(0,8);
export function burnParameters(request){return {version:1,sourceDomain:6,destinationDomain:5,sender:address32(P.messenger),recipient:solHex(P.solMessenger),destinationCaller:ZERO32,minFinalityThreshold:2000,bodyVersion:1,burnToken:address32(P.usdc),mintRecipient:solHex(request.recipient),amountAtomic:request.amountAtomic,messageSender:address32(request.sourceBinding.fundsAddress),maxFeeAtomic:request.feeCaps.protocolAtomic,hookData:'0x'};}
export function encodeMessage(fields,{nonce=ZERO32,finalityThresholdExecuted=0,feeExecutedAtomic='0',expirationBlock='0'}={}){
 return hex(Buffer.concat([word(fields.version,4),word(fields.sourceDomain,4),word(fields.destinationDomain,4),bytes(nonce),bytes(fields.sender),bytes(fields.recipient),bytes(fields.destinationCaller),word(fields.minFinalityThreshold,4),word(finalityThresholdExecuted,4),word(fields.bodyVersion,4),bytes(fields.burnToken),bytes(fields.mintRecipient),word(fields.amountAtomic),bytes(fields.messageSender),word(fields.maxFeeAtomic),word(feeExecutedAtomic),word(expirationBlock),bytes(fields.hookData)]));
}
export function decodeMessage(input){
 const b=bytes(input);ensure(b.length===376,'CCTP_MESSAGE_LENGTH_OR_UNSUPPORTED_HOOK');
 const number=at=>b.readUInt32BE(at),wide=at=>BigInt(hex(b.subarray(at,at+32))).toString(),h=at=>hex(b.subarray(at,at+32));
 const f={version:number(0),sourceDomain:number(4),destinationDomain:number(8),sender:h(44),recipient:h(76),destinationCaller:h(108),minFinalityThreshold:number(140),bodyVersion:number(148),burnToken:h(152),mintRecipient:h(184),amountAtomic:wide(216),messageSender:h(248),maxFeeAtomic:wide(280),hookData:'0x'};
 for(const at of [216,280,312,344])ensure(BigInt(wide(at))<=U64,'SOLANA_U64_OVERFLOW');
 return {immutable:f,nonce:h(12),finalityThresholdExecuted:number(144),feeExecutedAtomic:wide(312),expirationBlock:wide(344),messageHash:keccak(b),bytes:input};
}
export function verifyMessage(request,input,{sourceMessage=null,attested=false,currentSlot=0}={}){
 const d=decodeMessage(input);ensure(canonicalize(d.immutable)===canonicalize(burnParameters(request)),'CCTP_MESSAGE_BINDING');
 if(sourceMessage){const source=decodeMessage(sourceMessage);ensure(canonicalize(source.immutable)===canonicalize(d.immutable)&&source.nonce===ZERO32&&source.finalityThresholdExecuted===0&&source.feeExecutedAtomic==='0'&&source.expirationBlock==='0','BURN_MESSAGE_CORRELATION');}
 ensure(atomic(d.feeExecutedAtomic)<=atomic(request.feeCaps.protocolAtomic)&&atomic(request.amountAtomic)-atomic(d.feeExecutedAtomic)>=atomic(request.minimumDestinationAtomic),'CCTP_NET_MINIMUM');
 if(attested){ensure(d.nonce!==ZERO32&&d.finalityThresholdExecuted>=2000,'STANDARD_ATTESTED_FINALITY');ensure(d.expirationBlock==='0','UNSUPPORTED_STANDARD_EXPIRATION');}
 else ensure(d.nonce===ZERO32&&d.finalityThresholdExecuted===0&&d.feeExecutedAtomic==='0'&&d.expirationBlock==='0','SOURCE_MESSAGE_MUTABLE_FIELDS');
 return snapshot('CctpMessage',{...d,immutableHash:hash('CctpBurnCommitment',d.immutable)});
}
export function verifyAttestation(message,attestation,{enabledAttesters,signatureThreshold}){
 const a=bytes(attestation);ensure(Number.isSafeInteger(signatureThreshold)&&signatureThreshold>0&&signatureThreshold<=enabledAttesters.length&&a.length===65*signatureThreshold,'ATTESTATION_THRESHOLD_OR_LENGTH');
 const enabled=enabledAttesters.map(evmAddress);ensure(new Set(enabled).size===enabled.length,'DUPLICATE_ENABLED_ATTESTER');
 const digest=bytes(keccak(bytes(message)));let last='0x'+'0'.repeat(40);const signers=[];
 for(let i=0;i<signatureThreshold;i++){
  const part=a.subarray(i*65,i*65+65);ensure(part[64]===27||part[64]===28,'ATTESTATION_RECOVERY_ID');
  const sig=secp256k1.Signature.fromCompact(part.subarray(0,64)).addRecoveryBit(part[64]-27);ensure(!sig.hasHighS(),'ATTESTATION_HIGH_S');
  const pub=sig.recoverPublicKey(digest).toRawBytes(false),signer='0x'+keccak(pub.subarray(1)).slice(-40);
  ensure(signer>last&&enabled.includes(signer),'ATTESTATION_DISABLED_DUPLICATE_OR_UNSORTED');signers.push(signer);last=signer;
 }
 return snapshot('CctpAttestation',{messageHash:keccak(bytes(message)),attestationHash:keccak(a),signers,signatureThreshold});
}
export function approveCalldata(amount){return '0x'+selector('approve(address,uint256)')+address32(P.messenger).slice(2)+word(amount).toString('hex');}
export function burnCalldata(request){const f=burnParameters(request);return '0x'+selector('depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)')+Buffer.concat([word(f.amountAtomic),word(5),bytes(f.mintRecipient),bytes(f.burnToken),bytes(f.destinationCaller),word(f.maxFeeAtomic),word(2000)]).toString('hex');}
export function verifySourceCall(request,tx,kind){
 ensure(Object.keys(tx).sort().join(',')==='chainId,data,from,to,value','UNSIGNED_CALL_SCHEMA');
 ensure(tx.chainId===84532&&tx.from===evmAddress(request.sourceBinding.fundsAddress)&&tx.value==='0x0','SOURCE_TRANSACTION_AUTHORITY');
 ensure(tx.to===evmAddress(kind==='APPROVAL'?P.usdc:P.messenger)&&tx.data===(kind==='APPROVAL'?approveCalldata(request.amountAtomic):burnCalldata(request)),'SOURCE_TRANSACTION_BINDING');
 return tx;
}
export function unsignedSourceCalls(request){
 ensure(atomic(request.amountAtomic)<=U64,'SOLANA_U64_OVERFLOW');
 const call=(to,data)=>({chainId:84532,from:evmAddress(request.sourceBinding.fundsAddress),to:evmAddress(to),value:'0x0',data});
 return {approval:verifySourceCall(request,call(P.usdc,approveCalldata(request.amountAtomic)),'APPROVAL'),burn:verifySourceCall(request,call(P.messenger,burnCalldata(request)),'BURN')};
}
export function pda(program,...seeds){return PublicKey.findProgramAddressSync(seeds.map(x=>typeof x==='string'?Buffer.from(x):x),new PublicKey(program))[0].toBase58();}
export const TOKEN_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA_PROGRAM='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const ata=(owner,mint=P.mint)=>pda(ATA_PROGRAM,solBytes(owner),solBytes(TOKEN_PROGRAM),solBytes(mint));
export function cctpAccounts(nonce=ZERO32){
 return {messageTransmitter:pda(P.solTransmitter,'message_transmitter'),authority:pda(P.solTransmitter,'message_transmitter_authority',solBytes(P.solMessenger)),
 usedNonce:pda(P.solTransmitter,'used_nonce',bytes(nonce)),transmitterEvent:pda(P.solTransmitter,'__event_authority'),
 tokenMessenger:pda(P.solMessenger,'token_messenger'),remoteMessenger:pda(P.solMessenger,'remote_token_messenger','6'),
 tokenMinter:pda(P.solMessenger,'token_minter'),localToken:pda(P.solMessenger,'local_token',solBytes(P.mint)),
 tokenPair:pda(P.solMessenger,'token_pair','6',bytes(address32(P.usdc))),custody:pda(P.solMessenger,'custody',solBytes(P.mint)),messengerEvent:pda(P.solMessenger,'__event_authority')};
}
