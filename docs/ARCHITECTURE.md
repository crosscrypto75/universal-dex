# Architecture V0

Status: ARCHITECTURE V0 — FROZEN FOR HACKATHON IMPLEMENTATION

Freeze date: 2026-10-01. Basis: the human-approved architecture review and its six amendments. This freeze covers the hackathon architecture, not the long-term architecture, provider selection, implementation readiness, or production security. Capabilities without evidence remain unproven and unavailable for execution.

Related specifications: [contracts](DOMAIN_CONTRACTS.md), [scope](HACKATHON_SCOPE.md), [security](SECURITY.md), and [reuse disclosure](PRE_EXISTING_WORK.md). No runtime code, packages, or definitive dependencies are introduced by this freeze.

## 1. Product North Star

> Trade the asset, not the chain.

The user chooses an asset and an amount. The normal trade flow resolves funding, representations, chains, liquidity, cross-chain settlement, and fees automatically within supported capabilities. The user consents to the economic result and its risks. Advanced inspection exposes the concrete route. Automation must never conceal custody, financial limits, representation risk, or funds stranded in an intermediate state.

The long-term asset universe includes BTC, ETH, SOL, altcoins, stablecoins, and memecoins. Meme Market is a specialized vertical with stronger risk rules, not the entire product.

## 2. Scope V0

- Solana is the primary execution and destination network; Base is the only external source network.
- Existing wallets and a passkey-controlled Solana smart account are supported entry paths.
- One funding account and one asset position fund each intent. AUTO selects that position; it does not aggregate balances.
- Exact-input spot trades, a curated asset registry, and a distinct curated Meme Market are in scope.
- At least one live Base-to-Solana route is required. Prefer USDC Base to a directly settled final Solana asset.
- A user holding zero SOL can trade on Solana through verified fee sponsorship.
- Persistent execution, deterministic local risk rules, explicit fees, and route inspection are required.

BTC and ETH on Solana are explicitly approved representations with identified backing and risks, not a claim of native BTC or ETH custody. Source gas abstraction on Base is a separate SHOULD SHIP capability. Until proven, disclose any source-network fee requirement.

## 3. System context

The system has a browser application, one modular backend, and durable execution storage. A background reconciliation mechanism resumes persisted work independently of the browser. It may run in the backend or a worker using the same application code; no separate microservice, queue, or hosting technology is prescribed.

External systems are user wallets/authenticators, Solana and Base, liquidity and cross-chain providers, gas sponsors, data/price providers, and optional external risk services. Investment Brain remains an external risk integration. Universal Agent Harness is outside the product and its build/runtime dependency graph.

## 4. Modules

| Module | Responsibility |
| --- | --- |
| Web experience | Onboarding, Spot/Meme views, consent, route inspection, and execution status. |
| Accounts | Verify control of bindings, observe authorities, and expose proven authorization capabilities. |
| Asset Registry | Versioned canonical identities, concrete representations, provenance, and eligibility. |
| Intent and Routing | Validate the need, select one funding position, and build a bounded economic route. |
| Risk Engine | Apply DEX-local policy to normalized evidence and produce the final RiskReport. |
| Execution Engine | Validate payloads, obtain authorization, submit, track, and reconcile. |
| Provider Adapters | Translate external capabilities, evidence, quotes, payloads, and references. |
| Execution Store | Persist records, attempts, authorization references, and sponsorship reservations. |

These are logical modules, not independently deployed services. No LLM or autonomous agent constructs or authorizes transactions.

## 5. Dependency direction

```text
web / api composition
        -> application use cases and core ports
        -> domain contracts and deterministic policies

adapters -> core ports and normalized contracts
```

Composition selects adapters. The domain has no network, SDK, database, UI, or provider-specific dependency. Adapters may use external SDKs later, but cannot determine business policy. Browser wallet integration and server adapters have distinct entry points; server credentials cannot enter browser bundles.

The proposed layout, to create only when implementation is authorized, is:

```text
apps/web/
apps/api/
packages/core/
packages/adapters/
tests/scenarios/
```

Core contains contracts, domain rules, application use cases, and ports. Adapters contain only integrations and technical persistence. Tests may be colocated; scenarios verify cross-module behavior. Do not create speculative chain, agent, bridge, solver, or analytics packages.

## 6. Forbidden dependencies

