const $=id=>document.getElementById(id);
const labels={prepared:'Préparation simulée complète. Aucun consentement ni signature obtenus.','stale-quote':'La quote expirée bloque toute nouvelle dépense.','wrong-recipient':'Le destinataire altéré est refusé.','local-rejection':'Le score du fournisseur ne peut pas contourner la décision locale.','missing-evidence':'Une preuve obligatoire manque : préparation indisponible.','provider-success-only':'Une déclaration du fournisseur ne prouve pas la réception.','unknown':'Résultat ambigu : réconcilier la même tentative. Aucun nouvel envoi.','partial':'La réception connue est insuffisante : PARTIAL, pas COMPLETED.','completed-simulation':'Les reçus fictifs satisfont le minimum. Cela reste une simulation.'};
function amount(value,decimals){const n=BigInt(value),scale=10n**BigInt(decimals),whole=n/scale,frac=(n%scale).toString().padStart(decimals,'0').replace(/0+$/,'');return whole.toString()+(frac?'.'+frac:'');}
async function get(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error('Démonstration locale indisponible.');return r.json();}
async function prepare(){
 $('prepare').disabled=true;$('error').textContent='';
 try{const id=$('scenario').value,d=await get('/api/demo?scenario='+encodeURIComponent(id));
  $('decision').textContent=d.riskReport.decision;$('decision').dataset.status=d.riskReport.decision;
  $('result-description').textContent=labels[id];
  $('account').textContent=d.account.accountId+' · deux autorités indépendantes (fixtures)';
  $('position').textContent=d.funding.positionId+' · '+d.funding.requiredAtomic+' atomic';
  $('route').textContent=d.quote.stages.join(' → ')+' · Base Sepolia → Solana DEVNET · fournisseur fictif';
  $('risk').textContent=d.riskReport.hardFailures.length?d.riskReport.hardFailures.join(', '):d.riskReport.missingMandatoryEvidence.length?'Preuves absentes : '+d.riskReport.missingMandatoryEvidence.join(', '):'Contrôles obligatoires complets — scope SIMULATED';
  $('boundary').textContent='NOT_AUTHORIZED · aucun challenge, aucune signature, aucun envoi';
  $('expected').textContent=amount(d.quote.expectedFinalNetOutput,9)+' TEST_TARGET';$('minimum').textContent=amount(d.quote.minFinalNetOutput,9)+' TEST_TARGET';
  $('incident').textContent=d.incident?'État de la fixture : '+d.incident.state+' · SIMULATED':'';
  $('wallets').textContent=d.account.bindings.map(b=>b.walletProvider+' ('+b.networkRef+')').join(' ; ');
  $('fees').textContent=d.quote.fees.map(f=>f.scenario+' : '+f.amountAtomic+' atomic '+f.denomination+' · '+f.payer+' · '+f.inclusion+' · plafond '+f.maximumAtomic).join(' ; ');
  $('checks').textContent=d.riskReport.checks.map(c=>c.ruleId+': '+c.outcome).join(' · ');
  $('plan-hash').textContent=d.plan?.contentHash?.digest??'Aucun plan : préparation refusée.';
  $('json').textContent=JSON.stringify(d,null,2);
 }catch(e){$('error').textContent=e.message;$('decision').textContent='UNAVAILABLE';}finally{$('prepare').disabled=false;}
}
$('prepare').addEventListener('click',prepare);
try{const p=await get('/api/proof');$('proof-summary').textContent=p.economics.inputDelta+' atomic WSOL → +'+p.economics.hnnrDelta+' atomic HNNr · sponsor '+p.economics.sponsorDebitLamports+' lamports · un seul envoi.';$('proof-tx').textContent=p.transaction.signature;$('proof-slot').textContent='Slot '+p.transaction.slot+' · '+p.transaction.commitment+' · revue indépendante '+p.independentReview.passedChecks+'/'+p.independentReview.requiredChecks+' PASS';}catch{$('proof-summary').textContent='La preuve historique locale est indisponible.';}
await prepare();
