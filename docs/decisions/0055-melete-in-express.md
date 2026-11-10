# 0055. Melete's Claude calls run in Express, not the agent service

- Status: Accepted; narrowed by 0103
- Date: 2026-10-22

## Context
ADR 0042 introduced the Python vault agent service and expected the tutor to add endpoints to it. With Melete scoped, its two Claude calls are known: write questions from one note, and grade one answer against one reference. Neither searches the vault or uses tools, and grading sits on the review path while Naresh waits, often on his phone.

## Decision
- Question generation and grading are **single structured Claude calls in the Express server**, built like `summarizeSource`: `messages.parse` with a Zod output format from `packages/shared`, an editable prompt plus locked instructions, `stop_reason` checks and a run row with tokens and cost.
- Melete's data, scanning and scheduling also live in Express.
- The agent service is unchanged and stays the home for real tool-use agents. Melete features that need to roam the vault (questions across linked notes, AI-chosen daily topics) would be agent endpoints when they come.
- This narrows ADR 0042's expectation; it doesn't supersede it.

## Consequences
- Grading has one network hop (Express → Anthropic) and no second service that must be up.
- No new contract between Express and Python, so no golden examples or Zod mirror for Melete.
- The Claude client gains two functions and grows a little; Melete's prompts sit beside the summarizer's.

## Alternatives considered
- **Agent-service endpoints:** reusable Python plumbing, but each call would ship the note to Python and the result back for Express to store, with no agent loop to justify it.
- **A Melete-specific service:** a third container for two calls.
