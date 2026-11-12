# 0104. The agent contract's Zod mirror is generated in-repo

- Status: Accepted
- Date: 2026-11-10
- Supersedes: the "Zod mirrors it by hand" clause of ADR 0043 (the rest of 0043 stands)

## Context
ADR 0043 made Pydantic the source of the agent contract, with a hand-written Zod mirror checked by golden examples. It rejected generation for two reasons: uncertain Zod 4 support, and generated code in a hand-styled package. Writing the mirror by hand is the largest part of the cost of a new agent endpoint (ADR 0103), and drift is only caught when an example happens to cover it.

Checked on 2026-11-10:
- Zod's own `z.fromJSONSchema()` (4.2+) is marked experimental and builds schemas at runtime, so `z.infer` gives no static types.
- `json-schema-to-zod` emits Zod 4, but appears no longer maintained, and its output ignores the house style.

## Decision
- **An in-repo generator** in `packages/shared/scripts/` reads `apps/agent/schema/*.json` and writes `packages/shared/src/agent.generated.ts` in the house style. No new dependency.
- **It supports only what the contract uses:** objects, strings with min/max length and pattern, integers, arrays with max items, enums, nullable fields, `$ref` to `$defs`, and discriminated unions (`oneOf` with a `const` discriminator). Anything else fails generation with a message naming the keyword and path.
- **Known `$ref` names map to existing shared schemas** (e.g. `VaultDir` from `auth.ts`), listed in the generator, so no shape is defined twice.
- **Cross-field rules live in Pydantic as discriminated unions**, so the JSON Schema carries them. The linker response becomes a union on `outcome` (`linked` without `reason`, `failed` with one); the JSON on the wire does not change, and the existing valid and invalid examples prove it.
- **The generated file is committed** with a do-not-edit header. The gate (ADR 0106) regenerates the JSON Schema and the Zod file and fails on any difference.
- `packages/shared/src/agent.ts` re-exports from the generated file, so imports elsewhere don't change.
- **A contract change is still one commit:** Pydantic models, JSON Schema export, generated Zod, examples. The root `CLAUDE.md` exception line says the mirror is generated.

## Consequences
- A new agent endpoint is a Pydantic change plus instructions; no Zod is written by hand.
- The generator is code Naresh owns (~150 lines plus tests) and grows only when the contract uses a new keyword.
- Golden examples stay as the behavioural check on both sides.

## Alternatives considered
- **`z.fromJSONSchema()` at runtime:** experimental and loses static types.
- **`json-schema-to-zod`:** a new dependency, apparently unmaintained, foreign style.
- **Keep the hand mirror, add a strict test comparing `z.toJSONSchema( mirror )` with the Pydantic export:** no generator, but the two dialects differ (nullable, `$defs`, titles) and need fiddly normalising, and Zod is still written by hand.
