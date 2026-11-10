// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Navigate } from 'react-router'
// App
import { useMeleteProfiles } from '#src/features/melete/hooks/useMeleteProfiles'
import { usePromptProfiles } from '#src/features/settings/hooks/usePromptProfiles'
import { usePromptVersions } from '#src/features/settings/hooks/usePromptVersions'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { useUnsavedChangesGuard } from '#src/features/jobs/hooks/useUnsavedChangesGuard'
import { LockedInstructions } from '../LockedInstructions'
import { PromptEditor } from '../PromptEditor'
import { PromptHistory } from '../PromptHistory'

const LINKER = 'linker'

const MELETE_LOCKED = {
  melete_questions: {
    key: 'melete_questions',
    title: 'Instructions the app always sends for question generation',
  },
  melete_grading: {
    key: 'melete_grading',
    title: 'Instructions the app always sends for grading',
  },
  melete_syllabus: {
    key: 'melete_syllabus',
    title: 'Instructions the app always sends for syllabus drafting',
  },
  melete_map: {
    key: 'melete_map',
    title: 'Instructions the app always sends for mapping notes',
  },
  melete_suggest: {
    key: 'melete_suggest',
    title: 'Instructions the app always sends for resource suggestions',
  },
} as const

interface PromptPanelProps {
  // A summary or Melete profile's id, or 'linker'.
  promptId: string
}

interface Subject {
  id: string
  name: string
  saved: string
  versionId: number
  canReset: boolean
}

export function PromptPanel( { promptId }: PromptPanelProps ): ReactElement {
  const isLinker = promptId === LINKER
  const { settings, lockedInstructions, linkerLockedInstructions } = useSettings()
  const state = usePromptProfiles()
  const meleteState = useMeleteProfiles()
  const linkerId = settings?.linker_profile_id ?? null
  const linker = usePromptVersions( isLinker ? linkerId : null )
  // The edit belongs to one prompt, so it never carries over when the prompt changes.
  const [ edit, setEdit ] = useState< { promptId: string, text: string } | null >( null )
  const draft = edit?.promptId === promptId ? edit.text : null

  const summary = state.profiles.find( ( { id } ) => id === promptId )
  const melete = meleteState.profiles.find( ( { id } ) => id === promptId )
  const profile = summary ?? melete
  const meleteLocked = melete === undefined
    ? undefined
    : MELETE_LOCKED[ melete.purpose as keyof typeof MELETE_LOCKED ]
  const newest = linker.versions[ 0 ]
  let subject: Subject | undefined

  if( isLinker && linkerId !== null && newest !== undefined ) {
    subject = {
      id: linkerId,
      name: 'Linker prompt',
      saved: newest.guidance,
      versionId: newest.id,
      canReset: true,
    }
  } else if( profile !== undefined ) {
    const { id, name, can_reset: canReset, current_version: current } = profile

    subject = { id, name, saved: current.guidance, versionId: current.id, canReset }
  }

  const isDirty = subject !== undefined && draft !== null && draft.trim() !== subject.saved.trim()
  const guard = useUnsavedChangesGuard( isDirty )
  const isWaitingForMelete = !isLinker && summary === undefined && meleteState.isLoading
  const error = state.error ?? linker.error ?? ( subject === undefined ? meleteState.error : null )

  if( state.isLoading || isWaitingForMelete || ( isLinker && linker.isLoading ) ) {
    return <Typography role="status">Loading the prompt…</Typography>
  }

  if( error !== null ) {
    return <Alert severity="error">{ error }</Alert>
  }

  if( subject === undefined ) {
    return isLinker
      ? <Alert severity="error">The linker prompt was not found</Alert>
      : <Navigate to="/settings/prompts" replace />
  }

  const { id, name, saved, versionId, canReset } = subject
  const clearDraft = { onSuccess: () => setEdit( null ) }

  return (
    <Stack spacing={ 2 }>
      <Typography variant="h6" component="h3">{ name }</Typography>
      <PromptEditor
        value={ draft ?? saved }
        isDirty={ isDirty }
        isSaving={ state.saveVersion.isPending || state.resetProfile.isPending }
        canReset={ canReset }
        error={ state.saveVersion.error?.message ?? state.resetProfile.error?.message ?? null }
        onChange={ ( text ) => setEdit( { promptId, text } ) }
        onSave={ () => state.saveVersion.mutate( { id, guidance: draft ?? saved }, clearDraft ) }
        onDiscard={ () => setEdit( null ) }
        onReset={ () => state.resetProfile.mutate( id, clearDraft ) }
      />
      <PromptHistory
        profileId={ id }
        currentVersionId={ versionId }
        isRestoring={ state.restoreVersion.isPending }
        error={ state.restoreVersion.error?.message ?? null }
        onRestore={ ( restoreId ) => state.restoreVersion.mutate(
          { id, versionId: restoreId },
          clearDraft,
        ) }
      />
      { !isLinker && melete === undefined && lockedInstructions !== null && (
        <>
          <LockedInstructions
            title="Instructions the app always sends for videos"
            text={ lockedInstructions.video }
          />
          <LockedInstructions
            title="Instructions the app always sends for articles"
            text={ lockedInstructions.article }
          />
        </>
      ) }
      { meleteLocked !== undefined && lockedInstructions !== null && (
        <LockedInstructions
          title={ meleteLocked.title }
          text={ lockedInstructions[ meleteLocked.key ] }
        />
      ) }
      { isLinker && linkerLockedInstructions !== null && (
        <LockedInstructions
          title="Instructions the app always sends when linking"
          text={ linkerLockedInstructions }
        />
      ) }
      { isLinker && linkerLockedInstructions === null && (
        <Typography variant="body2" color="text.secondary">
          Unavailable while the agent service is down.
        </Typography>
      ) }
      { guard }
    </Stack>
  )
}
