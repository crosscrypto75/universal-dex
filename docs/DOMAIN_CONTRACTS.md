# Domain Contracts V0

Status: FROZEN V0 CONTRACT SPECIFICATION — NO RUNTIME IMPLEMENTATION

Freeze date: 2026-10-01. This document defines six central business contract groups: UniversalAccount, CanonicalAsset/AssetRepresentation, UserIntent, RiskReport, RouteQuote, and ExecutionPlan. ExecutionRecord is exclusively a mutable runtime state record. Supporting value objects do not add product modules.

See [architecture](ARCHITECTURE.md) for boundaries, [security](SECURITY.md) for authority, and [scope](HACKATHON_SCOPE.md) for proof requirements.

## Common conventions

- Stable opaque identifiers are independent of provider identifiers and symbols.
- Every object has schemaVersion. Mutable entities have revision and updatedAt; immutable snapshots have contentHash.
- Authoritative amounts are nonnegative base-10 integer strings in atomic units, with an exact denomination/representation. Zero is allowed only where meaningful; trade input must be positive. No financial float.
- UserIntent amounts use the canonical asset's explicitly defined unit scale. Routing converts exactly to source representation atomic units; nonrepresentable input is rejected, not silently rounded. Representation amounts always use that representation's decimals.
- Amount limits specify gross versus net accounting. Rates use integer basis points or numerator/denominator; prices use fixed-point/rational values with denomination, scale, and timestamp. Rounding direction is explicit: conservative bounds round against accepting excess spend or insufficient output.
- createdAt, observedAt, validUntil, updatedAt, and lastReconciledAt are explicit UTC RFC 3339 timestamps as applicable. Protocol block heights/slots/deadlines remain separate typed fields.
- NetworkRef identifies a specific network/genesis environment, not merely “EVM” or “Solana.” Solana and Base mainnet/test environments cannot be confused.
- EvidenceRef carries source, subject, observedAt, network/block or slot and finality where applicable, validity/coverage, and an immutable evidence reference/hash.
- HashRef contains algorithm, canonicalizationVersion, domainTag, schemaVersion, and digest. V0 uses SHA-256 with lowercase hexadecimal digest over UTF-8 JSON canonicalized by [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785), under canonicalizationVersion jcs-v1. This specifies an encoding, not a library dependency. Cross-domain hashes cannot be substituted.
- Hash input is a canonical JSON envelope with domainTag, schemaVersion, canonicalizationVersion, and payload. Contract domain tags are universal-dex/<exact-contract-name>/v1; the economic route projection uses universal-dex/EconomicRoute/v1. Omit absent optional fields; null is permitted only where explicitly specified. Reject duplicate keys, invalid Unicode, unknown schema fields, and numbers outside validated safe-integer ranges. Amounts and large integers remain strings. Preserve semantically ordered arrays; unordered evidence references are sorted by stable ID before snapshot creation.
- Object content hashes exclude their own digest. Reference immutable revisions/hashes rather than mutable “latest” data.
- The economic route hash covers the RouteQuote payload except quoteId, createdAt, contentHash, and routeHash. It includes accounts/recipients, representations, amounts/bounds, fees, stages, guarantees, deadlines, and pinned capability evidence. RiskReport and ExecutionPlan references are not RouteQuote fields, avoiding circular hashing. The quote contentHash additionally commits its ID, creation time, and computed routeHash.
- Quotes, final risk reports, and plans are immutable snapshots. Changes create new IDs/snapshots; old snapshots remain available for reconciliation.
- Examples below are illustrative field notation, not executable schemas, real addresses, keys, provider proofs, or current market quotes. Numbers demonstrate accounting only; aliases resolve through a hypothetical verified registry.

## 1. UniversalAccount

### Responsibility

Group independently controlled user accounts into a logical product identity. It is not a universal key, address, custody vault, or common authority across networks.

### Fields

