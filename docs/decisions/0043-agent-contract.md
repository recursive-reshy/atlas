# 0043. Agent contract: Pydantic is the source, Zod mirrors it, shared examples catch drift

- Status: Accepted; hand-mirror clause superseded by 0104
- Date: 2026-10-21

## Context
The root `CLAUDE.md` says contracts live in `packages/shared` as Zod schemas and that neither app redefines a shape the other uses. The agent service is Python and can't import Zod, so the request and response of `/v1/link` must exist in two languages.

## Decision
- **The service owns the contract.** Pydantic models in `apps/agent/src/mnemosyne_agent/contract/` are the source of truth.
- **The JSON Schema export is committed** at `apps/agent/schema/link_contract.json` (`uv run python -m mnemosyne_agent.contract.export`). A pytest regenerates it and fails if it differs from the committed file.
- **Zod mirrors it by hand** in `packages/shared/src/agent.ts`, so Express and the web app keep importing from `@mnemosyne/shared`.
- **Golden examples** in `apps/agent/schema/examples/` (`valid/*.json` and `invalid/*.json`, for requests and responses). A pytest checks that Pydantic accepts every valid example and rejects every invalid one; a Vitest test in `packages/shared` does the same for Zod.
- **One commit per contract change:** Pydantic models, export, examples and Zod schemas together. This is the one exception to the root rule, and the root `CLAUDE.md` names it.

## Consequences
- Both sides are written in their own house style; no generated code to exclude from lint.
- No new dependencies.
- Drift is caught by tests, not made impossible: a field added on one side and not covered by an example can slip through until an example uses it. The one-commit rule and the schema diff in review are the guard.

## Alternatives considered
- **Zod as source, Pydantic generated** (`z.toJSONSchema` plus datamodel-code-generator): a new dependency, and generated Python that ignores the house style.
- **Pydantic as source, Zod generated** from the JSON Schema: a new dependency, uncertain Zod 4 support, and generated code in a hand-styled package.
- **Two hand-written sides with no check:** silent drift.
