// All network methods in this collector are public reads or unsigned simulation.
import {PublicKey} from '@solana/web3.js';
import {ensure,snapshot,sameHash,hash} from '../core/canonical.mjs';
import {CCTP_CANDIDATE as P} from './cctp-readonly.mjs';
import {observeConfiguration,readOnlyRpc,compareImplementationPins,decodeTokenAccount} from './cctp-observation.mjs';
import {selector,word,address32,bytes,hex,sha,TOKEN_PROGRAM} from './cctp-codec.mjs';
const IMPL='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',ADMIN='0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103',LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
export function acceptedDeploymentHash(accepted){const{contentHash,...body}=accepted.usdc??{};ensure(sameHash(contentHash,hash('CeremonyUsdcDeployment',body)),'CEREMONY_USDC_PIN_REQUIRED');return hash('CeremonyAcceptedDeployments',{cctp:compareImplementationPins(accepted.identities,accepted.identities),usdc:contentHash});}
export async function readFreshIdentityPins(rpc,accepted){
 const {identities,presence,usdc}=accepted;acceptedDeploymentHash(accepted);const block=await rpc.read(P.baseRpc,'eth_getBlockByNumber',['finalized',false]);
 for(const tag of [block.number,'latest']){
 for(const pin of presence.source.code){const b=bytes(await rpc.read(P.baseRpc,'eth_getCode',[pin.address,tag]));ensure(b.length===pin.bytes&&sha(b)===pin.proxyCodeSha256,'CCTP_DEPLOYMENT_CHANGED');}
 for(const pin of identities.source.contracts.filter(p=>p.kind!=='USDC')){
  for(const[slot,expected]of [[IMPL,pin.erc1967Implementation],[ADMIN,pin.erc1967Admin]])ensure((await rpc.read(P.baseRpc,'eth_getStorageAt',[pin.address,slot,tag])).toLowerCase()===address32(expected),'CCTP_DEPLOYMENT_CHANGED');
  const b=bytes(await rpc.read(P.baseRpc,'eth_getCode',[pin.erc1967Implementation,tag]));ensure(b.length===pin.implementationCode.bytes&&sha(b)===pin.implementationCode.sha256,'CCTP_DEPLOYMENT_CHANGED');
 }
 ensure(usdc.token===P.usdc.toLowerCase()&&usdc.chainId===P.chainId,'CEREMONY_USDC_PIN_CHAIN');
 for(const[slot,expected]of [[usdc.implementationSlot,usdc.implementation],[usdc.adminSlot,usdc.admin]])ensure((await rpc.read(P.baseRpc,'eth_getStorageAt',[P.usdc,slot,tag])).toLowerCase()===address32(expected),'CCTP_DEPLOYMENT_CHANGED');
 ensure(sha(bytes(await rpc.read(P.baseRpc,'eth_getCode',[usdc.implementation,tag])))===usdc.implementationCodeSha256,'CCTP_DEPLOYMENT_CHANGED');
 }
 const pins=identities.destination.programs,result=await rpc.read(P.solRpc,'getMultipleAccounts',[pins.flatMap(p=>[p.program,p.programData]),{commitment:'finalized',encoding:'base64'}]);
 ensure(result.value?.length===4&&Number.isSafeInteger(result.context.slot),'IDENTITY_RPC_CONTEXT');
 pins.forEach((p,i)=>{
  const a=result.value[i*2],d=result.value[i*2+1];ensure(a?.owner===LOADER&&a.executable===true&&d?.owner===LOADER&&d.executable===false&&a.data?.[1]==='base64'&&d.data?.[1]==='base64','CCTP_DEPLOYMENT_CHANGED');
  const b=Buffer.from(a.data[0],'base64'),data=Buffer.from(d.data[0],'base64');ensure(b.length===36&&b.readUInt32LE(0)===2&&new PublicKey(b.subarray(4)).toBase58()===p.programData&&sha(data)===p.programDataAccountSha256,'CCTP_DEPLOYMENT_CHANGED');
 });
 return snapshot('CeremonyFreshDeployment',{schemaVersion:1,scope:'READ_ONLY_TESTNET',observedAt:new Date().toISOString(),identityHash:acceptedDeploymentHash(accepted),baseFinalizedBlock:block.number,baseBlockHash:block.hash,solanaSlot:result.context.slot,noSigning:true,noSending:true});
}
export async function collectCeremonyFacts(selection,accepted,{rpc=readOnlyRpc(),clock=()=>new Date().toISOString()}={}){
 const startedAt=clock();ensure(await rpc.read(P.baseRpc,'eth_chainId')===P.chainId&&await rpc.read(P.solRpc,'getGenesisHash')===P.genesis,'CEREMONY_NETWORK_CHANGED');
 const identity=await readFreshIdentityPins(rpc,accepted),configuration=await observeConfiguration({rpc,destinationOwner:selection.destinationOwner});
 ensure(sameHash(configuration.configurationHash,accepted.configuration.configurationHash),'CCTP_DEPLOYMENT_CHANGED');
 const src=configuration.configuration.source;
 // Check latest source configuration as well as accepted finalized observations.
 const checks=[[P.transmitter,'localDomain()','domain'],[P.transmitter,'version()','messageVersion'],[P.transmitter,'paused()','transmitterPaused'],[P.messenger,'messageBodyVersion()','bodyVersion'],[P.usdc,'decimals()','usdcDecimals'],[P.usdc,'paused()','usdcPaused'],[src.messengerMinter,'paused()','minterPaused'],[src.messengerMinter,'burnLimitsPerMessage(address)','burnLimit',[bytes(address32(P.usdc))]]];
 await Promise.all(checks.map(async([to,signature,key,args=[]])=>{const value=await rpc.read(P.baseRpc,'eth_call',[{to,data:'0x'+selector(signature)+Buffer.concat(args).toString('hex')},'latest']);ensure(bytes(value).length===32&&BigInt(value).toString()===src[key],'CCTP_DEPLOYMENT_CHANGED');}));
 for(const[to,signature,expected,args=[]]of [[P.messenger,'localMessageTransmitter()',address32(src.messengerTransmitter)],[P.messenger,'localMinter()',address32(src.messengerMinter)],[P.messenger,'remoteTokenMessengers(uint32)',src.remoteMessenger,[word(5)]]])ensure(await rpc.read(P.baseRpc,'eth_call',[{to,data:'0x'+selector(signature)+Buffer.concat(args).toString('hex')},'latest'])===expected,'CCTP_DEPLOYMENT_CHANGED');
 ensure(sha(bytes(await rpc.read(P.baseRpc,'eth_getCode',[src.messengerMinter,'latest'])))===src.messengerMinterCodeSha256,'CCTP_DEPLOYMENT_CHANGED');

 const finalized=await rpc.read(P.baseRpc,'eth_getBlockByNumber',['finalized',false]),latest=await rpc.read(P.baseRpc,'eth_getBlockByNumber',['latest',false]);
 const call=async(method,args,tag)=>{const x=await rpc.read(P.baseRpc,'eth_call',[{to:P.usdc,data:'0x'+selector(method)+Buffer.concat(args).toString('hex')},tag]);ensure(bytes(x).length===32,'CEREMONY_USDC_WORD');return BigInt(x).toString();};
 const owner=bytes(address32(selection.sourceAddress)),spender=bytes(address32(P.messenger));
 const base={chainId:P.chainId,finalizedBlock:finalized.number,finalizedHash:finalized.hash,latestBlock:latest.number,latestHash:latest.hash,baseFeePerGas:BigInt(latest.baseFeePerGas).toString(),
  usdcBalance:await call('balanceOf(address)',[owner],'latest'),finalizedUsdcBalance:await call('balanceOf(address)',[owner],finalized.number),
  allowance:await call('allowance(address,address)',[owner,spender],'latest'),finalizedAllowance:await call('allowance(address,address)',[owner,spender],finalized.number),
  noncePending:BigInt(await rpc.read(P.baseRpc,'eth_getTransactionCount',[selection.sourceAddress,'pending'])).toString(),nonceLatest:BigInt(await rpc.read(P.baseRpc,'eth_getTransactionCount',[selection.sourceAddress,'latest'])).toString(),
  nativeBalance:BigInt(await rpc.read(P.baseRpc,'eth_getBalance',[selection.sourceAddress,'pending'])).toString(),priorityFeeSuggestion:BigInt(await rpc.read(P.baseRpc,'eth_maxPriorityFeePerGas')).toString(),walletCode:await rpc.read(P.baseRpc,'eth_getCode',[selection.sourceAddress,'latest'])};
 const native=await rpc.read(P.solRpc,'getAccountInfo',[selection.destinationFeePayer,{commitment:'finalized',encoding:'base64'}]);ensure(native.value?.owner==='11111111111111111111111111111111'&&native.value.executable===false&&Number.isSafeInteger(native.value.lamports),'CEREMONY_RELAY_PAYER');
 const mint=await rpc.read(P.solRpc,'getAccountInfo',[P.mint,{commitment:'finalized',encoding:'base64'}]),b=Buffer.from(mint.value?.data?.[0]??'','base64');ensure(mint.value?.owner===TOKEN_PROGRAM&&!mint.value.executable&&mint.value.data[1]==='base64'&&b.length===82&&b[44]===6&&b[45]===1,'CEREMONY_USDC_MINT');
 const solana={genesis:P.genesis,slot:Math.max(native.context.slot,mint.context.slot),nativeBalance:String(native.value.lamports),ata:configuration.configuration.destination.recipientAccount,
  ataRentAtomic:String(await rpc.read(P.solRpc,'getMinimumBalanceForRentExemption',[165,{commitment:'finalized'}])),nonceRentAtomic:String(await rpc.read(P.solRpc,'getMinimumBalanceForRentExemption',[9,{commitment:'finalized'}])),
  blockhash:await rpc.read(P.solRpc,'getLatestBlockhash',[{commitment:'finalized'}]),blockHeight:await rpc.read(P.solRpc,'getBlockHeight',[{commitment:'finalized'}]),
  mintIdentity:{address:P.mint,owner:mint.value.owner,decimals:b[44],initialized:true,mintAuthorityOption:b.readUInt32LE(0),mintAuthority:new PublicKey(b.subarray(4,36)).toBase58(),freezeAuthorityOption:b.readUInt32LE(46),freezeAuthority:new PublicKey(b.subarray(50,82)).toBase58()}};
 return snapshot('CeremonyJitFacts',{schemaVersion:1,scope:'READ_ONLY_TESTNET_JIT',startedAt,observedAt:clock(),identity,configuration,base,solana,observations:rpc.observations,noSigning:true,noSending:true});
}
