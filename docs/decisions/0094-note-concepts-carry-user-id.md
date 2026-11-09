# 0094. `melete_note_concepts` carries a `user_id`

- Status: Accepted
- Date: 2026-11-07

## Context
TRD §2.1 defines `melete_note_concepts` (note ↔ concept mappings) with only `note_id`, `concept_id` and `source`. The schema guard in `database.schema.test.ts` (ADRs 0061, 0062) requires every data table to have a `NOT NULL user_id` that cascades from `users`, so that no table can be read without an owner check.

## Decision
- `melete_note_concepts` gets `user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE`, written first in the table. The rest of §2.1 is unchanged.
- The schema guard is not changed.
- Repositories filter this table by `user_id` like every other.

## Consequences
- This changes TRD §2.1's DDL for one table. Migration 15 is not locked yet, so it is edited in place.
- Each mapping row repeats the owner it already has through its note and concept.

## Alternatives considered
- Exempting the table in the guard as a join table owned through its parents: keeps the DDL as written, but the guard then has an exception that every future join table can point to.
