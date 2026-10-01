# Pre-existing Work

Status: DOCUMENTARY INVENTORY — NO REUSED PRODUCT CODE DECLARED

Updated: 2026-10-01. This inventory distinguishes prior ideas/projects from implementation actually incorporated into this public repository. It is not a claim of hackathon eligibility; confirm the event's actual rules before submission.

## Pre-existing concepts and research

The V0 design draws on previously discussed concepts and blockchain/routing/risk research: intent abstraction, canonical asset identity, ports/adapters, deterministic execution, hard risk gates, sponsorship, self-custody, and durable reconciliation.

These are conceptual influences and architecture decisions. No external implementation provenance, authorship, license, audit status, or eligibility is inferred from a conceptual similarity. Any copied text, data, fixtures, or generated artifact must also be disclosed when actually incorporated.

## Pre-existing projects

| Project | Relationship to Universal DEX | Boundary |
| --- | --- | --- |
| Investment Brain | Existing separate project; candidate future source of risk evidence. | RiskProvider interface only. No direct internal imports, signing, or execution authority. Integration has not been implemented or proven. |
| Universal Agent Harness | Existing separate private project. | Never a product, build, runtime, or required development dependency. Its implementation is not included in this public repository. |
| Prior blockchain/routing/risk research | Conceptual input, with exact sources to record if artifacts are incorporated. | Does not establish that code was copied or a provider integration is available. |

No private Harness files, components, or secrets may be copied into this repository. No modification of either separate project is authorized by the V0 documentary freeze.

## Actual reused code and incorporated artifacts

At this freeze, the repository contains the documentary skeleton and these architecture specifications. No product code, copied Investment Brain/Harness component, provider SDK dependency, or other reused implementation has been incorporated by this mission.

This statement is limited to the repository inspected for this freeze; it does not claim that the separate projects contain no relevant code.

Before any actual reuse or hackathon submission, record each incorporated item with:

- Source project/repository or document, exact path/module, and pinned commit/version where applicable.
- Author/owner, license/permission, and any redistribution limitations.
- Creation/provenance date or declared pre-existing status.
- Local destination, extent of copying/reuse, and modifications.
- Purpose in V0, required credentials/services, and public/private boundary.
- Validation/audit assumptions and applicable hackathon disclosure.
- For external services, distinguish API consumption from copied implementation.

Update the actual-reuse section only when incorporation occurs. Merely planning an Investment Brain integration or naming a provider does not count as reused code.
