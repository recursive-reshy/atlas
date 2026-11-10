// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { MeleteNote } from '@atlas/shared'
// App
import { OffSyllabusNotice } from '../OffSyllabusNotice'

interface MeleteNoteRowProps {
  note: MeleteNote
  // Names of the concepts the note is mapped to, in syllabus order
  concepts: string[]
  sections: { id: string, name: string }[]
  onEnrolledChange: ( enrolled: boolean ) => void
  // Retries question generation or mapping, whichever failed
  onRetry: () => void
  onDismissOffSyllabus: () => void
  onAddOffSyllabus: ( sectionId: string ) => void
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
  {
    note,
    concepts,
    sections,
    onEnrolledChange,
    onRetry,
    onDismissOffSyllabus,
    onAddOffSyllabus,
  }: MeleteNoteRowProps,
): ReactElement {
  const status = statusOf( note )
  const isMapping = note.mapping === 'queued' || note.mapping === 'mapping'
  const hasFailed = note.generation === 'failed' || note.mapping === 'failed'

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
        { note.mapping === 'failed' && note.mapping_error !== null && (
          <Typography variant="caption" color="error" sx={ { overflowWrap: 'anywhere' } }>
            { note.mapping_error }
          </Typography>
        ) }
        <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center', minHeight: 24 } }>
          { status !== null && (
            <Typography variant="body2" color="text.secondary">{ status }</Typography>
          ) }
          { isMapping && <Typography variant="body2" color="text.secondary">Mapping…</Typography> }
          { note.mapping === 'failed' && (
            <Typography variant="body2" color="error">Mapping failed</Typography>
          ) }
          { hasFailed && (
            <Button size="small" sx={ { minHeight: 44 } } onClick={ onRetry }>Retry</Button>
          ) }
        </Stack>
        { concepts.length > 0 && (
          <Stack
            direction="row"
            spacing={ 0.5 }
            useFlexGap
            sx={ { flexWrap: 'wrap', pb: 0.5 } }
          >
            { concepts.map( ( name ) => <Chip key={ name } size="small" label={ name } /> ) }
          </Stack>
        ) }
        { note.off_syllabus === 'flagged' && (
          <OffSyllabusNotice
            suggestion={ note.off_syllabus_suggestion }
            sections={ sections }
            isBusy={ false }
            onDismiss={ onDismissOffSyllabus }
            onAdd={ onAddOffSyllabus }
          />
        ) }
      </Stack>
    </Stack>
  )
}