- Core importing a provider SDK, provider DTO, RPC client, storage driver, or UI framework.
- Risk providers or Investment Brain obtaining transaction/signing authority.
- Backend holding user private keys or a general user spending authority, including unrestricted session keys or token allowances.
- Runtime, build, development workflow, or distribution requiring the private Harness.
- Direct imports of Investment Brain internals.
- A new proprietary bridge, AMM, blockchain, smart-account program, or solver in V0.
- Provider-specific business rules or secrets in shared/browser code.

## 7. Account model

UniversalAccount is a logical grouping of accounts controlled by the user. It is not a universal address, private key, or common Solana/Base authority. Every chain binding has its own network identity, funds address, proof of control, authorization mechanism, and verified capabilities.

A passkey Solana account does not authorize Base spending. The first cross-chain flow uses a separately linked existing Base wallet with explicit control proof. Link proofs are fresh and bound to the account, network, address, purpose, and nonce. Re-read on-chain authorities before accepting spending capabilities.

The user owns signing authority. recoveryPolicyRef is optional and absent until a recovery mechanism is verified. Additional authenticators and recovery capabilities must not be inferred from marketing claims or a stored reference. A second credential is not automatically multi-factor recovery. Document actual spend/admin/upgrade authorities and an independent path to access and move funds without our backend.

## 8. Canonical asset model

CanonicalAsset identifies the economic asset; AssetRepresentation identifies what is actually held on a specific network. Symbol is presentation only. Registry entries bind exact native identifiers or mint/contract addresses, decimals, standards, provenance, backing, and redemption assumptions.

Representations of the same asset may have different custody, depeg, wrapping, bridge, or liquidity risks. Derivatives are not silently treated as their underlying asset. Curated eligibility and market classification are versioned. Choosing the Spot tab cannot bypass Meme rules; the strongest applicable policy covers all assets and operations in a route.

## 9. Intent flow

```text
asset + amount + explicit funding defaults
  -> UserIntent
  -> controlled bindings + approved registry + verified capabilities
  -> bounded RouteQuote
  -> normalized risk evidence -> DEX-local RiskReport
  -> validated ExecutionPlan
  -> economic consent + concrete user authorization
  -> persisted submission -> reconciliation -> verified outcome
```

The normal UserIntent contains canonical assets and economic constraints, not a chain, bridge, pool, or DEX choice. Routing selects concrete representations and accounts. An intent is a request, not spending authority. Revised economics require a new accepted snapshot.

## 10. Risk boundary

```text
RiskProvider(s)
  -> normalized evidence / external assessment
  -> DEX LOCAL RISK POLICY
  -> final RiskReport
```

Only DEX policy determines ALLOWED, REJECTED, or INDETERMINATE. External scores, warnings, hard-failure candidates, and assessments are inputs. No external provider can authorize execution alone. A violated local hard rule always produces REJECTED, including when evidence is also missing. Otherwise missing mandatory evidence produces INDETERMINATE. Both prevent a new spend.

STANDARD_SPOT checks provenance, representation/backing, cross-chain exposure, liquidity, price impact, and depeg/wrapping risk. MEME_MARKET adds mint/freeze authorities, relevant Token-2022 extensions, concentration, and available simulation. Unsupported extensions or missing mandatory evidence fail closed. Creator holdings, linked wallets, first buyers, bundlers, clusters, and continuous monitoring are progressively added only with documented coverage. Missing optional analysis is explicitly unknown, never evidence of safety.

Reports bind the exact intent revision, economic route, amount, representations, policy version, coverage, and observation times. Quote or risk expiry prevents a new spend. Fresh risk does not authorize a changed route. After irreversible engagement, new evidence may stop subsequent spending but cannot undo a committed settlement.

## 11. Routing boundary

Routing is deterministic over approved representations, verified capabilities, funding availability, and user constraints. Apply hard eligibility rules before comparing net output, total costs, latency, and disclosed exposure. Start with one verified adapter per necessary capability; do not build a general provider competition engine.

V0 has one source account/position, no cross-chain splitting, no balance aggregation, no cycles, and at most one cross-chain operation. Same-chain liquidity aggregation inside a swap stage is permitted only when its operations and limits are inspectable and validated; it cannot conceal another cross-chain operation.

Expected net output and enforceable minimum final output are distinct. Fees state currency, payer, inclusion method, and bounds. Failure/refund fees are a separate scenario. Indicative reference-currency totals use timestamped fixed-point/rational prices, not authoritative financial floats.

