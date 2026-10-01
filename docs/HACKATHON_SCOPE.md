# Hackathon Scope V0

Status: FROZEN V0 SCOPE — DELIVERY AND PROVIDER CAPABILITIES UNPROVEN

Freeze date: 2026-10-01. [Architecture](ARCHITECTURE.md), [contracts](DOMAIN_CONTRACTS.md), and [security](SECURITY.md) define the requirements. Documentary freeze is not a claim that any milestone has shipped. No implementation, package creation, dependency installation, funds movement, or provider purchase is part of this documentation mission.

## MUST SHIP

| Deliverable | Acceptance evidence |
| --- | --- |
| User-controlled passkey Solana account | Create and return to the account; inspect actual authorities; execute a user-authorized transaction; document custody and a backend-independent access/exit path. |
| External wallet support | Connect a Solana wallet and link a separately controlled existing Base wallet using fresh, scoped control proofs. No universal authority is inferred. |
| Zero-SOL Solana trade | Pre-trade chain evidence shows zero user SOL; the trade and required account creation succeed with disclosed sponsorship. Sponsor costs and token deductions are accounted for. |
| Spot | Executable trades covering BTC and ETH through approved representations, SOL, at least one altcoin, and stablecoin funding. Record exact identities, backing risks, liquidity, and receipts. |
| Canonical assets | Registry distinguishes canonical economic identity from concrete network representation; ticker collision/incorrect-representation scenarios are refused. |
| Intent abstraction | User chooses target asset and amount; explicit funding defaults, representation risks, and economics are accepted without normal chain/bridge/DEX selection. |
| One live Base -> Solana route | Correlated real source transaction/order and destination receipt prove the accepted final asset, recipient, amount, and finality. Mocks or uncorrelated transfers do not qualify. |
| Transparent total cost | Show expected net output, enforceable final minimum, fee components/payers, native source gas requirements, and separate refund/failure costs before signing. No double counting or financial float. |
| Advanced route inspection | Reveal source/destination, exact representations, operations, providers, guarantees, sponsorship, deadlines, and risk evidence. |
| Deterministic risk hard gates | Local hard failure yields REJECTED despite a favorable external score; missing mandatory evidence yields INDETERMINATE; both block spending. |
| Curated Meme Market | Separate view and stronger policy covering mint/freeze authorities, relevant Token-2022 extensions, liquidity/impact, concentration, and available simulation. Missing mandatory checks or unsupported extensions block trades. |
| Persistence/idempotency/reconciliation | Recover the exact submitted invocation after a crash/lost response; duplicate requests cannot recreate the source spend; UNKNOWN/PARTIAL remain honest. |
| Explicit custody model | Enumerate spend/admin/upgrade/recovery authorities, protocol escrow, sponsor limits, and independence from our backend. recoveryPolicyRef is absent if unverified. |

The first cross-chain slice is USDC Base -> one settlement -> final Solana asset, only with verified final delivery/minimum enforcement. If unavailable, document the limitation or narrow the live demo to an asset directly deliverable with an enforced minimum. The target and UI must then identify that delivered asset. Do not count an intermediate quote as a guaranteed final trade.

The initial executable trade scope excludes ungated transfer-then-uncommitted-swap promises. Same-chain and directly settled final routes require an enforceable accepted minimum. Any widening follows a separately validated capability and remains within the frozen route shape.

## SHOULD SHIP

- Additional independent authenticator and credential rotation where supported and verified.
- Base gas abstraction with source-network capabilities and fees separately proven.
- Investment Brain integration through RiskProvider normalized evidence; final authority remains DEX-local.
- Final fee reconciliation using actual receipts, with success/refund accounting.
- Refund UX showing current location, refundable asset, deductions, deadline, and required authority.
- Periodic Meme position monitoring with explicit evidence coverage; alerts do not execute trades.

## STRETCH

