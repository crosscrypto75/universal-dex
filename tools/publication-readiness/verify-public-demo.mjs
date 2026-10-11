// Public verification: local fixture HTTP only, no wallet/RPC/credential access.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const proofFile=resolve(root,'spikes/p0-a-passkey-sponsored-swap/evidence/live-finalized-2026-10-07/proof.json');
const proofBytes=readFileSync(proofFile),proof=JSON.parse(proofBytes);
assert.equal(proof.transaction.slot,508578376);
assert.equal(proof.transaction.commitment,'finalized');
assert.equal(proof.independentReview.passedChecks,18);
assert.equal(proof.economics.sponsorDebitLamports,'1498440');
assert.equal(proof.economics.vaultNativeLamportsBefore,'0');
assert.equal(proof.economics.vaultNativeLamportsAfter,'0');
const originalFetch=globalThis.fetch;let externalRequests=0;
globalThis.fetch=(url,options)=>{
 const parsed=new URL(url instanceof Request?url.url:String(url));
 if(parsed.hostname!=='127.0.0.1'){externalRequests++;throw Error('EXTERNAL_NETWORK_FORBIDDEN');}
 return originalFetch(url,options);
};
const {createDemoServer}=await import('../../apps/api/demo-server.mjs');
const {SCENARIOS}=await import('../../packages/adapters/synthetic-demo.mjs');
const privateRuntimeBefore=existsSync(resolve(root,'.p0b-ceremony-runtime'));
const server=createDemoServer();await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
const base='http://127.0.0.1:'+server.address().port;
const expected={prepared:['ALLOWED','PREPARED'],'wrong-recipient':['REJECTED',null],'provider-success-only':['ALLOWED','SUBMITTED'],unknown:['ALLOWED','UNKNOWN'],partial:['ALLOWED','PARTIAL'],'completed-simulation':['ALLOWED','COMPLETED']};
try{
 const get=async route=>{const response=await fetch(base+route,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200,route);return response;};
 for(const route of ['/','/style.css','/demo.mjs','/api/scenarios'])await get(route);
 assert.deepEqual(await (await get('/api/proof')).json(),proof);
 for(const scenario of SCENARIOS){
  const result=await (await get('/api/demo?scenario='+scenario)).json();
  assert.equal(result.disclosure.evidenceScope,'SIMULATED');assert.equal(result.disclosure.signingEnabled,false);assert.equal(result.disclosure.sendingEnabled,false);
  if(expected[scenario]){assert.equal(result.riskReport.decision,expected[scenario][0]);assert.equal(result.incident?.state??null,expected[scenario][1]);}
 }
 assert.equal((await fetch(base+'/api/demo',{method:'POST'})).status,405);
 assert.equal(existsSync(resolve(root,'.p0b-ceremony-runtime')),privateRuntimeBefore);
 assert.equal(externalRequests,0);
 console.log(JSON.stringify({status:'PASS',scenarios:SCENARIOS.length,network:'LOOPBACK_ONLY',externalRequests,walletCalls:0,signatures:0,broadcasts:0,proofSha256:createHash('sha256').update(proofBytes).digest('hex'),proofScope:'HISTORICAL_ACCEPTED_REVIEW_NOT_RERUN',privateRuntimeTouched:false}));
}finally{globalThis.fetch=originalFetch;server.closeAllConnections();await new Promise(accept=>server.close(accept));}
