import {fixture,event,receipt} from './demo-fixtures.mjs';
import {prepareSyntheticTrade} from '../core/preparation.mjs';
import {simulateExecution} from '../core/simulated-execution.mjs';

export const SCENARIOS=Object.freeze(['prepared','stale-quote','wrong-recipient','local-rejection','missing-evidence','provider-success-only','unknown','partial','completed-simulation']);
export function runSyntheticDemo(name='prepared'){
 if(!SCENARIOS.includes(name))throw Error('UNKNOWN_FIXTURE_SCENARIO');const input=fixture();
 if(name==='stale-quote')input.proposal.quoteValidUntil='2026-10-07T21:59:59.000Z';
 if(name==='wrong-recipient'||name==='local-rejection')input.proposal.recipient='fixture:attacker';
 if(name==='missing-evidence')input.proposal.capabilityEvidence.pop();
 const prepared=prepareSyntheticTrade(input);const events=[];
 if(['provider-success-only','unknown','partial','completed-simulation'].includes(name)){
  events.push(event(prepared.plan,'FIXTURE_AUTHORIZATION',0),event(prepared.plan,'SUBMISSION_INTENT',1));
  if(name==='provider-success-only')events.push(event(prepared.plan,'PROVIDER_CLAIM',2));
  else if(name==='unknown')events.push(event(prepared.plan,'LOST_RESPONSE',2));
  else events.push(event(prepared.plan,'SOURCE_RECEIPT',2,receipt(prepared.plan,'source','10000000')),event(prepared.plan,'DESTINATION_RECEIPT',3,receipt(prepared.plan,'destination',name==='partial'?'1':'60000000')));
 }
 return {...prepared,scenario:name,risk:prepared.riskReport,externalAssessment:name==='local-rejection'?{scope:'SIMULATED',producer:'UNTRUSTED_FIXTURE',score:99,claimedDecision:'ALLOWED',authoritative:false}:null,incident:prepared.plan?simulateExecution(prepared.plan,events):null,incidentEvents:events,disclosure:{evidenceScope:'SIMULATED',providerDeployment:'NOT_DEPLOYED',signingEnabled:false,sendingEnabled:false,requiresLiveProviderProof:true}};
}
