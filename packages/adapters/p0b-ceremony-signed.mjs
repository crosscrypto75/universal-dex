// Verification of externally produced public wire only. No signing API or key input.
import {Transaction} from '@solana/web3.js';
import {secp256k1} from '@noble/curves/secp256k1';
import {ensure,hash} from '../core/canonical.mjs';
import {rlp} from './cctp-source-transaction.mjs';
import {bytes,hex,sha,keccak,evmAddress} from './cctp-codec.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function encode58(b){let n=BigInt(hex(b)),out='';while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}for(const v of b){if(v!==0)break;out='1'+out;}return out;}
export function decodeRlp(input){
 const b=Buffer.from(input);ensure(b.length>0&&b.length<=4096,'SIGNED_RLP_SIZE');let at=0;
 function take(n){ensure(Number.isSafeInteger(n)&&n>=0&&at+n<=b.length,'SIGNED_RLP_TRUNCATED');const x=b.subarray(at,at+n);at+=n;return x;}
 function length(n){const x=take(n);ensure(n>0&&n<=4&&x[0]!==0,'SIGNED_RLP_LENGTH');return Number(BigInt(hex(x)));}
 function read(){
  const prefix=take(1)[0];if(prefix<128)return Buffer.from([prefix]);
  const list=prefix>=192,short=prefix<(list?248:184),n=short?prefix-(list?192:128):length(prefix-(list?247:183));ensure(short||n>=56,'SIGNED_RLP_CANONICAL');
  if(!list){const x=take(n);ensure(!(n===1&&x[0]<128),'SIGNED_RLP_CANONICAL');return x;}
  const end=at+n;ensure(end<=b.length,'SIGNED_RLP_LIST');const out=[];while(at<end)out.push(read());ensure(at===end,'SIGNED_RLP_LIST');return out;
 }
 const out=read();ensure(at===b.length&&rlp(out).equals(b),'SIGNED_RLP_TRAILING_OR_CANONICAL');return out;
}
export function verifyExternalSignedWire(prepared,material,wire){
 ensure(typeof wire==='string','SIGNED_WIRE_TYPE');
 let transactionRef,digest;
 if(prepared.networkRef==='solana:devnet'){
  const b=Buffer.from(wire,'base64');ensure(b.toString('base64')===wire&&b.length<=1232,'SIGNED_SOLANA_ENCODING');
  const tx=Transaction.from(b),candidate=material.candidate;
  ensure(sha(tx.serializeMessage())===candidate.messageSha256&&tx.signatures.length===1&&tx.signatures[0].publicKey.toBase58()===prepared.actor&&tx.signatures.every(x=>x.signature)&&tx.verifySignatures(),'SIGNED_SOLANA_EXACT_MESSAGE_OR_SIGNATURE');
  transactionRef=encode58(tx.signatures[0].signature);digest=sha(b);
 }else{
  const b=bytes(wire);ensure(b[0]===2,'SIGNED_EVM_TYPE');const x=decodeRlp(b.subarray(1));
  ensure(Array.isArray(x)&&x.length===12&&x.slice(0,8).every(Buffer.isBuffer)&&Array.isArray(x[8])&&x[8].length===0&&x.slice(9).every(Buffer.isBuffer),'SIGNED_EVM_SCHEMA');
  for(const i of [0,1,2,3,4,6,9,10,11])ensure(x[i].length<=32&&(x[i].length===0||x[i][0]!==0),'SIGNED_EVM_INTEGER');
  ensure(x[5].length===20,'SIGNED_EVM_TARGET');
  const unsigned=Buffer.concat([Buffer.from([2]),rlp(x.slice(0,9))]);ensure(hex(unsigned)===material.candidate.signingPreimage,'SIGNED_EVM_EXACT_ENVELOPE');
  const parity=x[9].length?Number(BigInt(hex(x[9]))):0;ensure(parity===0||parity===1,'SIGNED_EVM_PARITY');
  const padded=v=>{ensure(v.length>0&&v.length<=32,'SIGNED_EVM_SIGNATURE_VALUE');return Buffer.concat([Buffer.alloc(32-v.length),v]);};
  const signature=secp256k1.Signature.fromCompact(Buffer.concat([padded(x[10]),padded(x[11])])).addRecoveryBit(parity);ensure(!signature.hasHighS(),'SIGNED_EVM_HIGH_S');
  const pub=signature.recoverPublicKey(bytes(keccak(unsigned))).toRawBytes(false);ensure(evmAddress('0x'+keccak(pub.subarray(1)).slice(-40))===prepared.actor,'SIGNED_EVM_WRONG_ACTOR');
  transactionRef=keccak(b);digest=sha(b);
 }
 return {transactionRef,signedWireHash:hash('CeremonySignedWire',{networkRef:prepared.networkRef,sha256:digest})};
}