| Field | Requirement |
| --- | --- |
| accountId, schemaVersion, revision | Stable identity and explicit revisions. |
| createdAt, updatedAt | Entity lifecycle timestamps. |
| bindings[] | Each has bindingId, networkRef, fundsAddress, accountKind, and optional distinct metadataAddress. |
| bindings[].controlProofRef | Fresh proof binding network, address, account identity, purpose, and nonce. |
| bindings[].authorizationPolicyRef | Verified spend/admin authority and signing mechanism. |
| bindings[].capabilities | Capability status/evidence for receive, authorizeSpend, composeSwap, and sponsorship compatibility. |
| bindings[].authoritySnapshot | Observed authorities, limits, deployment/upgrade assumptions, observedAt, evidenceRef. |
| bindings[].recoveryPolicyRef | OPTIONAL; absent until a real recovery mechanism is verified for this binding. |

### Invariants

Every enabled binding has independent proven control. Solana authorization implies no Base authority. Off-chain linking and API authentication never grant spending power. Recovery cannot be advertised from an unverified reference. Changes in authority invalidate affected prepared authorizations and require new verification.

### Exclusions

Private keys, seeds, master recovery keys, biometric data, backend session secrets, authoritative cached balances, and a supposed universal signing credential.

### Relations and versioning

UserIntent references accountId; quotes/plans pin relevant binding revisions and authority evidence. The account may evolve without rewriting historical plans. Revision changes alone do not invalidate unrelated bindings; material authority changes do.

### Example

```text
accountId: ua-1; schemaVersion: 1; revision: 1
createdAt: 2026-10-01T10:00:00Z; updatedAt: 2026-10-01T10:00:00Z
bindings:
  sol-1: Solana network, passkey smart account, fundsAddress <vault>,
         controlProofRef proof-sol-1, authorizationPolicyRef auth-sol-1
  base-1: Base network, existing wallet, fundsAddress <user-address>,
          controlProofRef proof-base-1, authorizationPolicyRef auth-base-1
recoveryPolicyRef: absent on both bindings
```

## 2. CanonicalAsset

### Responsibility

Identify the economic asset independently of chain, provider, and ticker.

### Fields

assetId, schemaVersion, revision, name, displaySymbol, category, unitDecimals, originIdentity, provenanceEvidenceRefs, marketClassification, registryVersion, createdAt, updatedAt. originIdentity distinguishes native origins, issuer-defined assets, and token-specific identities; displaySymbol is not unique.

### Invariants

Identity is stable and evidence-backed. Canonical grouping does not prove identical custody, backing, redemption, or risk. A derivative is a separate identity unless an explicitly reviewed relationship says otherwise. Meme classification cannot be removed by switching user interface.

### Exclusions

Network holdings, liquidity quotes, transaction payloads, market-price guarantees, provider DTOs, and perpetual risk ratings.

### Relations and versioning

AssetRepresentation references assetId. UserIntent specifies canonical funding/target IDs. Identity changes create a new assetId; metadata/classification updates create a new revision. Snapshots pin registry versions.

### Example

```text
assetId: asset:SOL; schemaVersion: 1; revision: 1
displaySymbol: SOL; category: NATIVE_ASSET; unitDecimals: 9
originIdentity: Solana native asset
marketClassification: STANDARD_SPOT; registryVersion: registry-v1
createdAt: 2026-10-01T10:00:00Z; updatedAt: 2026-10-01T10:00:00Z
```

## 3. AssetRepresentation

### Responsibility

Identify the concrete executable/holdable instrument and its relationship to the canonical asset.

### Fields

representationId, assetId, schemaVersion, revision, networkRef, tokenLocator (native identifier or exact mint/contract), tokenStandard, decimals, representationKind, optional issuer/custodian, backing/redemption description and evidence, riskAttributes, eligibility, registryVersion, createdAt, updatedAt.

eligibility distinguishes UNPROVEN, APPROVED, and DISABLED. Native representations explicitly state that no external backing mechanism applies; absent evidence is not treated as native backing.

### Invariants

The tuple of network and token locator is unambiguous. Decimals and token program/standard are verified. APPROVED requires the registry's evidence and local policy, not an external token list. Bridged, wrapped, and reserve-issued instruments preserve their specific risks. Unknown assets are unavailable for V0 execution.

### Exclusions

Ticker-based automatic matching, unverified equivalence, source/destination quotes, and user signing authority.

### Relations and versioning

Quotes, reports, plans, and runtime positions reference exact representation revisions. A new token locator or materially different backing identity creates a new representationId. Eligibility/evidence updates revise the registry and invalidate affected new-spend decisions.

