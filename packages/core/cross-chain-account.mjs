// Public account selections for unsigned preparation. A selection never proves control.
import {ensure,hash,sameHash,snapshot,canonicalize} from './canonical.mjs';
import {decode,s,network,hashRef} from './schema.mjs';
export const selectionSchema={schemaVersion:s.literal(1),scope:s.literal('UNSIGNED_ACCOUNT_SELECTION'),accountId:s.string,revision:s.integer,
 bindings:s.array({bindingId:s.string,networkRef:network,fundsAddress:s.string,kind:s.enum(['EVM_WALLET','SOLANA_SMART_ACCOUNT']),
 provenanceHash:hashRef,controlStatus:s.literal('NOT_OBTAINED'),spendingAuthority:s.literal('NOT_OBTAINED')},2,2)};
export function createCrossChainAccountSelection(input){
 const a=decode(selectionSchema,input);
 ensure(a.bindings[0].networkRef==='eip155:84532:base-sepolia'&&a.bindings[0].kind==='EVM_WALLET'&&a.bindings[1].networkRef==='solana:devnet'&&a.bindings[1].kind==='SOLANA_SMART_ACCOUNT','ACCOUNT_CHAIN_AUTHORITY_SEPARATION');
 ensure(a.bindings[0].bindingId!==a.bindings[1].bindingId,'ACCOUNT_BINDING_IDS');
 ensure(/^0x[0-9a-f]{40}$/.test(a.bindings[0].fundsAddress)&&a.bindings[0].fundsAddress!=='0x'+'0'.repeat(40),'CANONICAL_EVM_ACCOUNT');
 return snapshot('CrossChainUniversalAccountSelection',a);
}
export function verifyAccountSelection(snapshotInput){
 const {contentHash,...body}=snapshotInput;const a=createCrossChainAccountSelection(body);
 ensure(sameHash(contentHash,a.contentHash),'ACCOUNT_SELECTION_HASH');return a;
}
export function bindRequestToAccount(request,accountInput){
 const a=verifyAccountSelection(accountInput);
 ensure(request.accountId===a.accountId&&sameHash(request.accountSelectionHash,a.contentHash),'REQUEST_UNIVERSAL_ACCOUNT_BINDING');
 for(const binding of [request.sourceBinding,request.destinationBinding]){
  const accepted=a.bindings.find(b=>b.bindingId===binding.bindingId);
  ensure(accepted&&['networkRef','fundsAddress','kind'].every(k=>accepted[k]===binding[k]),'REQUEST_ACCOUNT_MEMBERSHIP');
 }
 return a;
}
