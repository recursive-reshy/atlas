// Shared
import { parseNote } from '@atlas/shared'
// App
import type { AutosaveStatus } from '#src/hooks/useAutosaveDraft'

export const STATUS_LABELS: Record< Exclude< AutosaveStatus, 'error' >, string > = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
}

export const COLUMNS_SX = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: 'minmax( 0, 1fr )',
} as const

export const TWO_COLUMNS_SX = {
  ...COLUMNS_SX,
  alignItems: 'start',
  gridTemplateColumns: { xs: 'minmax( 0, 1fr )', lg: 'repeat( 2, minmax( 0, 1fr ) )' },
} as const

export const noteTitle = ( note: string ): string | null => {
  try {
    return parseNote( note ).properties.title
  } catch{
    return null
  }
}
