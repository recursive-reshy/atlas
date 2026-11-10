// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import type { PromptVersionSource } from '@atlas/shared'
// App
import { usePromptVersions } from '#src/features/settings/hooks/usePromptVersions'

const SOURCE_LABELS: Record< PromptVersionSource, string > = {
  seed: 'Shipped default',
  edit: 'Edit',
  restore: 'Restore',
  reset: 'Reset',
}

const VIEW_SX = { '& textarea': { fontFamily: 'monospace', fontSize: '0.8125rem' } } as const

const formatDate = ( iso: string ): string => {
  return new Date( iso ).toLocaleDateString( 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  } )
}

interface PromptHistoryProps {
  profileId: string
  currentVersionId: number
  isRestoring: boolean
  error: string | null
  onRestore: ( versionId: number ) => void
}

export function PromptHistory(
  { profileId, currentVersionId, isRestoring, error, onRestore }: PromptHistoryProps,
): ReactElement {
  const { versions, isLoading, error: loadError } = usePromptVersions( profileId )
  const [ viewedId, setViewedId ] = useState< number | null >( null )
  const viewed = versions.find( ( { id } ) => id === viewedId )

  return (
    <Stack spacing={ 1 }>
      <Typography variant="subtitle1" component="h4">History</Typography>
      { isLoading && <Typography role="status">Loading history…</Typography> }
      { loadError !== null && <Alert severity="error">{ loadError }</Alert> }
      <List dense disablePadding>
        { versions.map( ( { id, version, source, created_at, guidance } ) => (
          <ListItemButton
            key={ id }
            selected={ id === viewedId }
            onClick={ () => setViewedId( id ) }
          >
            <ListItemText
              primary={ (
                <>
                  { `v${ version } ` }
                  { id === currentVersionId && (
                    <Typography component="span" variant="caption" color="primary">
                      current
                    </Typography>
                  ) }
                </>
              ) }
              secondary={ `${ SOURCE_LABELS[ source ] } · ${ formatDate( created_at ) } · ${
                guidance.split( '\n' )[ 0 ] ?? ''
              }` }
            />
          </ListItemButton>
        ) ) }
      </List>
      { viewed !== undefined && (
        <>
          <TextField
            label={ `Version ${ viewed.version }` }
            value={ viewed.guidance }
            multiline
            maxRows={ 14 }
            slotProps={ { htmlInput: { readOnly: true } } }
            sx={ VIEW_SX }
          />
          { error !== null && <Alert severity="error">{ error }</Alert> }
          { viewed.id !== currentVersionId && (
            <Button
              variant="outlined"
              onClick={ () => onRestore( viewed.id ) }
              disabled={ isRestoring }
              sx={ { alignSelf: 'flex-start' } }
            >
              Restore this version
            </Button>
          ) }
        </>
      ) }
    </Stack>
  )
}
