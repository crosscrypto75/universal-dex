// Deployment metadata only. Nothing returned here enables a route or signs a payload.
import {createHash} from 'node:crypto';
export const CCTP_CANDIDATE=Object.freeze({
 baseRpc:'https://sepolia.base.org',chainId:'0x14a34',sourceDomain:6,
 usdc:'0x036CbD53842c5426634e7929541eC2318f3dCF7e',
 messenger:'0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
 transmitter:'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
 solRpc:'https://api.devnet.solana.com',genesis:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',destinationDomain:5,
 mint:'4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
 solTransmitter:'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
 solMessenger:'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe'
});
const need=(ok,code)=>{if(!ok)throw Error(code);},sha=b=>createHash('sha256').update(b).digest('hex');
export async function readCctpCandidate({fetchImpl=globalThis.fetch}={}){
 let id=0;const observations=[];
 async function read(endpoint,method,params=[]){
  const requestId=++id;const at=new Date().toISOString();
  let response,body;try{response=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(15000)});need(response.ok,'READ_ONLY_HTTP_FAILURE');body=await response.json();}catch{throw Error('READ_ONLY_TRANSPORT_FAILURE');}
  need(body&&body.jsonrpc==='2.0'&&body.id===requestId&&!body.error&&Object.hasOwn(body,'result'),'READ_ONLY_RPC_FAILURE');
  observations.push({method,at,responseSha256:sha(JSON.stringify(body.result))});return body.result;
 }
 const p=CCTP_CANDIDATE;
 const [chainId,genesis]=await Promise.all([read(p.baseRpc,'eth_chainId'),read(p.solRpc,'getGenesisHash')]);
 need(chainId===p.chainId&&genesis===p.genesis,'CANDIDATE_NETWORK_MISMATCH');
 const [block,accounts]=await Promise.all([
  read(p.baseRpc,'eth_getBlockByNumber',['finalized',false]),
  read(p.solRpc,'getMultipleAccounts',[[p.mint,p.solTransmitter,p.solMessenger],{commitment:'finalized',encoding:'base64'}])
 ]);
 need(block&&/^0x[0-9a-f]+$/.test(block.number)&&/^0x[0-9a-f]{64}$/.test(block.hash),'FINALIZED_BLOCK_INVALID');
 need(Number.isSafeInteger(accounts?.context?.slot)&&accounts.context.slot>0&&Array.isArray(accounts.value)&&accounts.value.length===3,'FINALIZED_ACCOUNTS_INVALID');
 const codes=await Promise.all([p.usdc,p.messenger,p.transmitter].map(address=>read(p.baseRpc,'eth_getCode',[address,block.number])));
 const baseCode=codes.map((hex,i)=>{need(typeof hex==='string'&&/^0x(?:[0-9a-fA-F]{2})+$/.test(hex)&&hex.length<=1_000_002,'CANDIDATE_CODE_NOT_OBSERVED');const bytes=Buffer.from(hex.slice(2),'hex');return {address:[p.usdc,p.messenger,p.transmitter][i],bytes:bytes.length,proxyCodeSha256:sha(bytes),implementationIdentity:'UNPROVEN'};});
 function data(account){need(account&&Array.isArray(account.data)&&account.data[1]==='base64'&&typeof account.data[0]==='string','ACCOUNT_NOT_OBSERVED');const b=Buffer.from(account.data[0],'base64');need(b.toString('base64')===account.data[0],'ACCOUNT_ENCODING_INVALID');return b;}
 const mintAccount=accounts.value[0],mint=data(mintAccount);need(mintAccount.owner==='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'&&!mintAccount.executable&&mint.length===82&&mint[44]===6&&mint[45]===1,'CANDIDATE_MINT_MISMATCH');
 const programs=accounts.value.slice(1).map((a,i)=>{const b=data(a);need(a.owner==='BPFLoaderUpgradeab1e11111111111111111111111'&&a.executable===true&&b.length===36&&b.readUInt32LE(0)===2,'CANDIDATE_PROGRAM_MISMATCH');return {address:[p.solTransmitter,p.solMessenger][i],pointerAccountSha256:sha(b),elfIdentity:'UNPROVEN'};});
 return Object.freeze({schemaVersion:1,status:'READ_ONLY_DEPLOYMENT_METADATA',executionCapability:'UNPROVEN',liveEligible:false,signingEnabled:false,sendingEnabled:false,observedAt:new Date().toISOString(),source:{chainId,finalizedBlock:block.number,blockHash:block.hash,code:baseCode},destination:{genesis,finalizedSlot:accounts.context.slot,mint:p.mint,mintDecimals:6,mintDataSha256:sha(mint),programs},observations,limitations:['Proxy code and program pointers do not prove implementation identities.','No pause/attester/token-pair/account compatibility or source/destination execution proof.','No provider or representation approval; no transaction construction or effect port.']});
}
