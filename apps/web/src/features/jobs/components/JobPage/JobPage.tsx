// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Navigate, useNavigate, useParams } from 'react-router'
// Shared
import { Job, detectSourceType } from '@atlas/shared'
// App
import { createJob } from '#src/features/jobs/api/jobs.api'
import { useJob } from '#src/features/jobs/hooks/useJob'
import { useSubmitPastedText } from '#src/features/jobs/hooks/useSubmitPastedText'
import { JobProgress } from '../JobProgress'
import { ReviewScreen } from '../ReviewScreen'

const DOWNLOADABLE_STATUSES: Job[ 'status' ][] = [ 'ready_for_review', 'summary_failed' ]

const STACK_SX = { width: '100%', alignItems: 'flex-start' } as const

export function JobPage(): ReactElement {
  const navigate = useNavigate()
  const { id } = useParams()
  const parsedId = Job.shape.id.safeParse( id )
  const { job, error } = useJob( parsedId.success ? parsedId.data : null )
  const [ submitError, setSubmitError ] = useState< string | null >( null )
  const paste = useSubmitPastedText( id ?? '' )

  if( !parsedId.success ) {
    return <Navigate to="/transcriber" replace />
  }

  const handleStartOver = (): void => {
    void navigate( '/transcriber' )
  }

  const handleRetry = async ( { url, source_type }: Job ): Promise< void > => {
    setSubmitError( null )

    try {
      const isOverride = detectSourceType( url ) !== source_type
      const newJobId = await createJob( isOverride ? { url, source_type } : { url } )

      void navigate( `/transcriber/jobs/${ newJobId }` )
    } catch( caught ) {
      setSubmitError( caught instanceof Error ? caught.message : 'Unexpected error' )
    }
  }

  if( job === null && error !== null ) {
    return (
      <Stack spacing={ 2 } sx={ STACK_SX }>
        <Alert severity="error">{ error }</Alert>
        <Button variant="outlined" onClick={ handleStartOver }>Start over</Button>
      </Stack>
    )
  }

  if( job === null ) {
    return <Typography role="status">Loading job…</Typography>
  }

  if( job.status === 'saved' ) {
    return (
      <Stack spacing={ 2 } sx={ STACK_SX }>
        <Alert severity="success" role="status">Saved to { job.saved_path }</Alert>
        <Button variant="outlined" onClick={ handleStartOver }>Transcribe another video</Button>
      </Stack>
    )
  }

  const isInReview = DOWNLOADABLE_STATUSES.includes( job.status )

  return (
    <Stack spacing={ 2 } sx={ STACK_SX }>
      { isInReview
        ? (
          <ReviewScreen
            job={ job }
            onSaved={ ( savedPath ) => void navigate( '/transcriber', { state: { savedPath } } ) }
            onDiscarded={ handleStartOver }
          />
        )
        : (
          <JobProgress
            job={ job }
            connectionError={ error }
            onRetry={ () => void handleRetry( job ) }
            onPasteText={ ( body ) => paste.mutate( body ) }
            isPasting={ paste.isPending }
            pasteError={ paste.error?.message ?? null }
          />
        ) }
      { submitError && <Alert severity="error">{ submitError }</Alert> }
      <Button variant="outlined" onClick={ handleStartOver }>Transcribe another video</Button>
    </Stack>
  )
}
