// React
import type { ReactElement } from 'react'
// Packages
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { MeleteNote } from '@atlas/shared'
// App
import { MeleteNoteRow } from '#src/components/MeleteNoteRow'

interface SubjectNotesProps {
  notes: MeleteNote[]
  onEnrolledChange: ( noteId: string, enrolled: boolean ) => void
  onRetry: ( noteId: string ) => void
}

export function SubjectNotes(
  { notes, onEnrolledChange, onRetry }: SubjectNotesProps,
): ReactElement {
  if( notes.length === 0 ) {
    return <Typography color="text.secondary">No notes in this folder yet.</Typography>
  }

  return (
    <Stack divider={ <Divider flexItem /> }>
      { notes.map( ( note ) => (
        <MeleteNoteRow
          key={ note.id }
          note={ note }
          onEnrolledChange={ ( enrolled ) => onEnrolledChange( note.id, enrolled ) }
          onRetry={ () => onRetry( note.id ) }
        />
      ) ) }
    </Stack>
  )
}
