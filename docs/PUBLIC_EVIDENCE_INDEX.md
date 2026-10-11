# Public evidence index

Four judge-facing entry points, without internal operator logs or lab captures:

| Question | Evidence |
|---|---|
| Did a real DEX swap finalize? | [Historical Solana DEVNET proof](LIVE_SOLANA_DEVNET_PROOF.md): transaction, slot, input/output and limits. |
| Was it independently checked? | [Unchanged accepted proof JSON](../spikes/p0-a-passkey-sponsored-swap/evidence/live-finalized-2026-10-07/proof.json), `independentReview`: 18/18 PASS with explicit limitations. |
| Who paid and did the user vault need native SOL? | Same proof, `economics`: vault native SOL 0 → 0; sponsor debit 1498440 lamports, network fee 10000 and output-account rent 1488440. Input tokens were separately funded. |
| Can judges reproduce the demo safely? | [README verification commands](../README.md#demo--verification): public fixture tests and loopback demo verification, no credential, private Harness or blockchain RPC. The verifier prints its result; this is not a live swap replay. |

PROVEN is historical DEVNET execution. SIMULATED is preparation/incident demonstration. NOT_PROVEN applies to complete cross-chain settlement and real Nightly non-broadcast qualification. PATH_B runtime isolation is unqualified and frozen. A separate empty ATA prerequisite does not establish delivered USDC.
