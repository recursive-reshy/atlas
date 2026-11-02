// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { MeleteNote } from '@atlas/shared'

interface MeleteNoteRowProps {
  note: MeleteNote
  onEnrolledChange: ( enrolled: boolean ) => void
  onRetry: () => void
}

const STATUS_LABELS = {
  generating: 'Generating…',
  regenerating: 'Changed — regenerating',
  failed: 'Failed',
  missing: 'Missing',
} as const

const statusOf = ( note: MeleteNote ): string | null => {
  if( note.missing ) {
    return STATUS_LABELS.missing
  }

  if( note.generation === 'queued' || note.generation === 'generating' ) {
    return note.stale ? STATUS_LABELS.regenerating : STATUS_LABELS.generating
  }

  if( note.generation === 'failed' ) {
    return STATUS_LABELS.failed
  }

  if( !note.enrolled && note.question_count === 0 ) {
    return null
  }

  return `${ note.question_count } ${ note.question_count === 1 ? 'question' : 'questions' }`
}

export function MeleteNoteRow(
  { note, onEnrolledChange, onRetry }: MeleteNoteRowProps,
): ReactElement {
  const status = statusOf( note )

  return (
    <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center', py: 1 } }>
      <Switch
        checked={ note.enrolled }
        onChange={ ( event ) => onEnrolledChange( event.target.checked ) }
        slotProps={ { input: { 'aria-label': note.title } } }
      />
      <Stack sx={ { flexGrow: 1, minWidth: 0 } }>
        <Link
          component={ RouterLink }
          to={ `/melete/notes/${ note.id }` }
          underline="hover"
          sx={ { overflowWrap: 'anywhere' } }
        >
          { note.title }
        </Link>
        <Typography variant="caption" color="text.secondary" sx={ { overflowWrap: 'anywhere' } }>
          { note.path }
        </Typography>
        { note.generation === 'failed' && note.generation_error !== null && (
          <Typography
            variant="caption"
            color="error"
            sx={ { overflowWrap: 'anywhere' } }
          >
            { note.generation_error }
          </Typography>
        ) }
        <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center', minHeight: 24 } }>
          { status !== null && (
            <Typography variant="body2" color="text.secondary">{ status }</Typography>
          ) }
          { note.generation === 'failed' && (
            <Button size="small" sx={ { minHeight: 44 } } onClick={ onRetry }>Retry</Button>
          ) }
        </Stack>
      </Stack>
    </Stack>
  )
}
