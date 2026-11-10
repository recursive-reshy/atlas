// Shared
import type { GmailMatch } from '@atlas/shared'

export const MAX_LABELS = 10

// What the form holds while the person is choosing: both halves are kept, so switching between
// Labels and Search doesn't lose what was typed.
export interface MatchDraft {
  kind: GmailMatch[ 'kind' ]
  labelIds: string[]
  query: string
}

export const toMatch = ( { kind, labelIds, query }: MatchDraft ): GmailMatch | null => {
  if( kind === 'labels' ) {
    return labelIds.length > 0 && labelIds.length <= MAX_LABELS
      ? { kind, label_ids: labelIds }
      : null
  }

  return query.trim() === '' ? null : { kind, query: query.trim() }
}

export const fromMatch = ( match: GmailMatch ): MatchDraft => {
  return match.kind === 'labels'
    ? { kind: 'labels', labelIds: match.label_ids, query: '' }
    : { kind: 'query', labelIds: [], query: match.query }
}

export const matchKey = ( match: GmailMatch | null ): string => {
  if( match === null ) {
    return ''
  }

  return match.kind === 'labels'
    ? `labels:${ [ ...match.label_ids ].sort().join( ',' ) }`
    : `query:${ match.query }`
}
