import {ensure,hash,snapshot,atomic,sameHash} from './canonical.mjs';
import {fresh} from './schema.mjs';
import {validateAccount,validateRegistry,selectFunding} from './accounts-assets.mjs';
import {createIntent} from './intent.mjs';
import {normalizeSyntheticProposal} from './route-contract.mjs';

export const requiredEvidenceIds=Object.freeze(['FINAL_NET_MINIMUM','TRACKING','REFUND_TERMS','LIQUIDITY','PRICE_IMPACT','PAUSE_EXPLOIT_STATE','REPRESENTATION_BACKING']);
export function proposalSubject(p){const {contentHash,capabilityEvidence,...payload}=p;return hash('RouteEvidenceSubject',payload);}
function sumFees(p,filter){return p.fees.filter(filter).reduce((n,f)=>n+atomic(f.amountAtomic),0n);}
function atMost(now,...timestamps){return new Date(Math.min(...timestamps.map(t=>Date.parse(t)),Date.parse(now)+300000)).toISOString();}
export function evaluateRoute({intent,account,registry,funding,proposal:p,now}){
  const failures=[]; const missing=[];const checks=[];
  const check=(id,ok)=>{checks.push({ruleId:id,outcome:ok?'PASS':'FAIL',mandatory:true});if(!ok)failures.push(id);};
  const source=account.bindings.find(b=>b.bindingId===funding.bindingId);
  const dest=account.bindings.find(b=>b.bindingId===p.destinationBindingId);
  const output=registry.representations.find(r=>r.representationId===p.outputRepresentationId);
  const input=registry.representations.find(r=>r.representationId===p.inputRepresentationId);
  check('INTENT_HASH',sameHash(p.intentHash,intent.contentHash));
  check('FRESH_QUOTE',fresh(p.createdAt,p.quoteValidUntil,now)&&fresh(intent.createdAt,intent.validUntil,now));
  check('SOURCE_POSITION',p.fundingPositionId===funding.positionId&&p.sourceBindingId===funding.bindingId&&p.inputRepresentationId===funding.representationId&&p.inputAtomic===funding.requiredAtomic);
  check('NETWORK_BINDING',p.sourceNetwork===source.networkRef&&source.networkRef==='eip155:84532:base-sepolia'&&p.destinationNetwork==='solana:devnet'&&dest?.networkRef===p.destinationNetwork);
  check('RECIPIENT',!!dest&&p.recipient===dest.fundsAddress);
  check('REPRESENTATION',!!input&&!!output&&input.networkRef===p.sourceNetwork&&output.networkRef===p.destinationNetwork&&input.assetId===intent.fundingAssetId&&output.assetId===intent.targetAssetId);
  check('ONE_CROSS_CHAIN',p.stages.length===1&&p.stages[0]==='CROSS_CHAIN');
  check('DURATION',p.estimatedDurationSeconds>0&&p.estimatedDurationSeconds<=intent.constraints.maxDurationSeconds&&Date.parse(p.settlementDeadline)>Date.parse(p.quoteValidUntil)&&Date.parse(p.settlementDeadline)-Date.parse(p.createdAt)<=intent.constraints.maxDurationSeconds*1000);
  check('UNIQUE_FEES',new Set(p.fees.map(f=>f.feeId)).size===p.fees.length);
  const outputFees=sumFees(p,f=>f.scenario==='SUCCESS'&&f.inclusion==='DEDUCTED_FROM_OUTPUT');
  const gross=atomic(p.expectedGrossOutputAtomic);const net=gross-outputFees;const minimum=atomic(p.minFinalNetOutputAtomic);
  check('NET_OUTPUT',net>0n&&minimum<=net&&minimum*10000n>=net*BigInt(10000-intent.constraints.maxSlippageBps));
  check('INPUT_FEE_BOUND',sumFees(p,f=>f.scenario==='SUCCESS'&&f.inclusion==='DEDUCTED_FROM_INPUT')<atomic(p.inputAtomic));
  check('FEE_INCLUSION',p.fees.every(f=>(f.inclusion!=='DEDUCTED_FROM_OUTPUT'||f.denomination===p.outputRepresentationId)&&(f.inclusion!=='DEDUCTED_FROM_INPUT'||f.denomination===p.inputRepresentationId)&&(f.inclusion==='SPONSORED')===(f.payer==='SPONSOR')));
  check('FEE_MAXIMUM',p.fees.every(f=>atomic(f.amountAtomic)<=atomic(f.maximumAtomic)));
  const groups=new Map();for(const f of p.fees){const key=JSON.stringify([f.scenario,f.denomination,f.payer]);groups.set(key,(groups.get(key)??0n)+atomic(f.maximumAtomic));}
  check('FEE_BUDGET',Array.from(groups.entries()).every(([key,n])=>{const [,denomination,payer]=JSON.parse(key);const budget=intent.constraints.feeBudgets.find(b=>b.denomination===denomination&&b.payer===payer);return !!budget&&n<=atomic(budget.maximumAtomic);}));
  const sourceExtra=p.fees.filter(f=>f.scenario==='SUCCESS'&&f.payer==='USER'&&f.inclusion==='SEPARATE'&&f.denomination===p.inputRepresentationId).reduce((n,f)=>n+atomic(f.maximumAtomic),0n);
  check('SOURCE_DEBIT',atomic(p.sourceDebitLimitAtomic)===atomic(p.inputAtomic)+sourceExtra&&atomic(p.sourceDebitLimitAtomic)<=atomic(funding.availableAtomic));
  const refund=p.refundTerms;
  check('REFUND_BINDING',refund.representationId===p.inputRepresentationId&&refund.networkRef===p.sourceNetwork&&refund.recipient===source.fundsAddress&&atomic(refund.maximumDeductionAtomic)<=atomic(p.inputAtomic)&&Date.parse(refund.deadline)>=Date.parse(p.settlementDeadline));
  check('REFUND_FEES',p.fees.filter(f=>f.scenario==='REFUND'&&f.denomination===refund.representationId&&f.payer==='USER').reduce((n,f)=>n+atomic(f.maximumAtomic),0n)<=atomic(refund.maximumDeductionAtomic));
  const eIds=p.capabilityEvidence.map(e=>e.evidenceId);check('EVIDENCE_IDENTITIES',new Set(eIds).size===eIds.length&&eIds.every(id=>requiredEvidenceIds.includes(id)));
  const subject=proposalSubject(p);for(const id of requiredEvidenceIds){const e=p.capabilityEvidence.find(e=>e.evidenceId===id);if(e&&(!sameHash(e.subjectHash,subject)||e.outcome==='FAIL'))check(id,false);else if(!e||e.outcome==='UNKNOWN'||!fresh(e.observedAt,e.validUntil,now)){missing.push(id);checks.push({ruleId:id,outcome:'UNKNOWN',mandatory:true});}else check(id,true);}
  const sortedEvidence=[...p.capabilityEvidence].sort((a,b)=>a.evidenceId<b.evidenceId?-1:a.evidenceId>b.evidenceId?1:0);
  const quotePayload={schemaVersion:1,scope:'SIMULATED',quoteId:p.quoteId,intentHash:intent.contentHash,registryVersion:registry.registryVersion,fundingPosition:funding,sourceBindingId:p.sourceBindingId,destinationBindingId:p.destinationBindingId,recipient:p.recipient,inputRepresentationId:p.inputRepresentationId,outputRepresentationId:p.outputRepresentationId,swapInputAmount:p.inputAtomic,sourceDebitLimit:p.sourceDebitLimitAtomic,expectedFinalNetOutput:String(net<0n?0n:net),minFinalNetOutput:p.minFinalNetOutputAtomic,finalMinimumStatus:p.finalMinimumStatus,fees:p.fees,stages:p.stages,refundTerms:p.refundTerms,createdAt:p.createdAt,quoteValidUntil:p.quoteValidUntil,settlementDeadline:p.settlementDeadline,estimatedDurationSeconds:p.estimatedDurationSeconds,capabilityEvidence:sortedEvidence,providerRef:p.providerRef,adapterVersion:p.adapterVersion,deploymentStatus:p.deploymentStatus};
  const {quoteId,createdAt,...economic}=quotePayload;const routeHash=hash('EconomicRoute',economic);const quote=snapshot('RouteQuote',{...quotePayload,routeHash});
  const validity=atMost(now,p.quoteValidUntil,intent.validUntil,funding.validUntil,...account.bindings.flatMap(b=>[b.controlProof.validUntil,b.authorityEvidence.validUntil]),...p.capabilityEvidence.map(e=>e.validUntil));
  const riskReport=snapshot('RiskReport',{schemaVersion:1,scope:'SIMULATED',reportId:'risk-'+routeHash.digest,intentHash:intent.contentHash,routeHash,policyId:'STANDARD_SPOT',policyVersion:'p0b-preparation-v1',decision:failures.length?'REJECTED':missing.length?'INDETERMINATE':'ALLOWED',hardFailures:failures,missingMandatoryEvidence:missing,checks,evidenceRefs:sortedEvidence,createdAt:now,validUntil:validity});
  return {quote,riskReport};
}
export function prepareSyntheticTrade({account:accountInput,registry:registryInput,intent:intentInput,positions,proposal:proposalInput,now}){
  const account=validateAccount(accountInput,now);const registry=validateRegistry(registryInput);const intent=createIntent(intentInput,registry,account);const funding=selectFunding(intent,account,registry,positions,now);const proposal=normalizeSyntheticProposal(proposalInput);const {quote,riskReport}=evaluateRoute({intent,account,registry,funding,proposal,now});
  if(riskReport.decision!=='ALLOWED')return {status:'PREPARATION_DENIED',account,registry,intent,funding,quote,riskReport,plan:null};
  ensure(fresh(now,riskReport.validUntil,now),'EXPIRED_PREPARATION');
  const plan=snapshot('ExecutionPlan',{schemaVersion:1,scope:'SIMULATED',purpose:'PREPARATION_ONLY',liveEligible:false,planId:'plan-'+quote.routeHash.digest,preparationBindings:{intent,quote,riskReport},intentHash:intent.contentHash,quoteHash:quote.contentHash,routeHash:quote.routeHash,riskReportHash:riskReport.contentHash,accountHash:account.contentHash,registryHash:registry.contentHash,fundingPosition:funding,acceptedEconomics:{inputAtomic:quote.swapInputAmount,sourceDebitLimitAtomic:quote.sourceDebitLimit,outputRepresentationId:quote.outputRepresentationId,recipient:quote.recipient,expectedFinalNetOutput:quote.expectedFinalNetOutput,minFinalNetOutput:quote.minFinalNetOutput,fees:quote.fees,maxSlippageBps:intent.constraints.maxSlippageBps,feeBudgets:intent.constraints.feeBudgets},steps:[{stepId:'cross-chain-1',kind:'CROSS_CHAIN',sourceNetwork:proposal.sourceNetwork,destinationNetwork:proposal.destinationNetwork,providerRef:proposal.providerRef,requiredAuthority:'SEPARATE_BASE_WALLET_SPENDING_SIGNATURE_NOT_OBTAINED'}],authorizationRequirements:['ECONOMIC_CONSENT_NOT_OBTAINED','CONCRETE_SOURCE_WALLET_AUTHORIZATION_NOT_OBTAINED','VERIFIED_LIVE_PROVIDER_CAPABILITY_NOT_OBTAINED','DECODED_BOUND_PAYLOAD_NOT_PREPARED'],preparedPayloadRefs:[],submissionValidUntil:riskReport.validUntil,reconciliationPolicy:'UNKNOWN_RECONCILE_ONLY_NO_RETRY',refundPolicy:quote.refundTerms,createdAt:now});
  return {status:'SIMULATED_PREPARATION_COMPLETE',account,registry,intent,funding,quote,riskReport,plan,humanBoundary:{state:'NOT_AUTHORIZED',canSign:false,canSend:false,challenge:null,requiredAction:'FUTURE_EXPLICIT_BASE_AUTHORIZATION_AFTER_LIVE_CAPABILITY_AND_PAYLOAD_REVIEW'}};
}
