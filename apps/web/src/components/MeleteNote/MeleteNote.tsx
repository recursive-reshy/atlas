// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useParams } from 'react-router'
// App
import {
  useDropQuestion,
  useRegenerateNote,
  useRetryGeneration,
} from '#src/hooks/useMeleteMutations'
import { useMeleteNote } from '#src/hooks/useMeleteNote'
import { useMeleteSubject } from '#src/hooks/useMeleteSubject'
import { useMeleteSyllabus } from '#src/hooks/useMeleteSyllabus'
import { useSetNoteConcepts } from '#src/hooks/useNoteMappingMutations'
import { NoteConceptsEditor } from '../NoteConceptsEditor'
import { MeleteQuestionItem } from '../MeleteQuestionItem'

export function MeleteNote(): ReactElement {
  const { noteId = '' } = useParams()
  const { note, questions, obsidianUrl, isLoading, error } = useMeleteNote( noteId )
  const regenerateNote = useRegenerateNote()
  const retryGeneration = useRetryGeneration()
  const dropQuestion = useDropQuestion()
  const setConcepts = useSetNoteConcepts()
  const { subject } = useMeleteSubject( note?.subject_id ?? '' )
  const isApproved = subject?.syllabus_status === 'approved'
  const { syllabus } = useMeleteSyllabus( note?.subject_id ?? '', isApproved )
  const changeError = [ regenerateNote, retryGeneration, dropQuestion ]
    .find( ( mutation ) => mutation.isError )?.error?.message ?? null

  if( isLoading ) {
    return <Typography role="status">Loading note…</Typography>
  }

  if( note === null ) {
    return <Alert severity="error">{ error ?? 'Could not load the note' }</Alert>
  }

  const isGenerating = note.generation === 'queued' || note.generation === 'generating'
  const active = questions.filter( ( { state } ) => state === 'active' )
  const dropped = questions.filter( ( { state } ) => state === 'dropped' )
  const renderQuestion = ( question: ( typeof questions )[ number ] ): ReactElement => (
    <MeleteQuestionItem
      key={ question.id }
      question={ question }
      onDrop={ () => dropQuestion.mutate( question.id ) }
    />
  )

  return (
    <Stack spacing={ 2 } sx={ { width: '100%', maxWidth: '40rem' } }>
      <Link
        component={ RouterLink }
        to={ `/melete/subjects/${ note.subject_id }` }
        underline="hover"
      >
        Subject
      </Link>
      <Typography variant="h5" component="h2">{ note.title }</Typography>
      <Typography variant="body2" color="text.secondary" sx={ { overflowWrap: 'anywhere' } }>
        { note.path }
      </Typography>
      { note.missing && <Typography color="warning.main">Missing from the vault</Typography> }
      { isGenerating && (
        <Typography color="text.secondary">
          { note.stale ? 'Changed — regenerating' : 'Generating…' }
        </Typography>
      ) }
      { note.generation === 'failed' && (
        <Alert
          severity="error"
          action={ (
            <Button
              color="inherit"
              size="small"
              onClick={ () => retryGeneration.mutate( note.id ) }
            >
              Retry
            </Button>
          ) }
        >
          { note.generation_error ?? 'Question generation failed' }
        </Alert>
      ) }
      { note.mapping === 'failed' && (
        <Alert
          severity="error"
          action={ (
            <Button
              color="inherit"
              size="small"
              onClick={ () => retryGeneration.mutate( note.id ) }
            >
              Retry
            </Button>
          ) }
        >
          { note.mapping_error ?? 'Mapping failed' }
        </Alert>
      ) }
      { changeError !== null && <Alert severity="error">{ changeError }</Alert> }
      <Stack direction="row" spacing={ 1 }>
        <Button
          variant="outlined"
          disabled={ isGenerating }
          sx={ { minHeight: 44 } }
          onClick={ () => regenerateNote.mutate( note.id ) }
        >
          Regenerate
        </Button>
        { obsidianUrl !== null && (
          <Button variant="outlined" href={ obsidianUrl } sx={ { minHeight: 44 } }>
            Open in Obsidian
          </Button>
        ) }
      </Stack>
      { isApproved && syllabus !== null && (
        <NoteConceptsEditor
          key={ note.concept_ids.join( ',' ) }
          note={ note }
          syllabus={ syllabus }
          isSaving={ setConcepts.isPending }
          error={ setConcepts.error?.message ?? null }
          onSave={ ( conceptIds ) => setConcepts.mutate( { id: note.id, conceptIds } ) }
        />
      ) }
      { active.length === 0 && dropped.length === 0 && (
        <Typography color="text.secondary">No questions yet.</Typography>
      ) }
      { active.map( renderQuestion ) }
      { dropped.length > 0 && (
        <>
          <Typography variant="h6" component="h3">Dropped</Typography>
          { dropped.map( renderQuestion ) }
        </>
      ) }
    </Stack>
  )
}
