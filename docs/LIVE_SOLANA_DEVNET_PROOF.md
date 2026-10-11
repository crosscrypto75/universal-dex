# Historical live Solana DEVNET proof

This is a concise index into an existing accepted result, not a new audit, simulation or execution. The [original public proof JSON](../spikes/p0-a-passkey-sponsored-swap/evidence/live-finalized-2026-10-07/proof.json) is retained byte-for-byte.

Transaction: `2qjU5L4rgAQyLdYYh4AWx8zGnbqMDg1bFdWjknrZBFj3qMRFyFgKNvZ9KA19SeF1MgP62ecTfA5CWAN35S4w9tcq`.

[Solana Explorer, DEVNET](https://explorer.solana.com/tx/2qjU5L4rgAQyLdYYh4AWx8zGnbqMDg1bFdWjknrZBFj3qMRFyFgKNvZ9KA19SeF1MgP62ecTfA5CWAN35S4w9tcq?cluster=devnet). The local proof is the preserved historical record; explorer availability/history retention is external.

| Result | Accepted evidence |
|---|---|
| Finality | Slot 508578376, finalized, error null |
| WSOL input | 100001 → 1; debit 100000 atomic |
| HNNr output / minimum | 5967587 / 5907911 atomic |
| User vault native SOL | 0 → 0; input tokens were separately funded |
| Sponsor debit / approved ceiling | 1498440 / 1498440 lamports |
| Network fee / output ATA rent | 10000 / 1488440 lamports |
| Passkey authority counter | 2 → 3; P-256 assertion with user presence/verification accepted |
| Assertion / sponsor signature / send | One each |
| Independent post-finality review | 18/18 PASS, checks and limitations in `independentReview` |

The original independent reviewer checked finalized transactions/account history, exact wire/message binding, P-256 and Ed25519 signatures, economic deltas and the single-send journal. This task does not repeat that live review. Windows Hello is operator-reported; hardware attestation is not established. Raw RPC responses were not separately archived by that reviewer; sanitized review results and hashes are preserved.

The proof establishes a scoped passkey-controlled, sponsored SPL/DEX operation on DEVNET. It does not prove production custody/recovery, independent exit, universal token support or Base-to-Solana settlement. Backend non-custody remains PARTIALLY_PROVEN; LazorKit product approval remains NOT_APPROVED. The completed historical attempt must never be replayed as a demonstration.
