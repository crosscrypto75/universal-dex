import {PublicKey,Transaction,TransactionInstruction,ComputeBudgetProgram} from '@solana/web3.js';
import {ensure,hash,snapshot,canonicalize,atomic,sameHash} from '../core/canonical.mjs';
import {fresh} from '../core/schema.mjs';
import {verifyCctpConfigurationObservation} from './cctp-observation.mjs';
import {createCrossChainRequest,prepareCrossChain,verifyCrossChainPreparation} from '../core/cross-chain.mjs';
import {CCTP_CANDIDATE as P} from './cctp-readonly.mjs';
import {burnParameters,encodeMessage,verifyMessage,verifyAttestation,unsignedSourceCalls,solBytes,ata,disc,bytes,hex,cctpAccounts,TOKEN_PROGRAM,ATA_PROGRAM,sha} from './cctp-codec.mjs';
export class CctpProvider {
 constructor({profile,observation,accountSelection}){
  verifyCctpConfigurationObservation(observation);
  ensure(canonicalize(profile)===canonicalize(cctpPreparationProfile(profile.identityHash,observation)),'PROFILE_CONFIGURATION_BINDING');
  this.profile=structuredClone(profile);this.configuration=structuredClone(observation.configuration);this.accountSelection=structuredClone(accountSelection);
 }
 propose(requestInput){
  const r=createCrossChainRequest(requestInput),p=this.profile;
  ensure(r.sourceToken===P.usdc.toLowerCase()&&r.destinationToken===P.mint,'UNSUPPORTED_CCTP_DEPLOYMENT');
  ensure(r.recipient===ata(r.destinationBinding.fundsAddress),'CCTP_UNIVERSAL_ACCOUNT_RECIPIENT');
  return {schemaVersion:1,providerRef:p.providerRef,adapterVersion:p.adapterVersion,requestHash:r.contentHash,
   deploymentHash:hash('CrossChainDeployment',p),sourceNetwork:r.sourceBinding.networkRef,destinationNetwork:r.destinationBinding.networkRef,
   sourceToken:r.sourceToken,destinationToken:r.destinationToken,sourceAddress:r.sourceBinding.fundsAddress,
   destinationOwner:r.destinationBinding.fundsAddress,recipient:r.recipient,amountAtomic:r.amountAtomic,
   maximumProtocolFeeAtomic:r.feeCaps.protocolAtomic,minimumDestinationAtomic:r.minimumDestinationAtomic,
   maximumSourceNativeFeeAtomic:r.feeCaps.sourceNativeAtomic,maximumDestinationNativeFeeAtomic:r.feeCaps.destinationNativeAtomic,
   stages:['CROSS_CHAIN'],status:'PROPOSED',protocolCommitmentHash:hash('CctpBurnCommitment',burnParameters(r))};
 }
 prepare(requestInput,proposal,now){
  const request=createCrossChainRequest(requestInput);
  // Verify the untrusted provider-specific commitment separately from the generic route.
  ensure(sameHash(proposal.protocolCommitmentHash,hash('CctpBurnCommitment',burnParameters(request))),'CCTP_COMMITMENT_MUTATION');
  ensure(canonicalize(proposal)===canonicalize(this.propose(requestInput)),'CCTP_ROUTE_MUTATION');
  ensure(atomic(request.amountAtomic)<=atomic(this.configuration.source.burnLimit)&&atomic(request.amountAtomic)<=atomic(this.configuration.destination.custody.amountAtomic),'CCTP_BURN_LIMIT_OR_CUSTODY');
  return prepareCrossChain({request:requestInput,proposal,profile:this.profile,accountSelection:this.accountSelection,now});
 }
}
// A profile is a five-minute preparation observation, never an executable capability.
export function cctpPreparationProfile(identityHash,observation){
 verifyCctpConfigurationObservation(observation);
 const c=observation.configuration;
 ensure(c.source.domain==='6'&&c.source.messageVersion==='1'&&c.source.bodyVersion==='1'&&c.source.usdcDecimals==='6'&&c.source.transmitterPaused==='0'&&c.source.minterPaused==='0'&&c.source.usdcPaused==='0'&&c.destination.genesis===P.genesis&&c.destination.config.MessageTransmitter.fields.local_domain===5&&!c.destination.config.MessageTransmitter.fields.paused&&!c.destination.config.TokenMinter.fields.paused,'UNSUPPORTED_CCTP_DEPLOYMENT');
 return {schemaVersion:1,providerRef:'CctpProvider',adapterVersion:'cctp-v2-standard-p0b-v1',sourceNetwork:'eip155:84532:base-sepolia',destinationNetwork:'solana:devnet',sourceToken:P.usdc.toLowerCase(),destinationToken:P.mint,identityHash,configurationHash:observation.configurationHash,
 observedAt:observation.observedAt,validUntil:new Date(Date.parse(observation.observedAt)+300000).toISOString(),paused:false,refundSupport:'UNAVAILABLE',purpose:'UNSIGNED_ONLY'};
}
export function prepareCctpSource(requestInput){
 const r=createCrossChainRequest(requestInput);
 ensure(r.sourceToken===P.usdc.toLowerCase()&&r.destinationToken===P.mint&&r.recipient===ata(r.destinationBinding.fundsAddress),'CCTP_SOURCE_REQUEST_BINDING');
 return snapshot('CctpUnsignedSource',{schemaVersion:1,scope:'UNSIGNED_TESTNET_ONLY',requestHash:r.contentHash,
 calls:unsignedSourceCalls(r),expectedSourceMessage:encodeMessage(burnParameters(r)),
 protocolCommitmentHash:hash('CctpBurnCommitment',burnParameters(r)),nonceStatus:'BASE_NONCES_REQUIRE_FRESH_WALLET_READ',
 cctpNonceStatus:'ASSIGNED_OFFCHAIN_AFTER_BURN',canSign:false,canSend:false});
}
function meta(pubkey,isWritable=false,isSigner=false){return {pubkey:new PublicKey(pubkey),isWritable,isSigner};}
export function createRecipientAtaInstruction(owner,payer){
 const recipient=ata(owner);
 return new TransactionInstruction({programId:new PublicKey(ATA_PROGRAM),keys:[meta(payer,true,true),meta(recipient,true),meta(owner),meta(P.mint),meta('11111111111111111111111111111111'),meta(TOKEN_PROGRAM)],data:Buffer.from([1])});
}
function vector(b){const n=Buffer.alloc(4);n.writeUInt32LE(b.length);return Buffer.concat([n,b]);}
export function receiveInstruction(requestInput,message,attestation,configuration,feePayer){
 const r=createCrossChainRequest(requestInput);
 ensure(r.recipient===ata(r.destinationBinding.fundsAddress)&&r.destinationToken===P.mint&&r.sourceToken===P.usdc.toLowerCase(),'CCTP_DESTINATION_REQUEST_BINDING');
 const decoded=verifyMessage(r,message,{attested:true});
 const verified=verifyAttestation(message,attestation,configuration.destination);
 const a=cctpAccounts(decoded.nonce),d=configuration.destination;
 ensure(d.feeRecipient===ata(d.config.TokenMessenger.fields.fee_recipient),'CCTP_FEE_RECIPIENT');
 ensure(canonicalize({...a,usedNonce:cctpAccounts().usedNonce})===canonicalize(d.accounts),'CCTP_ACCOUNT_SUBSTITUTION');
 const keys=[meta(feePayer,true,true),meta(feePayer,false,true),meta(a.authority),meta(a.messageTransmitter),meta(a.usedNonce,true),meta(P.solMessenger),meta('11111111111111111111111111111111'),meta(a.transmitterEvent),meta(P.solTransmitter),
 meta(a.tokenMessenger),meta(a.remoteMessenger),meta(a.tokenMinter),meta(a.localToken,true),meta(a.tokenPair),meta(d.feeRecipient,true),meta(r.recipient,true),meta(a.custody,true),meta(TOKEN_PROGRAM),meta(a.messengerEvent),meta(P.solMessenger)];
 const instruction=new TransactionInstruction({programId:new PublicKey(P.solTransmitter),keys,data:Buffer.concat([disc('global:receive_message'),vector(bytes(message)),vector(bytes(attestation))])});
 return {instruction,decoded,verified};
}
function materializeCctpDestination({request,sourceMessage,message,attestation,configuration,feePayer,blockhash,lastValidBlockHeight,createAta=false},scope){
 const r=createCrossChainRequest(request);
 verifyMessage(r,message,{sourceMessage,attested:true});
 ensure(new PublicKey(feePayer).toBase58()===feePayer&&PublicKey.isOnCurve(solBytes(feePayer)),'DESTINATION_PAYER');
 ensure(new PublicKey(blockhash).toBase58()===blockhash&&Number.isSafeInteger(lastValidBlockHeight)&&lastValidBlockHeight>0,'DESTINATION_NATIVE_VALIDITY');
 const {instruction,decoded,verified}=receiveInstruction(request,message,attestation,configuration,feePayer);
 const tx=new Transaction({feePayer:new PublicKey(feePayer),blockhash,lastValidBlockHeight});
 // Two attester signatures make receive alone 1224 bytes. Keep ATA creation separate.
 tx.add(instruction);
 let ataPrerequisite=null;
 if(createAta){
  const before=new Transaction({feePayer:new PublicKey(feePayer),blockhash,lastValidBlockHeight});
  before.add(createRecipientAtaInstruction(r.destinationBinding.fundsAddress,feePayer));
  const wire=before.serialize({requireAllSignatures:false,verifySignatures:false});
  ataPrerequisite={purpose:'CREATE_USDC_ATA_ONLY',unsignedWireBase64:wire.toString('base64'),messageSha256:sha(before.serializeMessage()),requiresFinalizedObservationBeforeBurn:true};
 }
 const wire=tx.serialize({requireAllSignatures:false,verifySignatures:false}),material=tx.serializeMessage();
 return snapshot('CctpUnsignedDestination',{schemaVersion:1,scope,requestHash:r.contentHash,
 mintIdentity:hash('CctpDestinationMint',{network:'solana:devnet',genesis:P.genesis,program:P.solMessenger,mint:P.mint,owner:r.destinationBinding.fundsAddress,recipient:r.recipient,nonce:decoded.nonce,messageHash:decoded.messageHash,netAmountAtomic:String(atomic(r.amountAtomic)-atomic(decoded.feeExecutedAtomic))}),
 messageHash:decoded.messageHash,attestationIdentity:verified.contentHash,feePayer,blockhash,lastValidBlockHeight,createAta,ataPrerequisite,
 unsignedWireBase64:wire.toString('base64'),messageSha256:sha(material),wireSha256:sha(wire),requiredSignatureCount:tx.compileMessage().header.numRequiredSignatures,canSign:false,canSend:false});
}
export function prepareCctpDestination(args){
 const {plan,acceptedAccountSelection,observation,identityHash,now,request}=args;
 ensure(plan&&observation&&acceptedAccountSelection&&identityHash,'DESTINATION_ACCEPTED_CONTEXT_REQUIRED');
 verifyCctpConfigurationObservation(observation);
 ensure(sameHash(identityHash,plan.profile.identityHash)&&sameHash(observation.configurationHash,plan.profile.configurationHash),'DESTINATION_CONFIGURATION_BINDING');
 ensure(fresh(observation.observedAt,new Date(Date.parse(observation.observedAt)+300000).toISOString(),now),'DESTINATION_STALE_CONFIGURATION');
 verifyCrossChainPreparation(plan,request,plan.profile,now,{reconcile:true,accountSelection:acceptedAccountSelection});
 ensure(!Object.hasOwn(args,'configuration'),'DESTINATION_PROVIDER_CONFIGURATION_FORBIDDEN');
 return materializeCctpDestination({...args,configuration:observation.configuration},'UNSIGNED_TESTNET_ONLY');
}
// Explicitly synthetic crypto/serialization tests cannot become a deployment capability.
export function prepareCctpDestinationFixture(args){
 ensure(args.request.requestId.startsWith('fixture:')&&args.request.accountId.startsWith('fixture:'),'FIXTURE_CONTEXT_REQUIRED');
 return materializeCctpDestination(args,'SIMULATED_UNSIGNED_TESTNET');
}
export function verifyCctpDestination(candidate,args,{fixture=false}={}){
 const expected=fixture?prepareCctpDestinationFixture(args):prepareCctpDestination(args);ensure(canonicalize(candidate)===canonicalize(expected),'DESTINATION_TRANSACTION_MUTATION');
 const tx=Transaction.from(Buffer.from(candidate.unsignedWireBase64,'base64'));ensure(tx.signatures.every(s=>s.signature===null),'SIGNED_MATERIAL_FORBIDDEN');return expected;
}
