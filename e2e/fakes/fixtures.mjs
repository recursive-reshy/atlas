const ORIGIN = 'http://fakes:4000'

const paragraph = ( text ) => `<p>${ text }</p>`

const articleHtml = ( title, paragraphs ) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${ title }</title></head>
<body>
<header><nav><a href="/">Home</a></nav></header>
<article>
<h1>${ title }</h1>
${ paragraphs.map( paragraph ).join( '\n' ) }
</article>
<footer>Fixture page for the Atlas end-to-end test.</footer>
</body>
</html>
`

const FILLER = [
  'Learning sticks when it is revisited at growing intervals instead of being crammed in one sitting,',
  'and the effort of recalling something does more for memory than reading it a second time.',
  'People who plan short sessions across several weeks keep far more than people who study the same hours in one night.',
  'The gap between sessions is the point: a little forgetting makes the next recall harder, and that difficulty is what strengthens the memory.',
].join( ' ' )

const paragraphsFor = ( opening ) => [
  opening,
  FILLER,
  `${ FILLER } Teachers have known this for a long time, and small experiments keep confirming it.`,
  `${ FILLER } A reader who tests themselves after each chapter finds the next chapter easier to follow.`,
  `${ FILLER } Notes work the same way: a note that is linked, reread and reworded stays useful for years.`,
]

export const ARTICLE = articleHtml(
  'How Memory Really Works',
  paragraphsFor( 'Spaced repetition and retrieval practice are the two habits that most reliably improve long-term recall.' ),
)

export const ARTICLE_2 = articleHtml(
  'Notes That Last',
  paragraphsFor( 'A good note is written for the person who will read it in a year, not for the person writing it today.' ),
)

const item = ( title, path, day ) => `    <item>
      <title>${ title }</title>
      <link>${ ORIGIN }${ path }</link>
      <guid>${ ORIGIN }${ path }</guid>
      <pubDate>${ day } Oct 2026 09:00:00 GMT</pubDate>
      <description>${ title }, a fixture feed item.</description>
    </item>`

export const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Fixture Feed</title>
    <link>${ ORIGIN }/</link>
    <description>Two fixture items for the end-to-end test.</description>
${ item( 'How Memory Really Works', '/article', 'Wed, 21' ) }
${ item( 'Notes That Last', '/article-2', 'Tue, 20' ) }
  </channel>
</rss>
`

const model = ( id, displayName ) => ( {
  type: 'model',
  id,
  display_name: displayName,
  created_at: '2026-01-01T00:00:00Z',
  max_input_tokens: 200000,
  max_tokens: 64000,
  capabilities: {
    structured_outputs: { supported: true },
    effort: {
      supported: true,
      low: { supported: true },
      medium: { supported: true },
      high: { supported: true },
    },
  },
} )

export const MODELS = {
  data: [
    model( 'claude-sonnet-5-5', 'Claude Sonnet 5.5' ),
    model( 'claude-haiku-5-5', 'Claude Haiku 5.5' ),
  ],
  has_more: false,
  first_id: 'claude-sonnet-5-5',
  last_id: 'claude-haiku-5-5',
}

export const SUMMARY = {
  overview: 'Spaced repetition and retrieval practice are the two habits that most reliably improve long-term recall.',
  key_points: [
    'Revisit material at growing intervals instead of cramming.',
    'Recalling something strengthens memory more than rereading it.',
  ],
  quotes: [ 'A little forgetting makes the next recall harder, and that difficulty strengthens the memory.' ],
  tags: [ 'memory', 'learning' ],
}

export const SUGGESTIONS = {
  suggestions: [
    {
      target: 'Spaced Repetition',
      anchor: 'Spaced repetition',
      reason: 'The summary is built around this idea.',
    },
    {
      target: 'Retrieval Practice',
      anchor: 'retrieval practice',
      reason: 'The second habit the article names.',
    },
  ],
}

export const RECALL_NOTE = `# Active recall

Active recall means trying to remember an idea from memory instead of rereading it. The effort of retrieving the answer is what strengthens the memory.

## Spacing

Spaced repetition schedules each review just before you would forget the idea, so the gaps between reviews grow as the memory gets stronger.
`

export const MELETE_QUESTIONS = {
  questions: [
    {
      prompt: 'What is active recall?',
      answer: 'Trying to remember an idea from memory instead of rereading it.',
      passage: 'Active recall means trying to remember an idea from memory instead of rereading it.',
    },
    {
      prompt: 'When does spaced repetition schedule a review?',
      answer: 'Just before you would forget the idea, with gaps that grow as the memory strengthens.',
      passage: 'Spaced repetition schedules each review just before you would forget the idea',
    },
  ],
}

export const MELETE_GRADE = {
  verdict: 'partial',
  right: [ 'It is about remembering rather than rereading.' ],
  missed: [ 'The effort of retrieving the answer is what strengthens the memory.' ],
  feedback: 'You have the gist; add why the effort of retrieval matters.',
  suggested_rating: 'hard',
}
