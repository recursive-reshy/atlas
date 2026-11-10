// React
import type { ReactElement } from 'react'
// Packages
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { Link, Navigate, useParams } from 'react-router'
// App
import { useMe } from '#src/app/useMe'
import { useMeleteProfiles } from '#src/features/melete/hooks/useMeleteProfiles'
import { usePromptProfiles } from '#src/features/settings/hooks/usePromptProfiles'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { ProfileManager } from '../ProfileManager'
import { PromptList } from '../PromptList'
import { PromptPanel } from '../PromptPanel'

const LIST_WIDTH = 280

export function PromptsTab(): ReactElement {
  const { promptId = null } = useParams()
  const isNarrow = useMediaQuery( useTheme().breakpoints.down( 'md' ) )
  const defaultId = useSettings().settings?.default_profile_id
  const modules = useMe().me?.modules ?? []
  const hasSummary = modules.includes( 'transcriber' )
  const profiles = usePromptProfiles().profiles
  const meleteProfiles = useMeleteProfiles().profiles.filter( () => modules.includes( 'melete' ) )
  const startId = hasSummary ? defaultId : meleteProfiles[ 0 ]?.id

  // On a wide window the editor is always open; the default profile is the one to start on, or
  // for a user without Transcriber, the first Melete prompt.
  const hasStart = hasSummary
    ? profiles.some( ( { id } ) => id === startId )
    : startId !== undefined

  if( !isNarrow && promptId === null && hasStart ) {
    return <Navigate to={ `/settings/prompts/${ startId }` } replace />
  }

  const list = (
    <Stack spacing={ 1 } sx={ { flex: { md: `0 0 ${ LIST_WIDTH }px` }, minWidth: 0 } }>
      <PromptList
        hasSummary={ hasSummary }
        profiles={ profiles }
        meleteProfiles={ meleteProfiles }
        defaultId={ defaultId }
        selectedId={ promptId }
      />
      { hasSummary && <ProfileManager selectedId={ promptId } /> }
    </Stack>
  )
  const panel = promptId === null ? null : (
    <Stack spacing={ 1 } sx={ { flex: 1, minWidth: 0 } }>
      { isNarrow && (
        <Button component={ Link } to="/settings/prompts" startIcon={ <ArrowBackIcon /> }
          sx={ { alignSelf: 'flex-start' } }>
          All prompts
        </Button>
      ) }
      <PromptPanel promptId={ promptId } />
    </Stack>
  )

  if( isNarrow ) {
    return panel ?? list
  }

  return (
    <Stack direction="row" spacing={ 3 } sx={ { width: '100%', alignItems: 'flex-start' } }>
      { list }
      { panel }
    </Stack>
  )
}
