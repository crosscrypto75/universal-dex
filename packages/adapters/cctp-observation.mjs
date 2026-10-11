import {PublicKey} from '@solana/web3.js';
import {ensure,hash,snapshot,canonicalize,sameHash} from '../core/canonical.mjs';
import {CCTP_CANDIDATE as P,readCctpCandidate} from './cctp-readonly.mjs';
import {bytes,hex,sha,keccak,selector,word,address32,solBytes,cctpAccounts,disc,ata,TOKEN_PROGRAM} from './cctp-codec.mjs';
const READS=new Set(['eth_chainId','eth_maxPriorityFeePerGas','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call','eth_estimateGas','eth_getBalance','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getLogs','getGenesisHash','getBlockHeight','getMultipleAccounts','getAccountInfo','getLatestBlockhash','getMinimumBalanceForRentExemption','getFeeForMessage','simulateTransaction','getTransaction','getSignatureStatuses','getSignaturesForAddress']);
export function readOnlyRpc({fetchImpl=globalThis.fetch}={}){
 let id=0;const observations=[];
 return {observations,async read(endpoint,method,params=[]){
  ensure([P.baseRpc,P.solRpc].includes(endpoint)&&READS.has(method),'READ_ONLY_RPC_METHOD_OR_ENDPOINT');
  const rpcId=++id;let response;
  try{const r=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:rpcId,method,params}),signal:AbortSignal.timeout(20000)});ensure(r.ok,'PUBLIC_RPC_HTTP_'+r.status);response=await r.json();}catch(e){throw Error(e.message.startsWith('PUBLIC_RPC_HTTP_')?e.message:'PUBLIC_RPC_TRANSPORT');}
  ensure(response.jsonrpc==='2.0'&&response.id===rpcId&&!response.error&&Object.hasOwn(response,'result'),'PUBLIC_RPC_RESULT');
  observations.push({endpoint,method,responseSha256:sha(JSON.stringify(response.result))});return response.result;
 }};
}
const implementationSlot='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const adminSlot='0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
function wordAddress(x){ensure(/^0x0{24}[0-9a-f]{40}$/.test(x)&&x!=='0x'+'0'.repeat(64),'PROXY_ADDRESS_WORD');return '0x'+x.slice(-40);}
export function accountBytes(account,owner){ensure(account&&!account.executable&&account.owner===owner&&account.data?.[1]==='base64','CONFIG_ACCOUNT_OWNER');const b=Buffer.from(account.data[0],'base64');ensure(b.toString('base64')===account.data[0],'CONFIG_ACCOUNT_ENCODING');return b;}
// Borsh layouts pinned to official Circle IDLs. Unknown/trailing layout changes fail closed.
const layouts={
 MessageTransmitter:[['owner','pk'],['pending_owner','pk'],['attester_manager','pk'],['pauser','pk'],['paused','bool'],['local_domain','u32'],['version','u32'],['signature_threshold','u32'],['enabled_attesters','vecpk'],['max_message_body_size','u64']],
 TokenMessenger:[['denylister','pk'],['owner','pk'],['pending_owner','pk'],['message_body_version','u32'],['authority_bump','u8'],['fee_recipient','pk'],['min_fee_controller','pk'],['min_fee','u32']],
 RemoteTokenMessenger:[['domain','u32'],['token_messenger','pk']],
 TokenMinter:[['token_controller','pk'],['pauser','pk'],['paused','bool'],['bump','u8']],
 LocalToken:[['custody','pk'],['mint','pk'],['burn_limit_per_message','u64'],['messages_sent','u64'],['messages_received','u64'],['amount_sent','u128'],['amount_received','u128'],['bump','u8'],['custody_bump','u8']],
 TokenPair:[['remote_domain','u32'],['remote_token','pk'],['local_token','pk'],['bump','u8']],
 UsedNonce:[['is_used','bool']]
};
export function decodeCctpAccount(name,b){
 ensure(layouts[name]&&b.subarray(0,8).equals(disc('account:'+name)),'CCTP_ACCOUNT_DISCRIMINATOR');
 let at=8;const out={};
 function take(n){ensure(at+n<=b.length,'CCTP_ACCOUNT_TRUNCATED');const x=b.subarray(at,at+n);at+=n;return x;}
 for(const [key,type]of layouts[name]){
  if(type==='pk')out[key]=new PublicKey(take(32)).toBase58();
  else if(type==='bool'){const x=take(1)[0];ensure(x===0||x===1,'BORSH_BOOL');out[key]=x===1;}
  else if(type==='u8')out[key]=take(1)[0];
  else if(type==='u32')out[key]=take(4).readUInt32LE();
  else if(type==='u64')out[key]=take(8).readBigUInt64LE().toString();
  else if(type==='u128'){const x=take(16);out[key]=(x.readBigUInt64LE()+(x.readBigUInt64LE(8)<<64n)).toString();}
  else {const n=take(4).readUInt32LE();ensure(n>0&&n<=32,'ATTESTER_VECTOR');out[key]=Array.from({length:n},()=>new PublicKey(take(32)).toBase58());}
 }
 ensure(b.subarray(at).every(x=>x===0),'CCTP_ACCOUNT_LAYOUT_CHANGED');return out;
}
export function decodeTokenAccount(a,{mint,owner}={}){
 const b=accountBytes(a,TOKEN_PROGRAM);ensure(b.length===165&&b[108]===1,'TOKEN_ACCOUNT_LAYOUT_OR_FROZEN');
 const result={mint:new PublicKey(b.subarray(0,32)).toBase58(),owner:new PublicKey(b.subarray(32,64)).toBase58(),amountAtomic:b.readBigUInt64LE(64).toString(),delegateOption:b.readUInt32LE(72),closeAuthorityOption:b.readUInt32LE(129)};
 ensure((!mint||result.mint===mint)&&(!owner||result.owner===owner)&&result.delegateOption===0&&result.closeAuthorityOption===0,'RECIPIENT_TOKEN_ACCOUNT_BINDING');
 return result;
}
export function compareImplementationPins(current,previous){
 const source=r=>r.source.contracts.filter(c=>c.kind!=='USDC').map(c=>({kind:c.kind,address:c.address,implementation:c.erc1967Implementation,admin:c.erc1967Admin,code:c.implementationCode}));
 const dest=r=>r.destination.programs.map(p=>({program:p.program,programData:p.programData,deploymentSlot:p.deploymentSlot,upgradeAuthority:p.upgradeAuthority,elfSha256:p.elfSha256,allocatedPayloadSha256:p.allocatedPayloadSha256}));
 ensure(canonicalize(source(current))===canonicalize(source(previous))&&canonicalize(dest(current))===canonicalize(dest(previous)),'CCTP_DEPLOYMENT_CHANGED');
 return hash('CctpImplementationIdentity',{source:source(current),destination:dest(current)});
}
export function cctpConfigurationHash(configuration){
 const {source,destination:d}=configuration,mt=d.config.MessageTransmitter.fields,tm=d.config.TokenMessenger.fields,rm=d.config.RemoteTokenMessenger.fields,lt=d.config.LocalToken.fields,tp=d.config.TokenPair.fields;
 const encoded=mt.enabled_attesters.map(pk=>{const b=solBytes(pk);ensure(b.subarray(0,12).every(x=>x===0),'SOLANA_ATTESTER_ENCODING');return '0x'+b.subarray(12).toString('hex');});
 ensure(canonicalize(encoded)===canonicalize(d.enabledAttesters)&&new Set(encoded).size===encoded.length&&d.signatureThreshold===mt.signature_threshold&&d.feeRecipient===ata(tm.fee_recipient),'CONFIGURATION_REDUNDANT_FIELD_BINDING');
 const stable={source,destination:{genesis:d.genesis,accounts:d.accounts,transmitter:mt,messenger:tm,remoteMessenger:rm,minter:d.config.TokenMinter.fields,localToken:{mint:lt.mint,custody:lt.custody,burnLimit:lt.burn_limit_per_message},tokenPair:tp,feeRecipient:d.feeRecipient,enabledAttesters:d.enabledAttesters}};
 return hash('CctpConfiguration',stable);
}
export function verifyCctpConfigurationObservation(observation){
 const {contentHash,...body}=observation;
 ensure(observation.schemaVersion===1&&observation.scope==='READ_ONLY_TESTNET'&&observation.noSigning===true&&observation.noSending===true&&sameHash(contentHash,hash('CctpConfigurationObservation',body)),'CONFIGURATION_OBSERVATION_HASH');
 ensure(sameHash(observation.configurationHash,cctpConfigurationHash(observation.configuration)),'CONFIGURATION_CONTENT_BINDING');
 return observation;
}
export async function observeConfiguration({rpc=readOnlyRpc(),destinationOwner=null}={}){
 const read=rpc.read;
 ensure(await read(P.baseRpc,'eth_chainId')===P.chainId&&await read(P.solRpc,'getGenesisHash')===P.genesis,'CCTP_NETWORK_BINDING');
 const block=await read(P.baseRpc,'eth_getBlockByNumber',['finalized',false]);ensure(/^0x[0-9a-f]+$/.test(block?.number)&&/^0x[0-9a-f]{64}$/.test(block?.hash),'CONFIG_FINALIZED_BLOCK');
 const call=async(to,signature,args=[])=>{
  const x=await read(P.baseRpc,'eth_call',[{to,data:'0x'+selector(signature)+Buffer.concat(args).toString('hex')},block.number]);ensure(/^0x[0-9a-f]*$/.test(x),'CONFIG_CALL_HEX');return x;
 };
 const u=async(to,s,args=[])=>{const x=await call(to,s,args);ensure(bytes(x).length===32,'CONFIG_CALL_WORD');return BigInt(x).toString();};
 const a=async(to,s)=>wordAddress(await call(to,s));
 const source={chainId:P.chainId,domain:await u(P.transmitter,'localDomain()'),messageVersion:await u(P.transmitter,'version()'),
 transmitterPaused:await u(P.transmitter,'paused()'),messengerTransmitter:await a(P.messenger,'localMessageTransmitter()'),
 messengerMinter:await a(P.messenger,'localMinter()'),remoteMessenger:await call(P.messenger,'remoteTokenMessengers(uint32)',[word(5)]),
 bodyVersion:await u(P.messenger,'messageBodyVersion()'),usdcDecimals:await u(P.usdc,'decimals()'),usdcPaused:await u(P.usdc,'paused()'),
 usdcImplementation:wordAddress(await read(P.baseRpc,'eth_getStorageAt',[P.usdc,keccak(Buffer.from('org.zeppelinos.proxy.implementation')),block.number])),
 usdcAdmin:wordAddress(await read(P.baseRpc,'eth_getStorageAt',[P.usdc,keccak(Buffer.from('org.zeppelinos.proxy.admin')),block.number]))};
 source.minterPaused=await u(source.messengerMinter,'paused()');source.burnLimit=await u(source.messengerMinter,'burnLimitsPerMessage(address)',[bytes(address32(P.usdc))]);
 for(const key of ['usdcImplementation','messengerMinter']){const b=bytes(await read(P.baseRpc,'eth_getCode',[source[key],block.number]));ensure(b.length>0,'CONFIG_CODE_MISSING');source[key+'CodeSha256']=sha(b);}
 ensure(source.domain==='6'&&source.messageVersion==='1'&&source.bodyVersion==='1'&&source.transmitterPaused==='0'&&source.minterPaused==='0'&&source.usdcPaused==='0'&&source.usdcDecimals==='6'&&source.messengerTransmitter.toLowerCase()===P.transmitter.toLowerCase()&&source.remoteMessenger===hex(solBytes(P.solMessenger)),'UNSUPPORTED_CCTP_SOURCE_CONFIGURATION');
 const accounts=cctpAccounts(),entries=[['MessageTransmitter',accounts.messageTransmitter,P.solTransmitter],['TokenMessenger',accounts.tokenMessenger,P.solMessenger],['RemoteTokenMessenger',accounts.remoteMessenger,P.solMessenger],['TokenMinter',accounts.tokenMinter,P.solMessenger],['LocalToken',accounts.localToken,P.solMessenger],['TokenPair',accounts.tokenPair,P.solMessenger]];
 const result=await read(P.solRpc,'getMultipleAccounts',[entries.map(e=>e[1]),{commitment:'finalized',encoding:'base64'}]);ensure(Number.isSafeInteger(result?.context?.slot)&&result.value?.length===entries.length,'CONFIG_SOLANA_CONTEXT');
 const config={};entries.forEach(([name,address,owner],i)=>{const b=accountBytes(result.value[i],owner);config[name]={address,dataSha256:sha(b),fields:decodeCctpAccount(name,b)};});
 const mt=config.MessageTransmitter.fields,tm=config.TokenMessenger.fields,rm=config.RemoteTokenMessenger.fields,lt=config.LocalToken.fields,tp=config.TokenPair.fields;
 const enabledAttesters=mt.enabled_attesters.map(pk=>{const b=solBytes(pk);ensure(b.subarray(0,12).every(x=>x===0),'SOLANA_ATTESTER_ENCODING');return '0x'+b.subarray(12).toString('hex');});
 ensure(mt.local_domain===5&&mt.version===1&&!mt.paused&&!config.TokenMinter.fields.paused&&mt.signature_threshold>0&&mt.signature_threshold<=enabledAttesters.length&&tm.message_body_version===1&&rm.domain===6&&hex(solBytes(rm.token_messenger))===address32(P.messenger)&&lt.mint===P.mint&&lt.custody===accounts.custody&&tp.remote_domain===6&&hex(solBytes(tp.remote_token))===address32(P.usdc)&&tp.local_token===accounts.localToken,'UNSUPPORTED_CCTP_DESTINATION_CONFIGURATION');
 const feeRecipient=ata(tm.fee_recipient),recipient=destinationOwner?ata(destinationOwner):null;
 const tokenResult=await read(P.solRpc,'getMultipleAccounts',[[accounts.custody,feeRecipient,...(recipient?[recipient]:[])],{commitment:'finalized',encoding:'base64',minContextSlot:result.context.slot}]);
 ensure(tokenResult.context.slot>=result.context.slot&&tokenResult.value.length===(recipient?3:2),'CONFIG_TOKEN_CONTEXT');
 const custody=decodeTokenAccount(tokenResult.value[0],{mint:P.mint,owner:accounts.tokenMinter}),feeAccount=decodeTokenAccount(tokenResult.value[1],{mint:P.mint,owner:tm.fee_recipient});
 const recipientAccount=recipient&&tokenResult.value[2]?{address:recipient,...decodeTokenAccount(tokenResult.value[2],{mint:P.mint,owner:destinationOwner})}:null;
 const configuration={source,destination:{genesis:P.genesis,accounts,config,signatureThreshold:mt.signature_threshold,enabledAttesters,feeRecipient,feeAccount,custody,recipientAccount,recipientPreparation:recipient&&!recipientAccount?'CREATE_ATA_UNSIGNED_ONLY':recipient?'EXISTING_ACCOUNT_OBSERVED':'OWNER_UNSELECTED'}};
 // Do not hash mutable token balances / telemetry as upgrade/configuration identity.
 const stable={source,destination:{genesis:P.genesis,accounts,transmitter:mt,messenger:tm,remoteMessenger:rm,minter:config.TokenMinter.fields,localToken:{mint:lt.mint,custody:lt.custody,burnLimit:lt.burn_limit_per_message},tokenPair:tp,feeRecipient,enabledAttesters}};
 return snapshot('CctpConfigurationObservation',{schemaVersion:1,scope:'READ_ONLY_TESTNET',observedAt:new Date().toISOString(),sourceBlock:block.number,sourceBlockHash:block.hash,destinationSlot:tokenResult.context.slot,configuration,configurationHash:hash('CctpConfiguration',stable),observations:rpc.observations,noSigning:true,noSending:true});
}
