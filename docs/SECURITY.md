# Security V0

Status: FROZEN V0 SECURITY REQUIREMENTS — IMPLEMENTATION AND PROVIDERS UNVERIFIED

Freeze date: 2026-10-01. This is a threat model and set of acceptance requirements, not an audit or production-safety claim. See [architecture](ARCHITECTURE.md), [contracts](DOMAIN_CONTRACTS.md), and [scope](HACKATHON_SCOPE.md).

## Authority and custody model

| Principal | Allowed authority | Forbidden authority |
| --- | --- | --- |
| USER | Owns signing authority; approves economic limits and concrete bounded operations. | No implicit universal Solana/Base key or authority. |
| BACKEND | Proposes, verifies, orchestrates, persists, reconciles, and relays explicitly authorized payloads. | Cannot spend user funds alone; no user private key, unrestricted session key, recovery override, or standing backend allowance. |
| SPONSOR | Controls only sponsor funds and fee-payment signing under quotas/allowlists. | Cannot authorize asset transfers from the user merely by sponsoring fees. |
| PROVIDERS | Supply quotes, payloads, observations, settlement/tracking/refund interfaces. | Cannot bypass DEX validation or substitute accepted economics. All inputs are untrusted. |
| RISK PROVIDERS | Supply normalized observations, evidence, warnings, scores, hard-failure candidates, and external assessments. | No signing authority and no unilateral execution permission. |
| INVESTMENT BRAIN | Optional external RiskProvider integration. | No execution authority, private keys, direct internal imports, or transaction submission. |

A backend can broadcast a transaction already specifically authorized by the user; this is not independent discretionary authority. Backend compromise can still deceive the UI, disrupt availability, or relay an unexpired previously authorized operation. Self-custody does not by itself eliminate phishing or misleading-consent risk.

Protocols may temporarily escrow input after explicit source authorization. Record exact contracts/programs, upgrade/admin assumptions, order/recipient binding, final minimum enforcement, and available refund authority. The DEX backend must never become the user-funds custodian. Reject account configurations with hidden backend spend/admin capabilities that allow seizure.

## Signing and malicious payload controls

- Treat provider and adapter outputs as untrusted, even when a provider is allowlisted.
- Resolve network and account lookup references, decode material instructions/calls, and verify recipients, tokens, amounts, spenders, allowances, fees, native validity, and authority mutations.
- An allowed program/contract address alone is not proof of safe instructions.
- Compare decoded economic effects to immutable quote/plan commitments. Reject opaque/uninterpretable material operations.
- Use exact bounded approvals/permits where supported; do not request unlimited approvals for convenience.
- Concrete signatures or smart-account commitments must bind the intended network/account, recipients, spend limits, operation semantics, expiry, and native replay protection.
- WebAuthn login/control proof is separate from spending authorization. A generic authentication challenge cannot authorize arbitrary transactions.
- Simulate the actual composed payload where supported, with evidence freshness and declared limitations. Simulation does not replace on-chain checks or future price/risk guarantees.
- Economic changes require a fresh quote/report/plan and consent. Changed bytes require fresh concrete signing and prior-attempt reconciliation.

## Passkeys, sensitive actions, and recovery

Verify the actual deployed wallet/program, funds address versus metadata address, spend/admin authorities, upgrade authority, credential lookup/ownership checks, and the independent access/exit path. Never infer self-custody from “passkey” or “seedless” labels.

Passkey flows validate expected RP ID/origin, fresh scoped challenge, user presence/verification where required, and binding to the authorized operation. Device/platform compatibility must be tested. Biometrics remain with the authenticator; no raw biometric data reaches the DEX.

Sensitive authority changes, credential rotation, recovery, and policy changes require fresh step-up and the actual account's verified enforcement. A backend-only MFA prompt is not a cryptographic restriction on directly callable on-chain authority. If a required restriction is unsupported, disable the product action and disclose the account's actual authority rather than claiming protection.

recoveryPolicyRef is OPTIONAL and absent until verified. Multiple devices holding synchronized copies of one credential are not automatically independent factors or 2-of-N authorities. Additional authenticators, rotation, and loss scenarios are tested only where supported. The V0 must disclose device/domain/provider dependencies and loss consequences without claiming complete recovery.

Complete 2-of-N recovery and Recovery Kit are post-hackathon. No master key is backed up in a kit; a future kit must never suffice alone to seize funds. Encryption alone does not make a fully recoverable master key safe. No custom recovery cryptography is introduced in V0.

## Risk authority and freshness

RiskProvider(s) -> normalized evidence -> DEX LOCAL RISK POLICY -> RiskReport.

A failed local hard rule always yields REJECTED. Missing mandatory evidence yields INDETERMINATE unless an already failed hard rule determines REJECTED. Scores and external ALLOWED-like assessments cannot override those results.

Reports bind exact amounts, representations, recipients, economic routes, evidence validity, and policy versions. Revalidate before any new spend, including a separately authorized later swap. Stale reports never permit a new spend. Existing irreversible commitments may still settle; tracking continues and alerts cannot imply cancellation.