## 12. Cross-chain boundary

The Core has one principal CrossChainProvider port. Bridge transfer, intent settlement, and provider-specific mechanisms remain inside adapters and capability profiles.

```text
optional source swap
  -> MAXIMUM ONE cross-chain operation
  -> optional destination swap
```

The preferred first vertical slice is:

```text
USDC Base -> one verified settlement -> final Solana asset
```

Enable that slice only when the provider's deployed mechanism can enforce delivery of the selected final representation to the intended recipient at or above the signed final minimum. If it cannot, disclose the limitation or narrow the demonstration to an asset it can directly deliver. A transfer of an intermediate token is not a guaranteed final trade.

Separate destination swaps require their own validated authorization and limits. Without a verified end-to-end commitment, do not advertise their eventual output as guaranteed before the source operation. Initial V0 need not enable these optional stages.

Track source commitment, settlement identifier, deadlines, destination receipts, and available refund/claim mechanisms. Refund asset, location, fees, and authority must be known before source commitment. Refund support is not a guarantee of immediate refund, original-token return, or protection against protocol failure.

## 13. Gas abstraction boundary

GasProvider reports and reserves sponsorship for a specific validated operation. On Solana, sponsorship must account for transaction/priority fees and necessary account-creation funding. Do not equate zero user SOL with zero underlying cost.

Sponsor funds and keys are separate from user funds. Quotas, instruction/contract allowlists, fee limits, and expiry bind the reservation to the validated payload. If sponsorship is unavailable, do not silently charge beyond accepted user limits. Base gas coverage is separately verified; Solana sponsorship implies no Base capability.

## 14. Execution boundary

ExecutionPlan is immutable. ExecutionRecord is its mutable runtime state, not a seventh central business contract. Consent covers economics; concrete signing covers validated payloads and protocol commitments. An API login/session or account link never substitutes for a spending signature.

Before signing and again before submission where applicable, check quote/risk validity, authorities, funding, sponsorship, network, programs/contracts, instructions, token identities, recipients, approvals, amount bounds, and native expiry. Resolve lookup references, decode payloads, compare them with the plan, and simulate where supported. Simulation is evidence, not a future guarantee. An uninterpretable material operation is rejected.

Persist the attempt and signed payload/reference before any submission. Identify EVM nonces, Solana transaction validity/counters, and settlement identifiers as applicable. Economic changes require a new quote/report/plan and user consent. Native payload changes require fresh concrete authorization and reconciliation of prior attempts first.

## 15. Execution lifecycle

| State | Meaning |
| --- | --- |
| PREPARED | Plan validated and record persisted; no accepted spending authorization yet. |
| AUTHORIZED | Required concrete authorization obtained; no submission attempted yet. |
| SUBMITTED | A transaction/order submission was attempted and journaled; outcome is not necessarily confirmed. |
| SETTLING | Source engagement is verified; final delivery or refund remains pending. |
| COMPLETED | Correlated final receipts prove the correct recipient, representation, finality, and accepted net minimum. |
| UNKNOWN | An attempted operation may have taken effect; available evidence cannot determine its outcome. |
| REFUND_PENDING | A refund path is being followed; completion has not been verified. |
| REFUNDED | Correlated evidence proves the defined refund outcome; the original trade was not filled. |
| PARTIAL | Known effects do not complete the accepted plan; record actual asset locations and remaining constraints. |
| FAILED_BEFORE_SUBMISSION | Failure before any transaction/order submission attempt, with no possible external effect. |

The normal path is PREPARED -> AUTHORIZED -> SUBMITTED -> COMPLETED for a local trade, or through SETTLING for cross-chain execution. Submission uncertainty enters UNKNOWN. Evidence may resolve UNKNOWN to another justified state. Known incomplete effects enter PARTIAL, including a successful source swap followed by a failed next stage. Refund flow uses REFUND_PENDING -> REFUNDED.

UNKNOWN never means FAILED. PARTIAL never means COMPLETED. A timeout is not proof of non-execution. After any potentially submitted effect, FAILED_BEFORE_SUBMISSION is forbidden. Even submitted approvals must be recorded as effects rather than erased by this state.

## 16. Provider capability model

Core ports are ChainDataProvider, SwapProvider, CrossChainProvider, GasProvider, PriceProvider, RiskProvider, and WalletProvider. ExecutionStore is a separate technical persistence port. No Core BridgeProvider or IntentSettlementProvider is required.

