// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { Job, RegenerateSummaryBody } from '@atlas/shared'
// App
import { parseTimestampSeconds } from '#src/timestamp'
import { useDiscardJob } from '#src/hooks/useDiscardJob'
import { useAutosaveDraft } from '#src/hooks/useAutosaveDraft'
import { useRegenerateSummary } from '#src/hooks/useRegenerateSummary'
import { useRetrySummary } from '#src/hooks/useRetrySummary'
import { useSaveJob } from '#src/hooks/useSaveJob'
import { useSource } from '#src/hooks/useSource'
import { DownloadLinks } from '../DownloadLinks'
import { JobHeading } from '../JobHeading'
import { LinkReview } from '../LinkReview'
import { NoteDestination } from '../NoteDestination'
import { NoteEditor } from '../NoteEditor'
import type { NoteEditorMode } from '../NoteEditor'
import { PropertiesPanel } from '../PropertiesPanel'
import { RegenerateDialog } from '../RegenerateDialog'
import { ReviewActions } from '../ReviewActions'
import { SummaryInfo } from '../SummaryInfo'
import {
  COLUMNS_SX,
  STATUS_LABELS,
  TWO_COLUMNS_SX,
  noteTitle,
} from './reviewLayout'

interface ReviewScreenProps {
  job: Job
  onSaved: ( savedPath: string ) => void
  onDiscarded: () => void
}

export function ReviewScreen( { job, onSaved, onDiscarded }: ReviewScreenProps ): ReactElement {
  const hasFailed = job.status === 'summary_failed'
  const autosave = useAutosaveDraft( job )
  const title = noteTitle( autosave.note )
  const [ mode, setMode ] = useState< NoteEditorMode >( 'rich-text' )
  const { source, error: transcriptError } = useSource( job.id )
  const [ focusSecond, setFocusSecond ] = useState< number | null >( null )
  const save = useSaveJob( job.id, autosave.flush )
  const discard = useDiscardJob( job.id )
  const retry = useRetrySummary( job.id )
  const regenerate = useRegenerateSummary( job.id )
  const [ isRegenerating, setIsRegenerating ] = useState( false )

  const handleCaretLine = ( line: string ): void => {
    const seconds = parseTimestampSeconds( line )

    if( seconds !== null ) {
      setFocusSecond( seconds )
    }
  }

  const handleDiscard = (): void => {
    discard.mutate( undefined, { onSuccess: () => onDiscarded() } )
  }

  const handleBlur = (): void => {
    void autosave.flush().then( ( isSaved ) => {
      if( isSaved ) {
        autosave.adoptServerNote()
      }
    } )
  }

  const handleModeChange = ( next: NoteEditorMode ): void => {
    setMode( next )
    handleBlur()
  }

  const handleRegenerate = ( choices: RegenerateSummaryBody ): void => {
    // The note is about to be replaced; a save now would meet a job that is summarizing.
    autosave.cancelPending()
    regenerate.mutate( choices, { onSuccess: () => setIsRegenerating( false ) } )
  }

  const handleSave = (): void => {
    save.mutate( undefined, { onSuccess: ( savedPath ) => onSaved( savedPath ) } )
  }

  return (
    <Stack spacing={ 2 } sx={ { width: '100%' } }>
      <JobHeading title={ job.title ?? job.url } feedName={ job.feed_name }
        gmailSourceName={ job.gmail_source_name } />
      { hasFailed && <Alert severity="error">{ job.error ?? 'Summary failed.' }</Alert> }
      { !hasFailed && (
        <>
          { mode === 'rich-text' && (
            <PropertiesPanel note={ autosave.note } onChange={ autosave.setNote } />
          ) }
          <NoteDestination
            title={ title ?? job.title ?? '' } defaultFolder={ job.default_folder }
            folder={ autosave.folder }
            onFolderChange={ autosave.setFolder }
          />
        </>
      ) }
      <Box sx={ hasFailed ? COLUMNS_SX : TWO_COLUMNS_SX }>
        { !hasFailed && (
          <NoteEditor
            value={ autosave.note }
            onChange={ autosave.setNote }
            onModeChange={ handleModeChange }
            onBlur={ handleBlur }
            onCaretText={ handleCaretLine }
          />
        ) }
        <LinkReview
          job={ job }
          autosave={ autosave }
          source={ source }
          sourceError={ transcriptError }
          focusSecond={ focusSecond }
        />
      </Box>
      { !hasFailed && autosave.status === 'error' && (
        <Alert severity="error">{ `Not saved: ${ autosave.message ?? '' }` }</Alert>
      ) }
      { !hasFailed && autosave.status !== 'error' && (
        <Typography role="status">{ STATUS_LABELS[ autosave.status ] }</Typography>
      ) }
      <SummaryInfo usage={ job.summary_usage } linkUsage={ job.link_usage } />
      <DownloadLinks jobId={ job.id } sourceType={ job.source_type } />
      { save.isError && autosave.status !== 'error' && (
        <Alert severity="error">{ save.error.message }</Alert>
      ) }
      { retry.isError && <Alert severity="error">{ retry.error.message }</Alert> }
      { discard.isError && <Alert severity="error">{ discard.error.message }</Alert> }
      <ReviewActions
        hasFailed={ hasFailed }
        canSave={ title !== null && title.trim() !== '' }
        isSaving={ save.isPending }
        isRetrying={ retry.isPending }
        isDiscarding={ discard.isPending }
        isRegenerating={ regenerate.isPending }
        onSave={ handleSave }
        onRetry={ () => retry.mutate() }
        onDiscard={ handleDiscard }
        onRegenerate={ () => {
          regenerate.reset()
          setIsRegenerating( true )
        } }
      />
      { isRegenerating && (
        <RegenerateDialog
          job={ job }
          isSubmitting={ regenerate.isPending }
          error={ regenerate.error?.message ?? null }
          onSubmit={ handleRegenerate }
          onCancel={ () => setIsRegenerating( false ) }
        />
      ) }
      { autosave.guard }
    </Stack>
  )
}
