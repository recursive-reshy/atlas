// React
import type { ReactElement } from 'react'
// Packages
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { MeleteNote, MeleteSyllabus } from '@atlas/shared'
// App
import { MeleteNoteRow } from '#src/components/MeleteNoteRow'

interface SubjectNotesProps {
  notes: MeleteNote[]
  // Null until an approved syllabus has loaded
  syllabus: MeleteSyllabus | null
  onEnrolledChange: ( noteId: string, enrolled: boolean ) => void
  onRetry: ( noteId: string ) => void
  onDismissOffSyllabus: ( noteId: string ) => void
  onAddOffSyllabus: ( noteId: string, sectionId: string ) => void
}

export function SubjectNotes(
  {
    notes,
    syllabus,
    onEnrolledChange,
    onRetry,
    onDismissOffSyllabus,
    onAddOffSyllabus,
  }: SubjectNotesProps,
): ReactElement {
  const sections = ( syllabus?.sections ?? [] ).map( ( { id, name } ) => ( { id, name } ) )
  const concepts = ( syllabus?.sections ?? [] ).flatMap( ( section ) => section.concepts )

  if( notes.length === 0 ) {
    return <Typography color="text.secondary">No notes in this folder yet.</Typography>
  }

  return (
    <Stack divider={ <Divider flexItem /> }>
      { notes.map( ( note ) => (
        <MeleteNoteRow
          key={ note.id }
          note={ note }
          concepts={ concepts
            .filter( ( { id } ) => note.concept_ids.includes( id ) )
            .map( ( { name } ) => name ) }
          sections={ sections }
          onEnrolledChange={ ( enrolled ) => onEnrolledChange( note.id, enrolled ) }
          onRetry={ () => onRetry( note.id ) }
          onDismissOffSyllabus={ () => onDismissOffSyllabus( note.id ) }
          onAddOffSyllabus={ ( sectionId ) => onAddOffSyllabus( note.id, sectionId ) }
        />
      ) ) }
    </Stack>
  )
}
