// EIP-1559 signing preimages only. No signature fields or broadcaster.
import {ensure,atomic,snapshot,hash,canonicalize} from '../core/canonical.mjs';
import {decode,s,hashRef} from '../core/schema.mjs';
import {bytes,hex,keccak,verifySourceCall,word,evmAddress} from './cctp-codec.mjs';
const bytesFor=n=>{const x=atomic(String(n));if(!x)return Buffer.alloc(0);const h=x.toString(16);return Buffer.from(h.padStart(Math.ceil(h.length/2)*2,'0'),'hex');};
export function rlp(input){
 if(Array.isArray(input)){const b=Buffer.concat(input.map(rlp));return Buffer.concat([lengthPrefix(b.length,0xc0),b]);}
 const b=Buffer.from(input);if(b.length===1&&b[0]<0x80)return b;return Buffer.concat([lengthPrefix(b.length,0x80),b]);
}
function lengthPrefix(length,offset){if(length<56)return Buffer.from([offset+length]);const b=bytesFor(length);return Buffer.concat([Buffer.from([offset+55+b.length]),b]);}
const schema={schemaVersion:s.literal(1),scope:s.literal('UNSIGNED_TESTNET_ONLY'),kind:s.enum(['APPROVAL','BURN']),requestHash:hashRef,chainId:s.literal(84532),from:s.string,to:s.string,value:s.literal('0'),data:s.string,nonce:s.atomic,gasLimit:s.positive,maxFeePerGas:s.positive,maxPriorityFeePerGas:s.atomic,maximumL1FeeAtomic:s.atomic,observedL1FeeAtomic:s.atomic,feeBudgetAtomic:s.atomic};
export function prepareSourceTransaction(request,input){
 const x=decode(schema,input);
 ensure(canonicalize(x.requestHash)===canonicalize(hash('CrossChainRequest',request)),'SOURCE_REQUEST_HASH');
 verifySourceCall(request,{chainId:x.chainId,from:x.from,to:x.to,value:'0x0',data:x.data},x.kind);
 ensure(atomic(x.nonce)<1n<<64n&&atomic(x.gasLimit)<=3000000n&&atomic(x.maxPriorityFeePerGas)<=atomic(x.maxFeePerGas),'SOURCE_NONCE_OR_GAS');
 ensure(atomic(x.observedL1FeeAtomic)<=atomic(x.maximumL1FeeAtomic)&&atomic(x.gasLimit)*atomic(x.maxFeePerGas)+atomic(x.maximumL1FeeAtomic)<=atomic(x.feeBudgetAtomic)&&atomic(x.feeBudgetAtomic)<=atomic(request.feeCaps.sourceNativeAtomic),'SOURCE_TOTAL_FEE_CAP');
 const encoded=Buffer.concat([Buffer.from([2]),rlp([bytesFor(84532),bytesFor(x.nonce),bytesFor(x.maxPriorityFeePerGas),bytesFor(x.maxFeePerGas),bytesFor(x.gasLimit),bytes(x.to),Buffer.alloc(0),bytes(x.data),[]])]);
 return snapshot('CctpUnsignedEvmTransaction',{...x,signingPreimage:hex(encoded),signingDigest:keccak(encoded),transactionHash:null,canSign:false,canSend:false,
 limitations:['Base L1 data fee has no transaction-native absolute cap; recheck the accepted bound immediately before signing.','The EVM envelope has nonce protection but no intrinsic execution deadline.','Separate approval and burn budgets must sum within the accepted source native cap.']});
}
export function verifySourceTransaction(request,candidate){
 const input={};for(const key of Object.keys(schema))input[key]=candidate[key];
 ensure(canonicalize(candidate)===canonicalize(prepareSourceTransaction(request,input)),'SOURCE_ENVELOPE_MUTATION');return candidate;
}
