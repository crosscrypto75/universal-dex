import {ensure,atomic,snapshot} from '../core/canonical.mjs';
import {CCTP_CANDIDATE as P} from './cctp-readonly.mjs';
import {readOnlyRpc} from './cctp-observation.mjs';
import {selector,word,bytes,sha} from './cctp-codec.mjs';
// Public OP-stack predeploys documented by Base, not provider-supplied spend targets.
export const GAS_ORACLE='0x420000000000000000000000000000000000000f',L1_BLOCK='0x4200000000000000000000000000000000000015';
export async function observeBaseFeeBounds({transactionBytes,rpc=readOnlyRpc()}){
 ensure(Number.isSafeInteger(transactionBytes)&&transactionBytes>0&&transactionBytes<=4096,'FEE_TRANSACTION_SIZE');
 const block=await rpc.read(P.baseRpc,'eth_getBlockByNumber',['latest',false]);
 const call=async(to,method,args=[])=>{const x=await rpc.read(P.baseRpc,'eth_call',[{to,data:'0x'+selector(method)+Buffer.concat(args).toString('hex')},block.number]);ensure(bytes(x).length===32,'FEE_ORACLE_WORD');return BigInt(x).toString();};
 const l1UpperBoundAtomic=await call(GAS_ORACLE,'getL1FeeUpperBound(uint256)',[word(transactionBytes)]);
 const scalar=await call(L1_BLOCK,'operatorFeeScalar()'),constant=await call(L1_BLOCK,'operatorFeeConstant()');
 ensure(scalar==='0'&&constant==='0','UNSUPPORTED_BASE_OPERATOR_FEE');
 return snapshot('BaseFeeObservation',{schemaVersion:1,scope:'READ_ONLY_TESTNET',observedAt:new Date().toISOString(),block:block.number,blockHash:block.hash,baseFeePerGas:BigInt(block.baseFeePerGas).toString(),l1UpperBoundAtomic,operatorFeeScalar:scalar,operatorFeeConstant:constant,transactionBytes,
 limitations:['The L1 bound is observed at this block, not transaction-native enforcement at future inclusion.','Only Base configurations with zero operator fees are supported by this preparation boundary.']});
}
export async function observeSolanaCost({messageBase64,createAta=false,recipientExists=false,rpc=readOnlyRpc()}){
 const fee=await rpc.read(P.solRpc,'getFeeForMessage',[messageBase64,{commitment:'finalized'}]);ensure(Number.isSafeInteger(fee.value)&&fee.value>=0,'SOLANA_MESSAGE_FEE_UNKNOWN');
 const usedNonceRent=await rpc.read(P.solRpc,'getMinimumBalanceForRentExemption',[9,{commitment:'finalized'}]);
 const ataRent=createAta&&!recipientExists?await rpc.read(P.solRpc,'getMinimumBalanceForRentExemption',[165,{commitment:'finalized'}]):0;
 ensure(Number.isSafeInteger(usedNonceRent)&&Number.isSafeInteger(ataRent),'SOLANA_RENT_UNKNOWN');
 const total=BigInt(fee.value)+BigInt(usedNonceRent)+BigInt(ataRent)+(createAta&&!recipientExists?5000n:0n);
 return snapshot('SolanaCostObservation',{schemaVersion:1,scope:'READ_ONLY_TESTNET',observedAt:new Date().toISOString(),slot:fee.context.slot,networkFeeAtomic:String(fee.value),usedNonceRentAtomic:String(usedNonceRent),ataRentAtomic:String(ataRent),ataNetworkFeeAtomic:createAta&&!recipientExists?'5000':'0',totalAtomic:String(total),
 limitation:'ATA fee assumes one signature and no priority fee; both actual messages must be freshly quoted before any live authorization.'});
}
