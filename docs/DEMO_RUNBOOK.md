# Universal DEX demo runbook

Trade the asset, not the chain. Choisis l’actif. Le système gère le reste.

This demonstration combines a **PROVEN historical DEVNET swap** with a **SIMULATED deterministic preparation product**. It never opens the completed ceremony or moves funds. Node 24 is the tested runtime; the public demo needs no private Harness. Current npm dependencies are pinned in the root manifest/lockfile.

## Run the preparation demo

From the DEX repository root:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run test:public
npm.cmd run verify:demo
npm.cmd run demo
```

Open `http://localhost:8790`. It is a loopback GET-only server. It exposes fixture data and a redacted historical proof, without wallet connection, credentials, signing, WebAuthn or send methods. Do not open the old port 8787 as a demo action.

## Five-minute story

1. Show the historical P0-A3 panel: one passkey assertion, one sponsor signature and send, finalized Raydium swap; [independent 18/18 proof](LIVE_SOLANA_DEVNET_PROOF.md). Windows Hello is operator-reported; no hardware attestation is claimed. Counter 2 → 3; WSOL 100001 → 1; HNNr +5967587; sponsor debit 1498440 lamports. These are actual DEVNET results, not fixture outputs.
2. Prepare the normal simulated intent: 10 TEST_USD → TEST_TARGET. The asset identities, wallets, balances, provider and receipts are fictional. UserIntent specifies assets/economics; it does not select a bridge, DEX or chain.
3. Inspect UniversalAccount: separate Base and Solana bindings behind WalletProvider identifiers. A Solana passkey supplies no Base spending authority. Implemented binding contracts are not live wallet integrations.
4. Show one selected funding position, one cross-chain stage, net expected output, minimum and itemized fee payer/caps. Advanced inspection exposes concrete networks and hashes.
5. Select stale quote, wrong recipient or missing evidence. REJECTED/INDETERMINATE produce no plan. A favorable external score cannot override a local failed rule.
6. Select provider-success-only: the provider claim cannot prove COMPLETED. Select UNKNOWN: reconcile the recorded attempt, never create another spend. Select PARTIAL: known insufficient output is not completion. The completed-simulation scenario requires exact independent fixture receipts and remains SIMULATED.
7. Show NOT_AUTHORIZED. Every plan is PREPARATION_ONLY, liveEligible:false and contains no payload. The disabled real-authorization control cannot trigger a passkey or funds movement.

## Capability labels

| Capability | Status |
|---|---|
| P0-A3 sponsored passkey Raydium swap | PROVEN, historical DEVNET only |
| Canonical preparation, local risk, account/route contracts | IMPLEMENTED_NOT_LIVE_PROVEN |
| External funding, incident states and journal recovery demo | SIMULATED |
| CCTP Base Sepolia → Solana DEVNET USDC | Documented candidate; read-only deployment metadata; execution UNPROVEN |
| Complete live cross-chain execution | NOT_PROVEN; offline transaction preparation does not establish settlement |
| LazorKit as product dependency | NOT_APPROVED |
| Backend non-custody | PARTIALLY_PROVEN |

The actual candidate targets USDC directly. The fictional TEST_TARGET demo is not evidence that CCTP swaps to SOL/HNNr. Its hypothetical refund support is not evidence of CCTP refund capability. Transport qualification and Base inclusion-time total-fee guarantees remain unresolved; see the [roadmap](ROADMAP.md).

## Failure/restart reproduction

`npm.cmd run test:public` runs 41 public fixture checks, including strict schemas, amounts, malicious proposals, expiry, UNKNOWN/replay, receipt mismatch, partial completion and fixture journal crashes/truncation. `npm.cmd run verify:demo` checks the historical proof and nine served scenarios over loopback only. These commands do not run the private operator/integration suite or repeat a live Solana review. See the [public evidence index](PUBLIC_EVIDENCE_INDEX.md).

The public fixture journal is separate from all private historical attempts. Do not reset or replay any P0-A3 row, assertion or signed wire. No mainnet, Base approval/burn, live bridge, sponsor expenditure or new live Solana operation is authorized by this demo.
