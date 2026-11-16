# 0112. To-dos live in Themis

- Status: Accepted
- Date: 2026-11-16

## Context
1.2 left Home's "due today" without Naresh's own tasks; 1.3 adds them. They could be a module of their own or part of Themis.

## Decision
- To-dos are part of Themis: the `themis_todos` table (migration 22), routes under `/api/themis/todos`, the page `/themis/todos`.
- Each to-do is one-off, with an optional due day and an optional link to one of the user's goals (`ON DELETE SET NULL`). A linked to-do shows on its goal's page. To-dos never count toward goal progress.
- No recurrence in 1.3.
- Home's **Due today** card shows to-dos due today or overdue, ticked off on the card, plus Melete reviews due. "Today" is the server's study day (`Me.study_today`). The card reads from the modules, with no `/api/home` (ADR 0109).

## Consequences
- No new module toggle or drawer entry; users without Themis have no to-dos.
- Recurring chores need retyping until recurrence is added.

## Alternatives considered
- **A to-dos module:** another admin toggle and drawer entry for a simple list that mostly serves goals.
- **Recurrence now:** brings questions about missed and early completions; waits for real use.
