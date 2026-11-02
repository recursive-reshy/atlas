// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
// Shared
import type { Job, SourceDocument } from '@atlas/shared'
// App
import type { AutosaveState } from '#src/hooks/useAutosaveDraft'
import { useLinkSuggestions } from '#src/hooks/useLinkSuggestions'
import { useRunLinking } from '#src/hooks/useRunLinking'
import { useSettings } from '#src/hooks/useSettings'
import { ConfirmDialog } from '../ConfirmDialog'
import { LinkingNotice } from '../LinkingNotice'
import { SourcePane } from '../SourcePane'
import { LinkSuggestionsTab } from './LinkSuggestionsTab'

type TabName = 'links' | 'source'

const RERUN_MESSAGE = 'The suggestions still pending will be replaced by new ones. '
  + 'Links you have accepted stay in the note.'

interface LinkReviewProps {
  job: Job
  autosave: AutosaveState
  source: SourceDocument | null
  sourceError: string | null
  focusSecond: number | null
}

export function LinkReview(
  { job, autosave, source, sourceError, focusSecond }: LinkReviewProps,
): ReactElement {
  const hasLinks = job.link_state === 'linked'
  const { suggestions, isLoading } = useLinkSuggestions( job.id, { enabled: hasLinks } )
  const run = useRunLinking( job.id )
  const { agentStatus } = useSettings()
  const [ selected, setSelected ] = useState< TabName | null >( null )
  const [ isConfirming, setIsConfirming ] = useState( false )

  const pending = suggestions
    .filter( ( { status } ) => status === 'pending' )
    .sort( ( a, b ) => a.position - b.position )

  if( selected === null && hasLinks && !isLoading && pending.length > 0 ) {
    setSelected( 'links' )
  }

  const tab = selected ?? 'source'
  const sourcePane = (
    <SourcePane
      source={ source }
      sourceType={ job.source_type }
      error={ sourceError }
      focusSecond={ focusSecond }
    />
  )

  if( job.status === 'summary_failed' ) {
    return sourcePane
  }

  // The job is about to become `linking`, which unmounts this screen; the text goes in the request.
  const handleRun = (): void => {
    autosave.cancelPending()
    run.mutate( { note_markdown: autosave.note } )
  }

  const handleRerun = (): void => {
    if( pending.length > 0 ) {
      setIsConfirming( true )
    } else {
      handleRun()
    }
  }

  return (
    <Stack spacing={ 2 } sx={ { minWidth: 0, alignItems: 'stretch' } }>
      <LinkingNotice
        linkState={ job.link_state }
        linkError={ job.link_error }
        agentStatus={ agentStatus }
        isRunning={ run.isPending }
        error={ run.error?.message ?? null }
        onRun={ handleRun }
      />
      { hasLinks && (
        <Button
          size="small"
          variant="outlined"
          disabled={ run.isPending }
          onClick={ handleRerun }
          sx={ { alignSelf: 'flex-start' } }
        >
          Re-run linking
        </Button>
      ) }
      <Box>
        <Tabs value={ tab } onChange={ ( _event, value: TabName ) => setSelected( value ) }>
          <Tab value="links" label={ `Suggested links (${ pending.length } pending)` } />
          <Tab value="source" label="Source" />
        </Tabs>
        <Box hidden={ tab !== 'links' } sx={ { pt: 2 } }>
          <LinkSuggestionsTab
            job={ job }
            autosave={ autosave }
            suggestions={ suggestions }
            pending={ pending }
          />
        </Box>
        <Box hidden={ tab !== 'source' } sx={ { pt: 2 } }>{ sourcePane }</Box>
      </Box>
      <ConfirmDialog
        open={ isConfirming }
        title="Re-run linking?"
        message={ RERUN_MESSAGE }
        confirmLabel="Re-run"
        onConfirm={ () => {
          setIsConfirming( false )
          handleRun()
        } }
        onCancel={ () => setIsConfirming( false ) }
      />
    </Stack>
  )
}
