// A verified USDC settlement becomes an observed destination position, never swap authority.
import {ensure,snapshot,sameHash,atomic,hash} from '../core/canonical.mjs';
import {bindRequestToAccount} from '../core/cross-chain-account.mjs';
import {CCTP_CANDIDATE as P} from './cctp-readonly.mjs';
export function prepareSolanaExecutionHandoff({request,acceptedAccountSelection,mintObservation,acceptedMintIdentity}){
 bindRequestToAccount(request,acceptedAccountSelection);
 const {contentHash,...payload}=mintObservation;
 ensure(sameHash(contentHash,hash('CctpMintObservation',payload)),'HANDOFF_OBSERVATION_MUTATION');
 ensure(sameHash(mintObservation.mintIdentity,acceptedMintIdentity)&&mintObservation.scope==='READ_ONLY_TESTNET'&&mintObservation.mint===P.mint&&mintObservation.owner===request.destinationBinding.fundsAddress&&mintObservation.recipient===request.recipient&&atomic(mintObservation.amountAtomic)>=atomic(request.minimumDestinationAtomic)&&atomic(mintObservation.amountAtomic)<=atomic(request.amountAtomic),'HANDOFF_FINAL_SETTLEMENT_BINDING');
 return snapshot('SolanaSettlementHandoff',{schemaVersion:1,scope:'OBSERVED_POSITION_ONLY',accountSelectionHash:acceptedAccountSelection.contentHash,
 bindingId:request.destinationBinding.bindingId,fundsAddress:request.destinationBinding.fundsAddress,tokenAccount:request.recipient,mint:P.mint,
 amountAtomic:mintObservation.amountAtomic,receiptHash:mintObservation.contentHash,settlementIdentity:acceptedMintIdentity,
 existingExecutionPath:'FROZEN_P0_A3_SOLANA_CAPABILITY',nextAuthority:'NEW_INTENT_FRESH_RISK_AND_EXACT_SOLANA_AUTHORIZATION_REQUIRED',canSign:false,canSend:false,autoSwap:false});
}