Unknown optional Meme analyses remain unknown. Unsupported token extensions, mandatory-data failure, invalid representation provenance, or a failed required simulation cannot become a high “safety score.”

## Gas sponsor isolation

Keep sponsor keys/funds separate from user authority and repository secrets. Sponsor signing permits only a fully validated message with a capped fee/account-creation budget. Apply network/program/instruction/token allowlists, per-operation/per-user/global quotas, reservation expiry, rate limits, and an emergency stop.

Account for failed attempts and necessary account-creation funding. Sponsor compromise must be bounded by funded balance and quotas; it must not grant user spending authority. Never silently fall back to charging user fees beyond accepted bounds. Base sponsorship must have separate verified evidence.

## Execution durability and uncertain outcomes

Persist the exact attempt, authorization reference, signed payload/message hash, native nonce/expiry, and deterministic transaction/order references before external submission. Use atomic record updates and source-position reservations to avoid concurrent overspending.

UNKNOWN never means FAILED and never triggers an automatic new source spend. Reconcile the recorded invocation with chain and protocol evidence. A provider timeout or “not found” response alone is insufficient proof that an operation cannot still execute. A safe retransmission uses the same bounded payload and verified native replay/validity behavior, not a newly built spend.

PARTIAL never means COMPLETED. Retain all known, locked, in-flight, refundable, and uncertain positions. Final completion requires correlated receipts for the accepted recipient, representation, net minimum, and finality. Provider marketing/status alone is insufficient. No generic cross-chain exactly-once guarantee is claimed.

Quote expiry before submission differs from the deadline of an already-open order. Refunds may have fees, return a converted asset, require a claim, or be unavailable. Show verified actual outcomes; do not invent compensation or auto-start another bridge.

## Threat register

| Threat | Required control and evidence |
| --- | --- |
| Malicious transaction payload | Altered recipient/mint/spender/instruction/amount/fees are rejected before signing; material payloads are decoded and bound to the plan. |
| Stale quote | Submission blocked after quote/native validity expires; changed economics require fresh consent. |
| Stale risk report | New spending blocked after required evidence/policy validity expires. |
| Duplicate source execution | Concurrent/repeated requests share the existing execution or conflict; crash/timeout tests prove reconciliation without fresh source recreation. |
| Provider outage | Stop new dependent commitments, preserve exact references, and retry bounded read/reconciliation operations. No blind fallback spend. |
| Partial cross-chain execution | Track actual funds locations and escrow; do not mark the intent filled; continue only with verified mechanisms and authority. |
| Compromised sponsor | No user spending key/authority; bounded sponsor balance, allowlists, quotas, and revocation/stop procedures. |
| Malicious/incorrect asset representation | Verify network, exact mint/contract, standard, decimals, provenance/backing, and registry eligibility. Ticker matching is insufficient. |
| Lost device | Verify available independent access or disclose loss limitations; no fake recovery capability or backend unilateral reset. |
| Recovery weakness | Independent factors/authorities, account-enforced rules where required, and tested authority changes; unverified recovery absent. |
| Backend compromise | No general user spend authority; bounded operation signatures, payload verification/consent, isolated secrets, and independent user exit. Residual UI deception risk is explicit. |
| Malicious adapter response | Strict normalization, context-matching evidence, independent chain verification, and fail-closed decoding/coverage. |
| Credential/account association attack | Fresh proof of control and actual authority inspection; do not adopt an account solely because it lists a credential identifier. |
| Reorg or false completion | Required finality and correlated receipts; contradictory later evidence reopens uncertainty without source replay. |
| Risk provider compromise | Local hard rules remain authoritative; source/coverage provenance and mandatory-data checks cannot be bypassed by scores. |

## Data, secrets, and operational limits

No private keys, seed phrases, master recovery keys, credentials, or secrets are committed. Empty configuration placeholders do not authorize public disclosure: an API key may be confidential even when .env.example calls configuration “public.” Keep real values server-side where required and out of logs/browser bundles.

Store only necessary account/credential metadata, evidence, and authorization artifacts. Restrict access to signed payloads: they may be executable until expiry. Apply purpose-based retention; preserve sufficient immutable evidence for incident reconciliation. Public traces contain safe identifiers and redacted evidence, not credentials or full authenticator assertions.

Avoid unrestricted delegated backend/session signing in V0. Provider purchases, credential provisioning, funded tests, spending budgets, and external transactions require separate operational authorization. This documentation mission authorizes none.

## Security acceptance gates

Before calling the implementation ready, prove authority independence, safe payload composition, scoped replay protection, sponsorship isolation, stale-evidence rejection, duplicate/unknown recovery, correct final receipts, and explicit custody disclosures. Exact dependencies/deployments and audit assumptions must be recorded then.

No account, provider, recovery mechanism, or deployment is security-certified by this freeze.