CrossChainCapabilities includes transferOnly, finalAssetSettlement, minOutputGuaranteed, refundSupported, and trackingSupported. A boolean alone is not sufficient: every positive capability has a VERIFIED evidence record, adapter/deployment version, networks, representations, account kinds, constraints, verification time, and validity conditions. Other states are UNPROVEN and UNSUPPORTED; neither is executable support.

transferOnly marks a profile restricted to transfers and cannot imply finalAssetSettlement. minOutputGuaranteed identifies the precise asset, recipient, accounting basis, and on-chain/protocol enforcement; an intermediate minimum cannot become a final minimum. Capabilities are checked for the exact route, not globally inferred from the provider name.

Adapters such as Jupiter, Across, Mayan/Wormhole, Kora, or Helius are examples, not selected dependencies or Core concepts. Capability profiles may cover several ports from one provider. Selection follows evidence, not brand claims.

## 17. Security and trust boundaries

| Principal | Authority |
| --- | --- |
| User | Owns signing authority and approves bounded operations. |
| Backend | Proposes, verifies, orchestrates, and persists; cannot spend user funds alone. |
| Sponsor | Controls only sponsor funds under quotas and allowlists. |
| Providers/adapters | Supply untrusted inputs to validate. |
| Risk providers | Supply evidence; no signing authority. |
| Investment Brain | External risk input; no execution authority. |

Existing on-chain protocols may escrow funds after explicitly authorized commitment. Their contract/upgrade/refund authority and insolvency risks are disclosed. A backend may relay an already authorized bounded payload but has no discretionary standing spending permission.

No user private keys, seeds, master recovery keys, biometric data, or secrets enter the public repository. Credential metadata and signed payloads receive restricted retention/access; they are not public logs. Full threat requirements are in SECURITY.md.

## 18. Failure and recovery semantics

- Persist before external effects and reconcile the exact recorded attempt after crashes or lost responses.
- UNKNOWN blocks automatic recreation of a source spend. Query recorded transaction/order references, independent chain evidence, and protocol state.
- Retransmit the same payload only where its native validity/idempotence makes that safe; never rebuild it as a new spend because a request timed out.
- Before considering a newly authorized attempt, prove prior attempts cannot still spend or resolve them first. No claim of universal exactly-once execution across providers is made.
- Expired quotes/reports block new spends; an existing protocol commitment follows its own settlement deadline and verification.
- A provider outage stops new dependent commitments. Preserve references and continue reconciliation when evidence is available.
- PARTIAL records spendable, locked, in-flight, refundable, and uncertain positions separately. Known positions are not erased by an aggregate status.
- Refunds/claims use verified mechanisms and required user authority. The backend cannot invent, redirect, or unilaterally authorize recovery spending.
- No automatic compensating trade, second cross-chain operation, or increased slippage restores a failed route.

## 19. Hackathon versus future architecture

V0 freezes a small system, one funding position, Base/Solana, and deterministic exact-input trades. Future AUTO balance aggregation, EVM passkey accounts, complete 2-of-N recovery, Recovery Kit, native BTC, additional chains, deeper Meme analytics, and proprietary solver/bridge/infrastructure research remain outside implementation scope.

The future list preserves options, not approval to build proprietary infrastructure. Any such work requires a separate architecture/security decision. This freeze does not freeze the long-term architecture.

## 20. Architectural invariants

1. Intent > chain operations; canonical identity > ticker.
2. The Core is provider-independent; adapters do not own business policy.
3. Each account binding has independent proven control; recoveryPolicyRef is optional until verified.
4. One funding account/position per V0 intent.
5. At most one cross-chain operation, no cycles, and no recursive cross-chain routing.
6. Only proven, context-matching capabilities enable routes or guarantees.
7. DEX-local hard rules outrank scores; missing required evidence is INDETERMINATE.
8. Stale risk never authorizes a new spend.
9. User authority and deterministic validation govern every spend; the backend cannot spend alone.
10. Quotes/reports/plans are immutable, hashed, and versioned; execution state is mutable and durable.
11. UNKNOWN prevents blind source recreation; PARTIAL cannot be labeled COMPLETED.
12. No authoritative financial floats; costs and final net minimum are explicit.
13. Investment Brain has no execution authority; Harness is never a dependency.
14. No product implementation or definitive dependency selection is implied by documentary freeze.
