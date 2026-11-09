# 0090. Coverage and mastery: mastery comes from FSRS stability, averaged over the whole syllabus

- Status: Accepted
- Date: 2026-11-07

## Context
Subject cards and the gap view need two numbers: how much of the syllabus the notes reach, and how well it is retained. FSRS already stores each question's stability and difficulty.

## Decision
- **Coverage:** concepts with at least one mapped, enrolled, present note, over all concepts.
- **Question score:** 0 until reviewed, then `min( 1, stability / 21 days )`; the 21 days is a per-user setting.
- **Concept mastery:** the mean of its labelled active questions; covered with no questions yet is 0.
- **Buckets:** uncovered, weak (mastery < 0.7), solid (≥ 0.7).
- **Subject mastery:** the mean over all concepts, uncovered ones counting 0, so it never exceeds coverage.
- Computed on read; nothing stored.

## Consequences
- Mastery grows only with spaced success, not with one good day.
- Changing the setting changes every number at once, which is the point of making it a setting.

## Alternatives considered
- **Retrievability now:** FSRS keeps cards near 0.9 at due by design, so it can't tell new from long-known, and it moves daily.
- **Mastery over covered concepts only:** a tenth of the syllabus at 90% would read as 90%.
