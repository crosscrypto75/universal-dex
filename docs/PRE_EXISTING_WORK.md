# Pre-existing work and hackathon chronology

Updated 2026-10-11. This disclosure distinguishes prior thinking and separate tooling from the Universal DEX implementation. It does not determine eligibility under event rules that have not yet been verified.

## Chronology

| Period | What existed / what began |
|---|---|
| Before the hackathon | Product concept, discussions and research on intent abstraction, chains, wallets, routing, risk, sponsorship and self-custody. Universal Agent Harness existed as a separate orchestration project. |
| October 1, 2026, during the hackathon | The Universal DEX public repository and actual codebase/build began. Root commit `794959b` initializes the repository; `b476547` records the architecture freeze; `69d2f25` records the first implementation spike that day. These are repository-history evidence, not proof of event eligibility. |
| During the hackathon, after initialization | Solana capability work, the sponsored passkey DEVNET swap proof, deterministic product preparation, cross-chain stage work and the read-only demonstration were developed. The October 7 proof/preparation commits describe later work during this build, not an implementation that existed before the competition. |

The declaration that the build began during the hackathon is operator-provided and consistent with the October 1 repository history. Git dates alone cannot establish the event's official start/end or eligibility rules. No claim is made that the Universal DEX implementation predates the event.

## Concepts and separate projects

Prior concepts/research influenced economic intent, canonical asset identity, ports/adapters, deterministic execution, local risk gates, sponsorship and durable reconciliation. Conceptual reuse is disclosed; it is not a claim of copied product implementation or a third-party audit.

**Universal Agent Harness** predates the event. It is a separate development-orchestration project used for independent worker/reviewer roles. Its generic implementation is not submitted here and is not needed to install, test or run the public read-only demo. Some private development/operator tests reference it; those are excluded from the proposed curated publication surface, rather than represented as public-demo requirements.

Other prior risk/investment research is conceptual input only. No private risk-engine implementation is required by the public demo, and no live integration is claimed.

## Incorporated dependencies and artifacts

The current root manifest/lockfile pins `@noble/curves`, `@noble/hashes` and `@solana/web3.js`; these are external dependencies, not newly authored DEX code. Install them through npm; do not vendor private tools, wallet extensions or credentials. License and event-disclosure obligations must be checked before publication.

The historical Solana spike has its own dependency/provenance history. The curated judge surface retains its accepted public proof JSON unchanged, with a short evidence index. Raw private ledgers, signing records and credential material are not required or included.

The earlier architecture-only/dependency-free statements describe the October 1/early product slices, not the current implementation. The [dated implementation record](IMPLEMENTATION_PROVENANCE.md) preserves that context. When incorporating additional code, fixtures or documents, record source/version, owner, license/permission, dates, destination and extent of reuse, validation assumptions and public/private boundary.
