// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import { useLocation, useNavigate } from 'react-router'
// Shared
import type { CreateJobBody, Settings } from '@atlas/shared'
// App
import { createJob } from '#src/api/jobs.api'
import { useJobs } from '#src/hooks/useJobs'
import { useModels } from '#src/hooks/useModels'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { Inbox } from '../Inbox'
import { JobList } from '../JobList'
import { SubmitForm } from '../SubmitForm'

const readSavedPath = ( state: unknown ): string | null => {
  if( typeof state !== 'object' || state === null || !( 'savedPath' in state ) ) {
    return null
  }

  return typeof state.savedPath === 'string' ? state.savedPath : null
}

// Only what differs from the defaults is sent, so a job that took the default keeps following it.
const summaryChoices = (
  settings: Settings | null,
  profileChoice: string | null,
  modelChoice: string | null,
): { model?: string, profile_id?: string } => {
  const choices: { model?: string, profile_id?: string } = {}

  if( settings === null ) {
    return choices
  }

  if( modelChoice !== null && modelChoice !== settings.default_model ) {
    choices.model = modelChoice
  }

  if( profileChoice !== null && profileChoice !== settings.default_profile_id ) {
    choices.profile_id = profileChoice
  }

  return choices
}

export function HomePage(): ReactElement {
  const navigate = useNavigate()
  const savedPath = readSavedPath( useLocation().state )
  const { jobs, updatedAt } = useJobs()
  const { settings } = useSettings()
  const { models, isLoading: isLoadingModels } = useModels()
  const { profiles, isLoading: isLoadingProfiles } = usePromptProfiles()
  const [ profileChoice, setProfileChoice ] = useState< string | null >( null )
  const [ modelChoice, setModelChoice ] = useState< string | null >( null )
  const [ isSubmitting, setIsSubmitting ] = useState( false )
  const [ submitError, setSubmitError ] = useState< string | null >( null )

  const handleSubmit = async ( body: CreateJobBody ): Promise< void > => {
    setIsSubmitting( true )
    setSubmitError( null )

    try {
      const options = summaryChoices( settings, profileChoice, modelChoice )
      const jobId = await createJob( { ...body, ...options } )

      void navigate( `/jobs/${ jobId }` )
    } catch( caught ) {
      setSubmitError( caught instanceof Error ? caught.message : 'Unexpected error' )
    } finally {
      setIsSubmitting( false )
    }
  }

  return (
    <Stack spacing={ 2 } sx={ { width: '100%', maxWidth: '40rem' } }>
      { savedPath !== null && (
        <Alert severity="success" role="status">Saved to { savedPath }</Alert>
      ) }
      <SubmitForm
        isSubmitting={ isSubmitting }
        error={ submitError }
        onSubmit={ ( body ) => void handleSubmit( body ) }
        options={ {
          profiles,
          models,
          profileId: profileChoice ?? settings?.default_profile_id ?? '',
          model: modelChoice ?? settings?.default_model ?? '',
          isLoading: settings === null || isLoadingModels || isLoadingProfiles,
          onProfileChange: setProfileChoice,
          onModelChange: setModelChoice,
        } }
      />
      <Inbox />
      <JobList jobs={ jobs ?? [] } now={ updatedAt } />
    </Stack>
  )
}
