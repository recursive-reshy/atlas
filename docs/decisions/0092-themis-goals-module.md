# 0092. Themis: areas, goals and three outcome types; first in the drawer

- Status: Accepted
- Date: 2026-11-07

## Context
Naresh wants a life-level view of what he is working towards, which ties the other modules together. v1.1 adds it as a module named Themis.

## Decision
- **Structure:** areas (his own list, none built in) → goals (target date optional; active, achieved, dropped). Melete subjects link to goals, many to one; time can also be logged against a goal directly.
- **Outcome types, one per goal, fixed at creation:**
  - learning: coverage and mastery pooled over the linked subjects;
  - metric: a number with a unit and target, updated by hand, kept as history;
  - check-in: a 1–5 rating, weekly or monthly.
- **Periods:** the app time zone and Melete's day start hour; Monday–Sunday weeks, calendar months and quarters. A check-in covers the period just finished, is due from the first day of the next, and missed ones don't pile up.
- **Time:** a goal's time is its own logged time plus its linked subjects' time; an area's is the sum of its goals'. A subject's past time follows its current link.
- **Module:** `themis` is a module like the others (ADR 0067), so the `user_modules` CHECK is rebuilt in a migration. Drawer order Themis, Mnemosyne, Melete, so users with Themis land on it.
- No notifications. No link to Metis yet; metric goals are the place Metis will write later.

## Consequences
- Relinking a subject moves its history to the new goal.
- Areas can only be deleted when empty, so no goal is lost by accident.

## Alternatives considered
- Linking subjects to areas: simpler, but can't show whether time goes towards the goal that matters.
- Built-in areas: his areas aren't everyone's.
- Mnemosyne staying the landing page: the overview would always be a tap away.