### Example

```text
representationId: rep:SOL-solana-native; assetId: asset:SOL
schemaVersion: 1; revision: 1; networkRef: solana-mainnet
tokenLocator: native:SOL; decimals: 9; representationKind: NATIVE
eligibility: APPROVED in illustrative registry-v1
createdAt: 2026-10-01T10:00:00Z; updatedAt: 2026-10-01T10:00:00Z
```

BTC/ETH representation addresses, backing choices, and liquidity remain unselected and unproven in this repository.

## 4. UserIntent

### Responsibility

Express the user's desired economic trade without selecting technical operations.

### Fields

intentId, schemaVersion, revision, accountId, clientRequestId, mode (EXACT_IN only), fundingAssetId, inputAmountAtomic, inputUnitDecimals, targetAssetId, recipientAccountId, fundingSelection (AUTO), constraints, createdAt, validUntil, contentHash.

constraints include maxSlippageBps, explicit fee-budget denominations/bounds, and maximum acceptable duration where supported. Fee limits cannot be defined solely in an unbounded floating reference-currency estimate.

### Invariants

Positive exact input, valid unit scale, controlled recipient account, and explicit funding defaults at consent. AUTO resolves exactly one account/position. An intent is not an authorization or a provider settlement order. Policy is derived locally from registry/route facts, never weakened by a user-supplied market label.

### Exclusions

Required chain, bridge, DEX, pool, representation, transaction nonce, encoded payload, and aggregated multi-wallet funding.

### Relations and versioning

One intent revision may generate several alternative quotes but only one active source-spend execution is permitted for that accepted intent revision. A revised target, amount, recipient, or economic constraint requires a new intent snapshot and consent. clientRequestId supports request deduplication; runtime executionId/idempotencyKey remain distinct.

### Example

```text
intentId: i-1; schemaVersion: 1; revision: 1; accountId: ua-1
clientRequestId: request-1; mode: EXACT_IN; fundingSelection: AUTO
fundingAssetId: asset:USDC; inputAmountAtomic: "10000000"; inputUnitDecimals: 6
targetAssetId: asset:SOL; recipientAccountId: ua-1
constraints: maxSlippageBps 100; separately bounded fee budget
createdAt: 2026-10-01T10:00:00Z; validUntil: 2026-10-01T10:05:00Z
contentHash: <canonical versioned intent hash>
```

## 5. RiskReport

### Responsibility

Record the final DEX-local policy decision on one exact economic route and evidence snapshot.

### Fields

reportId, schemaVersion, intentHash, routeHash, evaluatedRepresentationRefs, evaluatedAmount, policyId, policyVersion, decision (ALLOWED / REJECTED / INDETERMINATE), hardFailures[], warnings[], requiredConditions[], checks[], coverage, externalAssessments[], evidenceRefs[], createdAt, validUntil, contentHash.

Each check records its local rule ID, mandatory/optional status, outcome (PASS / FAIL / UNKNOWN), observedAt, validity, and evidenceRefs. External assessments may contain a score, warnings, or hard-failure candidates with producer/version provenance; they are not the decision field.

### Invariants

Only local DEX policy produces the final decision. Any local hard-rule violation yields REJECTED, even when evidence is also missing or an external score is high. Otherwise missing mandatory evidence yields INDETERMINATE. ALLOWED requires all mandatory gates and conditions; conditions such as risk acknowledgement do not override a hard rule.

An expired report cannot authorize a new spend. A fresh report on another amount, route, recipient, representation, or policy is not reusable. Validity cannot exceed the shortest validity of its required evidence. Evidence-source failure never defaults to ALLOWED.

### Exclusions

Spending/signing authority, transaction creation, an external provider's unilateral authorization, and guarantees of profitability or permanent safety.

### Relations and versioning

Pins intent/economic route hashes without referencing a later plan hash. ExecutionPlan pins this report. Changed policy or relevant evidence creates a new report; an existing report is never edited. Independent policyVersion and schemaVersion are required.

### Example

```text
reportId: rr-1; schemaVersion: 1
intentHash: <i-1 hash>; routeHash: <rq-1 economic route hash>
policyId: STANDARD_SPOT; policyVersion: spot-v0
decision: ALLOWED; hardFailures: []; coverage: mandatory checks complete
externalAssessments: []; requiredConditions: []
createdAt: 2026-10-01T10:00:03Z; validUntil: 2026-10-01T10:00:25Z
contentHash: <canonical versioned local risk hash>
```

