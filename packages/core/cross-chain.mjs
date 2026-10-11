// Provider-neutral testnet preparation. This module never grants spending authority.
import {ensure,atomic,hash,sameHash,snapshot,canonicalize} from './canonical.mjs';
import {s,decode,hashRef,network,fresh} from './schema.mjs';
import {bindRequestToAccount} from './cross-chain-account.mjs';
const binding={bindingId:s.string,networkRef:network,fundsAddress:s.string,kind:s.enum(['EVM_WALLET','SOLANA_SMART_ACCOUNT'])};
export const crossChainRequestSchema={
 schemaVersion:s.literal(1),scope:s.literal('TESTNET_PREPARATION'),requestId:s.string,accountId:s.string,accountSelectionHash:hashRef,
 sourceBinding:binding,destinationBinding:binding,positionId:s.string,availableAtomic:s.atomic,
 sourceToken:s.string,destinationToken:s.string,amountAtomic:s.positive,minimumDestinationAtomic:s.positive,
 recipient:s.string,feeCaps:{protocolAtomic:s.atomic,sourceNativeAtomic:s.atomic,destinationNativeAtomic:s.atomic},
 createdAt:s.time,validUntil:s.time
};
const routeSchema={
 schemaVersion:s.literal(1),providerRef:s.string,adapterVersion:s.string,requestHash:hashRef,
 deploymentHash:hashRef,sourceNetwork:network,destinationNetwork:network,sourceToken:s.string,destinationToken:s.string,
 sourceAddress:s.string,destinationOwner:s.string,recipient:s.string,amountAtomic:s.positive,
 maximumProtocolFeeAtomic:s.atomic,minimumDestinationAtomic:s.positive,
 maximumSourceNativeFeeAtomic:s.atomic,maximumDestinationNativeFeeAtomic:s.atomic,
 stages:s.array(s.literal('CROSS_CHAIN'),1,1),status:s.literal('PROPOSED'),protocolCommitmentHash:hashRef
};
export const deploymentProfileSchema={
 schemaVersion:s.literal(1),providerRef:s.string,adapterVersion:s.string,sourceNetwork:network,destinationNetwork:network,
 sourceToken:s.string,destinationToken:s.string,identityHash:hashRef,configurationHash:hashRef,
 observedAt:s.time,validUntil:s.time,paused:s.literal(false),refundSupport:s.literal('UNAVAILABLE'),
 purpose:s.literal('UNSIGNED_ONLY')
};
export function createCrossChainRequest(input){
 const r=decode(crossChainRequestSchema,input);
 ensure(/^0x[0-9a-f]{40}$/.test(r.sourceBinding.fundsAddress)&&r.sourceBinding.fundsAddress!=='0x'+'0'.repeat(40),'CANONICAL_EVM_ACCOUNT');
 ensure(r.sourceBinding.networkRef==='eip155:84532:base-sepolia'&&r.sourceBinding.kind==='EVM_WALLET','SOURCE_BINDING');
 ensure(r.destinationBinding.networkRef==='solana:devnet'&&r.destinationBinding.kind==='SOLANA_SMART_ACCOUNT','DESTINATION_BINDING');
 ensure(atomic(r.amountAtomic)<=atomic(r.availableAtomic)&&atomic(r.minimumDestinationAtomic)<=atomic(r.amountAtomic),'FUNDING_OR_MINIMUM');
 ensure(atomic(r.feeCaps.protocolAtomic)<atomic(r.amountAtomic)&&atomic(r.amountAtomic)-atomic(r.feeCaps.protocolAtomic)>=atomic(r.minimumDestinationAtomic),'CONSERVATIVE_FINAL_MINIMUM');
 ensure(atomic(r.feeCaps.sourceNativeAtomic)>0n&&atomic(r.feeCaps.destinationNativeAtomic)>0n,'NATIVE_FEE_CAPS_REQUIRED');
 ensure(Date.parse(r.createdAt)<Date.parse(r.validUntil),'REQUEST_VALIDITY');
 return snapshot('CrossChainRequest',r);
}
export function requestBody(request){const {contentHash,...body}=request;ensure(sameHash(contentHash,hash('CrossChainRequest',body)),'REQUEST_HASH');return body;}
export function normalizeCrossChainProposal(input){return decode(routeSchema,input);}
export function prepareCrossChain({request:requestInput,proposal:proposalInput,profile:profileInput,accountSelection,now}){
 const request=createCrossChainRequest(requestInput),proposal=normalizeCrossChainProposal(proposalInput),profile=decode(deploymentProfileSchema,profileInput);
 const account=bindRequestToAccount(request,accountSelection);
 ensure(fresh(request.createdAt,request.validUntil,now),'STALE_REQUEST');
 ensure(fresh(profile.observedAt,profile.validUntil,now)&&Date.parse(profile.validUntil)-Date.parse(profile.observedAt)<=300000,'STALE_DEPLOYMENT_IDENTITY');
 const deploymentHash=hash('CrossChainDeployment',profile);
 const checks=[];
 const check=(name,ok)=>{ensure(ok,name);checks.push(name);};
 check('PROVIDER_PROFILE',proposal.providerRef===profile.providerRef&&proposal.adapterVersion===profile.adapterVersion);
 check('REQUEST_BINDING',sameHash(proposal.requestHash,request.contentHash));
 check('DEPLOYMENT_BINDING',sameHash(proposal.deploymentHash,deploymentHash));
 check('SOURCE_CHAIN',proposal.sourceNetwork===request.sourceBinding.networkRef&&proposal.sourceNetwork===profile.sourceNetwork);
 check('DESTINATION_CHAIN',proposal.destinationNetwork===request.destinationBinding.networkRef&&proposal.destinationNetwork===profile.destinationNetwork);
 check('SOURCE_TOKEN',proposal.sourceToken===request.sourceToken&&proposal.sourceToken===profile.sourceToken);
 check('DESTINATION_TOKEN',proposal.destinationToken===request.destinationToken&&proposal.destinationToken===profile.destinationToken);
 check('WALLET_BINDING',proposal.sourceAddress===request.sourceBinding.fundsAddress&&proposal.destinationOwner===request.destinationBinding.fundsAddress);
 check('RECIPIENT_BINDING',proposal.recipient===request.recipient);
 check('AMOUNT_BINDING',proposal.amountAtomic===request.amountAtomic);
 check('FEE_CAP',atomic(proposal.maximumProtocolFeeAtomic)<=atomic(request.feeCaps.protocolAtomic)&&atomic(proposal.maximumSourceNativeFeeAtomic)<=atomic(request.feeCaps.sourceNativeAtomic)&&atomic(proposal.maximumDestinationNativeFeeAtomic)<=atomic(request.feeCaps.destinationNativeAtomic));
 check('MINIMUM_BINDING',proposal.minimumDestinationAtomic===request.minimumDestinationAtomic&&atomic(request.amountAtomic)-atomic(proposal.maximumProtocolFeeAtomic)>=atomic(request.minimumDestinationAtomic));
 const validUntil=new Date(Math.min(Date.parse(request.validUntil),Date.parse(profile.validUntil))).toISOString();
 return snapshot('CrossChainPreparation',{schemaVersion:1,scope:'TESTNET_PREPARATION',request,accountSelection:account,proposal,profile,deploymentHash,
 routeHash:hash('CrossChainRoute',proposal),checks,createdAt:now,validUntil,liveEligible:false,canSign:false,canSend:false,
 authorityRequirements:['EXPLICIT_ECONOMIC_CONSENT','INDEPENDENT_SOURCE_WALLET_CONTROL','EXACT_SOURCE_SIGNATURE','DESTINATION_FEE_PAYER_AUTHORIZATION'],
 refundSupport:'UNAVAILABLE',reconciliationPolicy:'UNKNOWN_RECONCILE_ONLY_NO_RESEND'});
}
// Re-evaluate policy, not just the outer hash, against the locally accepted request/profile.
export function verifyCrossChainPreparation(plan,acceptedRequest,acceptedProfile,now,{reconcile=false,accountSelection=plan.accountSelection}={}){
 const {contentHash,...body}=plan;ensure(sameHash(contentHash,hash('CrossChainPreparation',body)),'PREPARATION_HASH');
 if(!reconcile)ensure(fresh(plan.createdAt,plan.validUntil,now),'STALE_PREPARATION');
 const expected=prepareCrossChain({request:acceptedRequest,profile:acceptedProfile,accountSelection,proposal:plan.proposal,now:plan.createdAt});
 ensure(canonicalize(expected)===canonicalize(plan),'PROVIDER_ROUTE_MUTATION');
 return expected;
}
export const EXECUTION_STATES=Object.freeze(['PREPARED','AUTHORIZED','SUBMITTED','SETTLING','COMPLETED','UNKNOWN','REFUND_PENDING','REFUNDED','PARTIAL','FAILED_BEFORE_SUBMISSION']);
