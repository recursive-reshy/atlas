// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { StoredLinkSuggestion } from '@atlas/shared'
// App
import { LinkSuggestionRow } from './LinkSuggestionRow'

interface LinkSuggestionsPanelProps {
  suggestions: StoredLinkSuggestion[]
  note: string
  isBusy: boolean
  error: string | null
  onAccept: ( suggestion: StoredLinkSuggestion ) => void
  onReject: ( suggestion: StoredLinkSuggestion ) => void
  onAcceptAll: () => void
  onRejectAll: () => void
}

export function LinkSuggestionsPanel(
  {
    suggestions,
    note,
    isBusy,
    error,
    onAccept,
    onReject,
    onAcceptAll,
    onRejectAll,
  }: LinkSuggestionsPanelProps,
): ReactElement {
  const ordered = [ ...suggestions ].sort( ( a, b ) => a.position - b.position )
  const pendingCount = suggestions.filter( ( { status } ) => status === 'pending' ).length

  return (
    <Stack component="section" aria-label="Suggested links" spacing={ 1 }>
      <Typography role="status" variant="body2" color="text.secondary">
        { suggestions.length === 0 ? 'No suggested links.' : `${ pendingCount } pending` }
      </Typography>
      { pendingCount >= 2 && (
        <Stack direction="row" useFlexGap spacing={ 1 }>
          <Button size="small" variant="outlined" disabled={ isBusy } onClick={ onAcceptAll }>
            Accept all
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            disabled={ isBusy }
            onClick={ onRejectAll }
          >
            Reject all
          </Button>
        </Stack>
      ) }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      <List disablePadding>
        { ordered.map( ( suggestion ) => (
          <LinkSuggestionRow
            key={ suggestion.id }
            suggestion={ suggestion }
            note={ note }
            isBusy={ isBusy }
            onAccept={ onAccept }
            onReject={ onReject }
          />
        ) ) }
      </List>
    </Stack>
  )
}