## 6. RouteQuote

### Responsibility

Present a dated economic route, its expected result, enforceable bounds, cost accounting, and failure outcomes.

### Fields

quoteId, schemaVersion, intentHash, routeHash, contentHash, registryVersion, fundingPosition, sourceBindingRef, destinationBindingRef/recipient, inputRepresentationRef, outputRepresentationRef, sourceDebitLimit, swapInputAmount, expectedFinalNetOutput, optional minFinalNetOutput, finalMinimumStatus, fees[], referenceCostEstimate, stages[], capabilityProfileRefs, refundTerms, createdAt, quoteValidUntil, optional settlementDeadline, estimatedDuration.

- fundingPosition identifies ONE account binding and ONE concrete asset position, not combined balances.
- stages contain at most one SOURCE_SWAP, one CROSS_CHAIN, and one DESTINATION_SWAP, in that order. Local routes may use a single LOCAL_SWAP.
- finalMinimumStatus is ENFORCED or NOT_GUARANTEED. minFinalNetOutput is required only for ENFORCED and identifies the exact final representation/recipient and enforcement evidence.
- fees contain feeId, type, denomination, amount/bound, payer, and inclusion (DEDUCTED_FROM_INPUT / DEDUCTED_FROM_OUTPUT / SEPARATE / SPONSORED). Scenario is SUCCESS or REFUND/FAILURE. No double counting.
- sourceDebitLimit covers input plus any separately paid source fees in the same denomination; other denomination limits are explicit.
- referenceCostEstimate is indicative, with currency, fixed-point/rational conversion, observedAt, coverage, and uncertainty.
- refundTerms contain support status, refunded representation/network/recipient, expected deductions/bounds, deadline, initiator authority, and evidence. Unavailable refunds are explicit, not invented.

### Invariants

Route shape is bounded and acyclic. No hidden cross-chain stage exists inside a provider route. All executable capability claims match verified profiles. Expected output is never mislabeled as a guaranteed minimum. Initial executable trade routes require ENFORCED final minimum; NOT_GUARANTEED proposals may explain a limitation but cannot authorize the claimed guaranteed trade.

When narrowing the demonstration, the directly delivered representation becomes the actual target, not an intermediate token mislabeled as the original target. Consent covers backing and refund risks. Fee bounds, expiry, and real source gas requirements are explicit.

### Exclusions

Spending signatures, mutable status, future quotes asserted as current guarantees, opaque provider economics, and risk authorization.

### Relations and versioning

Derived from one intent revision; evaluated by RiskReport; accepted into ExecutionPlan. Any economic change creates a new quote. Native quote validity and an already-open settlement deadline are different fields. Economic hash excludes future risk/plan references.

### Example

```text
quoteId: rq-1; schemaVersion: 1; intentHash: <i-1 hash>
fundingPosition: base-1 / rep:USDC-base / position-1
inputRepresentationRef: rep:USDC-base; outputRepresentationRef: rep:SOL-solana-native
swapInputAmount: "10000000" USDC atomic; sourceDebitLimit: "10000000" USDC atomic
expectedFinalNetOutput: "60000000" SOL atomic
minFinalNetOutput: "59400000" SOL atomic; finalMinimumStatus: ENFORCED
stages: [CROSS_CHAIN]; capabilityProfileRefs: [<verified exact-route profile>]
fees: input-deducted fees already included in output; source gas separately bounded
createdAt: 2026-10-01T10:00:02Z; quoteValidUntil: 2026-10-01T10:00:30Z
settlementDeadline: 2026-10-01T10:10:00Z
refundTerms: <verified source refund terms>
routeHash/contentHash: <separate canonical versioned hashes>
```

## 7. ExecutionPlan

### Responsibility

Define deterministic, bounded operations for a user-accepted quote and DEX-local risk decision.

### Fields

