# 0034. Caret sync: match paragraphs by whole second, and ignore the front-matter

- Status: Superseded by 0074
- Date: 2026-10-18

## Context
Since 0.3.0 the release notes said timestamp caret sync "doesn't work in a real browser", although the jsdom tests passed. ADR 0033 added browser-mode tests to reproduce it first.

The reproduction (task 5.2) ran the real review screen, with the real MDXEditor and `TranscriptPane`, in Chromium and WebKit, and the same flow against the real app on a seeded review job. **The reported failure did not reproduce:** clicking a timestamp line, arrowing onto it in rich text mode and arrowing onto it in source mode all scroll the transcript and mark the paragraph, in both browsers. It most likely went away in 0.3.1, when the pane became a MUI `Paper` with `position: relative`, which made `offsetTop` relative to the pane (the old stylesheet had no such rule). The jsdom tests never saw it either way, because `ReviewScreen.test.tsx` replaces the editor with a `<textarea>`.

The same reproduction found two real defects:
1. **The wrong paragraph.** whisper-server segment starts are fractional (`800.4`) and a paragraph starts at its first segment, but the note cites whole seconds (`[13:20]` is `t=800`). `TranscriptPane` picked the last paragraph with `start <= focusSecond`, so a citation of a paragraph's first segment marked and scrolled to the previous paragraph.
2. **The front-matter counts as a timestamp.** In source mode the cursor on `duration: "20:00"` parsed as 20 minutes and scrolled the transcript to its end.

## Decision
- `TranscriptPane` compares `Math.floor( start )` with the cited second, the same rule as the paragraph element ids.
- `sourceLineText` returns nothing while the cursor is in the front-matter (from an opening `---` on the first rendered line to the closing `---`). Rich text mode needs nothing, since the properties are not part of its editor.
- The browser tests for both stay as permanent guards, with passing regression tests for click and arrow keys in both modes.

## Consequences
- A citation lands on the paragraph it names; the front-matter no longer moves the transcript.
- The front-matter check reads the rendered lines. CodeMirror only renders lines near the viewport; the front-matter is at the top, so a cursor below it is always judged on rendered lines that either include the closing `---` or don't start at the top.
- If the 0.3.0 failure appears again in Chrome or Safari, the browser test harness is the place to reproduce it. The real check in task 10.3 covers it.

## Alternatives considered
- **Round paragraph starts to whole seconds when grouping:** touches the shared `groupParagraphs`, the transcript Markdown and the ids for no extra benefit.
- **Skip lines that look like `key: value`:** guesses at the front-matter instead of finding its edges.