- Optional source or destination swap, each with verified composition, authorization, and outcome bounds.
- A second verified adapter for an existing capability, without blind fallback after submission.
- Bounded creator holdings, linked-wallet, first-buyer, or cluster analysis with traceable evidence.
- Better settlement progress and incident notifications without new spending authority.

## POST-HACKATHON

- Complete 2-of-N recovery using genuinely independent factors/authorities.
- Encrypted Recovery Kit that cannot alone seize the account; no master private key in the kit.
- EVM passkey smart accounts.
- Multi-source AUTO funding: aggregate balances across wallets/chains rather than selecting one position.
- More chains, native Bitcoin integration, additional assets, and broader routing.
- Full Meme analytics for bundlers/clusters/simulations and continuous monitoring.
- Own solver, bridge, or infrastructure research only under a separately approved architecture/security decision. None is authorized by V0.

## Critical path after separate implementation authorization

1. Establish evidence requirements and test the actual deployed account authorization, independent access, and account/funds addresses.
2. Prove passkey account + swap payload + sponsorship composition, including account creation, size/compute constraints, and exact final minimum.
3. Verify canonical representation identities/backing and executable liquidity for the required Spot assets.
4. Prove USDC Base settlement to the chosen final representation and account; verify tracking and real refund semantics.
5. Select the minimal dependencies/adapters justified by those proofs.
6. Build the thin end-to-end slice, then validate persistence, malicious payload rejection, stale evidence, and ambiguous submission recovery.
7. Complete UX, custody/coverage disclosures, reproducible demo evidence, and actual reuse disclosure.

This order is a plan for the next authorized mission, not permission to start during documentation freeze. Never broaden the architecture to hide a failed proof.

## Validation scenarios

- Alter recipient, mint, spender, instruction, amount, or fee in a returned payload: reject before signing.
- Expire a quote/risk report: no new spend; already engaged settlement tracking continues.
- Present a strong external score with a failed local rule: REJECTED.
- Remove mandatory evidence: INDETERMINATE.
- Lose the source submission response or restart immediately after send: reconcile the existing attempt, do not generate another source spend.
- Receive the intermediate/wrong asset or too little final output: no COMPLETED state.
- Fail after a known source effect: expose PARTIAL with known and uncertain asset locations.
- Lose a provider: preserve references and stop new dependent commitments.
- Change account authorities or representation eligibility: invalidate affected prepared execution.
- Exceed sponsorship quota or lose sponsor availability: refuse uncovered spending rather than silently charging the user.
- Exercise a refund where supported: receipt proves the actual asset/recipient/net amount; do not promise restoration of the original input.

## Evidence and scope controls

Capability records include adapter/deployment version, network/environment, tokens, account kind, constraints, verification time, and reproducible evidence. A passing document check is not a passing provider integration. UNPROVEN remains distinct from UNSUPPORTED.

Use mocks/test environments for deterministic incident validation, but the MUST live route requires a genuinely supported live route with actual economic settlement. Funded tests, credentials, spending budgets, and transaction authorization require their own explicit operational scope; this freeze authorizes none.

No calendar deadline, sponsor budget, exact hackathon eligibility rules, specific provider, or token representation is invented. Confirm the event's rules before submission, particularly treatment of pre-existing work and external services.

## Unproven capabilities at freeze

- User-controlled passkey deployment, authority/upgrade assumptions, independent access, and platform compatibility.
- Any recovery mechanism, authenticator independence, or credential rotation.
- Passkey/swap/sponsor compatibility and zero-SOL account-creation coverage.
- Exact BTC/ETH/altcoin representations, backing evidence, and sufficient liquidity.
- Base -> Solana final-asset settlement, final minimum enforcement, account compatibility, tracking, and refund behavior.
- Base gas abstraction and source approval/permit compatibility.
- Investment Brain service availability, normalized contract, evidence coverage, and latency.
- Concrete Meme evidence coverage and simulation compatibility.

These are implementation proof gates, not established architecture contradictions. No provider capability is marked VERIFIED by this freeze.
