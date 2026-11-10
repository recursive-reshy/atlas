// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// App
import { useGmailSources } from '#src/features/gmail/hooks/useGmailSources'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { GmailSourceList } from '../GmailSourceList'
import { GmailDialogs } from './GmailDialogs'
import type { GmailDialog } from './GmailDialogs'

interface GmailSourcesProps {
  connected: boolean
}

export function GmailSources( { connected }: GmailSourcesProps ): ReactElement {
  const sources = useGmailSources()
  const { profiles } = usePromptProfiles()
  const [ dialog, setDialog ] = useState< GmailDialog | null >( null )
  const checking = sources.checkSource.isPending ? sources.checkSource.variables ?? null : null
  const handleClose = (): void => {
    setDialog( null )
    sources.createSource.reset()
    sources.updateSource.reset()
    sources.deleteSource.reset()
  }

  const failure = [ sources.updateSource, sources.checkSource, sources.checkAllSources ]
    .find( ( mutation ) => mutation.isError )?.error

  return (
    <Stack spacing={ 2 }>
      <Stack
        direction="row"
        spacing={ 1 }
        sx={ { alignItems: 'center', justifyContent: 'space-between' } }
      >
        <Typography variant="subtitle1" component="h4" sx={ { fontWeight: 600 } }>
          Sources
        </Typography>
        <Stack direction="row" spacing={ 1 }>
          <Button
            variant="outlined"
            onClick={ () => sources.checkAllSources.mutate() }
            disabled={ !connected || sources.checkAllSources.isPending }
          >
            { sources.checkAllSources.isPending ? 'Checking…' : 'Check all now' }
          </Button>
          <Button
            variant="contained"
            onClick={ () => setDialog( { kind: 'add' } ) }
            disabled={ !connected }
          >
            Add source
          </Button>
        </Stack>
      </Stack>
      { !connected && (
        <Typography variant="body2" color="text.secondary">
          Connect Gmail to add or change sources. The sources below are kept.
        </Typography>
      ) }
      { failure && <Alert severity="error">{ failure.message }</Alert> }
      { sources.isLoading && <Typography role="status">Loading sources…</Typography> }
      { sources.error !== null && <Alert severity="error">{ sources.error }</Alert> }
      { !sources.isLoading && sources.error === null && (
        <GmailSourceList
          sources={ sources.sources }
          now={ sources.updatedAt }
          checkingId={ checking }
          disabled={ !connected }
          onUpdate={ ( id, body ) => sources.updateSource.mutate( { id, body } ) }
          onCheck={ ( id ) => sources.checkSource.mutate( id ) }
          onEdit={ ( source ) => setDialog( { kind: 'edit', source } ) }
          onDelete={ ( source ) => setDialog( { kind: 'delete', source } ) }
        />
      ) }
      <GmailDialogs
        dialog={ dialog }
        profiles={ profiles }
        sources={ sources }
        onClose={ handleClose }
      />
    </Stack>
  )
}
