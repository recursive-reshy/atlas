# 0095. `GET /api/themis/goals` lists every goal, whatever its status

- Status: Accepted
- Date: 2026-11-08

## Context
TRD §6.3 says achieved and dropped goals leave the Themis home but keep their history, "reachable from an **All goals** list", and §6.4 names that list. The routes in TRD §6.1 give no way to read those goals: the overview returns active goals only, and `GET /themis/goals/:id` needs an id the web no longer has once a goal leaves the home.

## Decision
- Add `GET /api/themis/goals` → `{ goals: [ { goal, area_name } ] }`: every goal of the user, in area order and then position within the area, with the name of its area. `ThemisGoal` is the same record the other routes return.
- No outcome, no time, no history: each row links to `GET /themis/goals/:id`, which has them.
- It sits behind `requireModule( 'themis' )` with the rest of `/api/themis`, and only the caller's goals are returned.
- The web's **All goals** list is a section of the Themis home reached with `?view=all`, so no route is added to the two the TRD names.

## Consequences
- This adds one route and one response contract (`GetThemisGoalsResponse`) to TRD §6.1. No migration, no new table.
- The repository's `listGoals` already returns this order, so the route reads it as is.

## Alternatives considered
- `?include=all` on the overview: every goal would compute its outcome and time on each home load, and the home would filter them out again.
- Leaving the list out: achieved and dropped goals would be reachable only by a direct URL.
