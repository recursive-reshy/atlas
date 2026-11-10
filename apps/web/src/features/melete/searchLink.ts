// Shared
import type { MeleteResourceKind } from '@atlas/shared'

// Suggestions have no links of their own (ADR 0093); the learner searches by the query
export const searchUrl = ( kind: MeleteResourceKind, query: string ): string => {
  const text = encodeURIComponent( query )

  return kind === 'video' || kind === 'talk'
    ? `https://www.youtube.com/results?search_query=${ text }`
    : `https://www.google.com/search?q=${ text }`
}