planId, schemaVersion, intentHash, quoteHash, routeHash, riskReportId/riskReportHash, registryVersion, policyVersion, sourceBindingRef, destinationBindingRef, fundingPosition, acceptedEconomics, steps[], authorizationRequirements, preparedPayloadRefs, capabilityProfileRefs, sponsorshipReservationRef (optional), submissionValidUntil, reconciliationPolicy, refundPolicy, createdAt, contentHash.

Each step has stepId, operation kind/network, adapter capability reference, prerequisites, decoded semantic constraints, dependencies, postconditions, and required authority. Payload references identify exact bytes/message hashes, native nonce/validity where relevant, and verification evidence. Future materialized steps cannot claim a preverified payload; they require a new immutable plan revision/snapshot and concrete authorization before a new spend.

### Invariants

An executable plan has a fresh ALLOWED local report, valid quote, verified binding/capabilities, and enforceable accepted final minimum. Required conditions are satisfied before authorization/submission. Concrete signatures or smart-account commitments bind recipients, amounts, expiry, replay protection, and operations.

Source swap count <= 1, cross-chain operation count <= 1, destination swap count <= 1. No new spend after submissionValidUntil or risk expiry. Do not change economics, recipients, representations, approvals, or fee limits silently. Do not delegate general spending discretion to the backend.

### Exclusions

User private keys, mutable execution state, provider authority to bypass risk, AI-generated transactions, and automatic compensating trades.

### Relations and versioning

Pins immutable quote/report hashes and account/registry evidence. Runtime ExecutionRecord refers to the plan. New payloads require fresh concrete authorization; changed economics also require fresh economic consent and a new quote/report/plan. A replacement plan must reconcile all earlier possible source effects before opening a new source attempt.

### Example

```text
planId: ep-1; schemaVersion: 1
intentHash: <i-1 hash>; quoteHash: <rq-1 hash>; routeHash: <economic route hash>
riskReportId: rr-1; riskReportHash: <rr-1 hash>
sourceBindingRef: base-1; destinationBindingRef: sol-1
steps: [one CROSS_CHAIN commitment with bounded input and final minimum]
authorizationRequirements: [user Base signing]
preparedPayloadRefs: [<decoded, verified source message hash>]
createdAt: 2026-10-01T10:00:04Z; submissionValidUntil: 2026-10-01T10:00:25Z
contentHash: <canonical versioned plan hash>
```

## 8. ExecutionRecord — runtime state only

### Responsibility

Persist exclusively mutable execution progress and evidence. It does not redefine economics, choose policy, or create authorization.

### Fields

| Field | Meaning |
| --- | --- |
| executionId, planId, planHash, schemaVersion | Stable execution and immutable plan binding. |
| idempotencyKey, accountId, intentHash | Deduplication scoped to account and accepted intent; reject conflicting payload reuse. |
| revision | Optimistic concurrency/compare-and-set revision. |
| state | One of the states below. |
| currentAssetLocation | Array of actual known or uncertain positions: representation, network, account/escrow/order reference, amount or bounded/unknown quantity, location status, observedAt, evidenceRefs. |
| attempts[] | attemptId, stepId, action kind, payloadHash, authorizationRef, native nonce/expiry, preparedAt, submissionAttemptedAt, outcome, and evidence. |
| transactionReferences[] | Network, hash/signature, step/attempt, submission time, observed status, finality. |
| settlementReferences[] | Adapter/deployment, order ID, source reference, protocol deadline and observed status. |
| observations[] | Append-only correlated evidence, including provider and chain provenance. |
| refundState | NONE / UNAVAILABLE / ELIGIBLE / REQUESTED / PENDING / VERIFIED, terms, references, and observed amounts/asset/recipient. |
| failureState | Optional stage, classified reason, timestamp, evidence, retryability, and uncertainty; no assumed no-spend result. |
| createdAt, updatedAt | Explicit creation and change timestamps. |
| lastReconciledAt | Explicit timestamp, initially null until reconciliation occurs. |

### State meanings and transitions

PREPARED, AUTHORIZED, SUBMITTED, SETTLING, COMPLETED, UNKNOWN, REFUND_PENDING, REFUNDED, PARTIAL, and FAILED_BEFORE_SUBMISSION are the complete V0 state set.

