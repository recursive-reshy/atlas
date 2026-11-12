# 0103. Where a Claude call lives: Express or the agent service

- Status: Accepted
- Date: 2026-11-10

## Context
ADR 0042 introduced the Python agent service as the home for agents, and ADR 0055 kept Melete's calls in Express because they neither search the vault nor use tools. Every Claude call added since went into Express. Most belong there. Syllabus drafting (1.1, ADR 0089) does not: Express decides what the model sees by passing the first 300 characters of up to 60 notes, so a larger subject is silently cut and a note's point past its opening is invisible. The rule behind 0042 and 0055 was never written down in general terms, so nothing stopped the shortcut, and the idea validator and Metis advisor would face the same pull.

## Decision
- **The rule.** If Express can assemble the whole input up front and the model answers in one structured reply, the call is a **single Claude call in Express**. If the model must decide what to read (list, search, open, follow) before it can answer, it is an **agent in the agent service**.
- **The test is the input, not the importance of the feature.** Ask: can Express build the prompt without truncating or guessing what matters? A cap such as "first N characters of M notes" means no, and the call is an agent.
- **Supporting reasons** can move a borderline call into the service, but never move a real agent out of it:
  - **Read-only isolation:** the process cannot write to the vault or the database.
  - **Python-shaped data work**, such as ledgers and time series for Metis.
- **Express stays the orchestrator** (unchanged from 0042). It owns run rows, usage, post-checks and every write; an agent reads and returns.

Where each call sits from 1.2:

| Call | Where | Why |
| --- | --- | --- |
| Summarize | Express | One source in, one reply out |
| Melete questions, grading, map, suggest resources | Express | One note or one concept in, one reply out |
| Wikilink suggestions | Agent service | Must search the vault |
| Melete syllabus draft | Agent service (moved in 1.2, ADR 0105) | Must decide which notes to read |

**A new agent endpoint needs:**
1. locked instructions served at `/v1/<name>/instructions`;
2. a tool list from the shared vault toolset;
3. a Pydantic request, response and submit model;
4. the JSON Schema export and the generated Zod mirror (ADR 0104);
5. golden examples, valid and invalid;
6. its own limits in agent config;
7. on the Express side, a run row with turns and tool calls and a usage category.

**Expected future agents:** the business-idea validator, the Metis advisor, and Melete's goal-driven learning (curating a course, finding gaps across notes).

## Consequences
- Narrows ADR 0055: syllabus drafting moves; Melete's other calls stay in Express.
- Extends ADR 0042 with an explicit rule.
- A call that grows a cap on its input is a signal to move it, recorded in review.

## Alternatives considered
- **Every Claude call in the agent service:** a network hop and contract for single calls that gain nothing from it.
- **Every Claude call in Express, tool loops included:** gives up the read-only isolation and Naresh's choice of Python for agents (0042).
- **No written rule:** what led to the syllabus shortcut.
