# 0089. Melete's concept layer: Claude-drafted syllabus, mapping inside question generation, one concept per question

- Status: Accepted
- Date: 2026-11-07

## Context
Melete (ADRs 0055, 0058) knows which questions are due but not what a subject should cover, so it can't show progress through a subject or what's missing. v1.1 adds a syllabus per subject and maps notes onto it. There were no subjects on the VM when this was decided, so nothing needs a backfill.

## Decision
- **Naming:** "subject" stays the word in the UI and in code. No rename to "course".
- **Shape:** a syllabus is sections of concepts, two levels only. Claude drafts it from the subject's name, a target level (awareness, working, proficient, expert), an optional intent and the notes already in the folder. The user edits and approves it. Size guidance per level is in the prompt; the server caps a syllabus at 80 concepts.
- **Mapping in Generate:** for an approved syllabus, the existing per-note generation call also returns the note's concepts and labels each question with one of them, or flags the note as off-syllabus with a suggested concept name. At steady state a new note still costs one Claude call.
- **Map call:** syllabus-driven remaps use a separate call that rewrites mappings and question labels but never creates or drops questions, so FSRS state survives.
- **Remap triggers:** content change (via Generate); concept added (off-syllabus notes only); concept removed (notes left with none); approval or redraft (all notes); a Remap all button. Renames trigger nothing.
- **Hand mappings stick:** a hand-mapped note is skipped by automatic remaps until its content changes.
- All calls run in Express (as ADR 0055), with locked instructions, editable guidance and a per-user model setting: Draft syllabus on Sonnet, Generate and Map on Haiku.
- The syllabus lives in the database only; Melete still never writes to the vault.

## Consequences
- The Generate prompt gets longer for approved subjects.
- Concept refs are short (`c1`…) in prompts and mapped to ids on the server, so Claude can't invent ids.
- Removing a concept nulls its question labels until the next Map.

## Alternatives considered
- Syllabus built up only from notes: no way to show what's missing.
- Hand-written syllabus only: more work than he wants.
- A separate mapping call per note: doubles calls for every new note.
- Concepts through the note only (no per-question label): a note mapped to several concepts props all of them up.
- Running these calls in the agent service: none needs vault tools.