- PREPARED -> AUTHORIZED requires valid concrete authorization.
- AUTHORIZED -> SUBMITTED journals an attempted external submission, not confirmation.
- SUBMITTED -> SETTLING requires source commitment evidence for cross-chain flow.
- SUBMITTED/SETTLING -> COMPLETED requires correlated final receipts meeting recipient, representation, finality, and accepted net minimum.
- Attempted operations with unresolved outcome enter UNKNOWN. UNKNOWN can only leave on reconciled evidence; it never means FAILED.
- Known incomplete effects enter PARTIAL; PARTIAL never means COMPLETED. A currently progressing known settlement normally remains SETTLING rather than being called a failure.
- Refund flow enters REFUND_PENDING, then REFUNDED only on refund receipt verification. REFUNDED does not mean original input or full amount returned.
- PREPARED/AUTHORIZED may enter FAILED_BEFORE_SUBMISSION only when no transaction/order submission attempt occurred.
- PARTIAL may progress to settlement/refund/completion only through an evidenced, authorized continuation. UNKNOWN may supersede an uncertain continuation without deleting known positions.
- COMPLETED, REFUNDED, and FAILED_BEFORE_SUBMISSION are terminal at the accepted finality level. Exceptional contradictory evidence/reorgs reopen reconciliation as UNKNOWN with an audit observation; they never justify blind replay.

### Invariants

Persist signed payload/references, attempt identity, and submission intent before external effects. A crash between send and response is recoverable as UNKNOWN. One unresolved source spend is allowed per accepted intent; reservations also prevent overspending the same source position across intents.

IdempotencyKey is unique within its defined account/operation scope. Repeating a request returns the existing record; changing the plan under the same key is a conflict. Execution records cannot be reset to hide prior attempts.

UNKNOWN blocks automatic recreation of the source spend. Retransmission of the same payload requires verified native replay/expiry safety. A fresh source attempt requires proof that previous attempts cannot still execute plus new valid authorization. API idempotency alone does not guarantee on-chain exactly-once behavior.

Positions may be split between fees, escrow, refund, and received assets, even though funding uses one position. Unknown amounts/locations are marked unknown, not zero. Reconciliation can continue after quote expiry; expiry cannot itself prove non-execution.

### Exclusions

New economic intent, changed plan limits, authoritative risk decisions, private keys, and permission to bypass user authorization.

### Relations and versioning

References the exact immutable plan and its receipts. State changes increment revision with an auditable observation. Observations/attempts are preserved; schema migration must preserve references, deduplication, and uncertainty. Replacement plans cannot discard this history.

### Example

```text
executionId: ex-1; planId: ep-1; planHash: <ep-1 hash>; schemaVersion: 1
accountId: ua-1; intentHash: <i-1 hash>; idempotencyKey: ua-1/i-1/execute
revision: 3; state: UNKNOWN
currentAssetLocation:
  base-1 / rep:USDC-base: disposition UNKNOWN after possible submission
attempts: [attempt-1, persisted payload hash, submissionAttemptedAt]
transactionReferences: [<recorded Base transaction hash>]
settlementReferences: []; observations: [lost-response observation]
refundState: NONE; failureState: submission transport timeout, outcome uncertain
createdAt: 2026-10-01T10:00:04Z; updatedAt: 2026-10-01T10:00:08Z
lastReconciledAt: null
next permitted action: reconcile recorded attempt; do not recreate source spend
```

## Supporting capability and evidence boundary

CrossChainProvider normalizes one cross-chain operation. Its profile carries providerRef, adapterVersion, deploymentRef, networks, representations, account kinds, operation constraints, observedAt/validUntil, and evidenceRefs.

The five conceptual flags are transferOnly, finalAssetSettlement, minOutputGuaranteed, refundSupported, and trackingSupported. Each claim has VERIFIED / UNPROVEN / UNSUPPORTED status; only VERIFIED can enable execution. transferOnly is mutually exclusive with finalAssetSettlement within a profile. minOutputGuaranteed specifies whether the enforced minimum refers to transferred or final assets and exact net accounting. Router validation requires final enforcement for the claimed final trade.

RiskProvider supplies normalized observations, evidence, warnings, hard-failure candidates, scores, and external assessments. It does not produce the authoritative final decision. The DEX-local policy produces RiskReport. Supporting evidence can be referenced without importing external internal components or DTOs.

No capability in these examples has been proven by this documentary freeze.
