# packages/shared

Cross-app contracts for Atlas: Zod schemas and their inferred types, imported by the server and the web app as `@atlas/shared`. The root `CLAUDE.md` covers the workflow, precedence, git and secrets.

- Follow the TypeScript style in `apps/server/CLAUDE.md`.
- Schemas and their inferred types live here.
- Besides schemas, shared may hold **pure functions that both apps use** (e.g. `noteBasename`, `splitParagraphs`): no I/O, no dependencies beyond Zod (and `yaml` for notes, ADR 0021), no Express or React, each with its own tests here.
- If only one app uses a function, it stays in that app.
- Every schema is exported as a value, and its type with the same name via `z.infer`.
- JSON field names on the wire are snake_case (`job_id`, `created_at`).
- Changing a schema is a contract change: stop and ask unless the TRD or the task covers it.
- Linking (v0.7.0): `linkSuggestions.ts` holds the suggestion schemas, `wikilinks.ts` the pure `findAnchor`, `insertLink`, `isStale` and `hasWikilink` (ADR 0045). `agent.ts` is a hand-kept Zod mirror of the Python agent's contract (ADR 0043): change it in the same commit as the Pydantic models, the committed JSON Schema in `apps/agent/schema/` and the golden examples, which `agent.examples.test.ts` also reads.
