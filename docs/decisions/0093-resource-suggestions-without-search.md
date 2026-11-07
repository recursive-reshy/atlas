# 0093. Resource suggestions come from Claude's own knowledge, with search queries instead of links

- Status: Accepted
- Date: 2026-11-07

## Context
The gap view offers help for an uncovered concept. Anthropic's web search tool was considered and turned down: Naresh will do the searching himself.

## Decision
- On demand, Claude suggests 3–5 resources: title, who it's by, kind (book, docs, course, video, article, talk, other), why it fits, and a search query.
- **No URLs:** the prompt forbids them and the server strips any `http` text. The web turns each query into a YouTube search (videos, talks) or a web search.
- Not stored. Sonnet by default, as a per-user setting; recorded as a Melete run.

## Consequences
- No invented or dead links, no new tool, key or per-search fee.
- Suggestions can be dated; the search step is his.

## Alternatives considered
- Anthropic web search tool with `max_uses`: real links, but a per-search fee and more moving parts than he wants.
- A search API (Brave, Tavily): a new key and client.
- Claude generating URLs from memory: some would be wrong.
