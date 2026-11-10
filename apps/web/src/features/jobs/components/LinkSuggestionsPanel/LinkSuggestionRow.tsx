// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import { hasWikilink, isStale } from '@atlas/shared'
import type { StoredLinkSuggestion, SuggestionKind } from '@atlas/shared'

const KIND_CHIPS = {
  existing_note: { label: 'Existing note', color: 'primary', variant: 'outlined' },
  existing_concept: { label: 'Existing concept', color: 'default', variant: 'outlined' },
  new_concept: { label: 'New concept', color: 'secondary', variant: 'filled' },
} as const satisfies Record< SuggestionKind, {
  label: string
  color: 'primary' | 'default' | 'secondary'
  variant: 'outlined' | 'filled'
} >

const DECISION_LABELS = { accepted: 'Accepted', rejected: 'Rejected' } as const

const TARGET_SX = { fontFamily: 'monospace', overflowWrap: 'anywhere' } as const

const ROW_SX = {
  display: 'block',
  px: 0,
  py: 1.5,
  borderBottom: 1,
  borderColor: 'divider',
} as const

const HEADER_SX = { flexWrap: 'wrap', alignItems: 'center' } as const

const BUTTON_SX = { '&.Mui-disabled': { pointerEvents: 'auto', cursor: 'not-allowed' } } as const

interface LinkSuggestionRowProps {
  suggestion: StoredLinkSuggestion
  note: string
  isBusy: boolean
  onAccept: ( suggestion: StoredLinkSuggestion ) => void
  onReject: ( suggestion: StoredLinkSuggestion ) => void
}

export function LinkSuggestionRow(
  { suggestion, note, isBusy, onAccept, onReject }: LinkSuggestionRowProps,
): ReactElement {
  const { target, kind, anchor, reason, status } = suggestion
  const targetText = (
    <Typography component="span" sx={ TARGET_SX }>{ `[[${ target }]]` }</Typography>
  )

  if( status === 'accepted' || status === 'rejected' ) {
    return (
      <ListItem sx={ ROW_SX }>
        <Stack direction="row" useFlexGap spacing={ 1 } sx={ { alignItems: 'center' } }>
          { targetText }
          <Typography component="span" variant="body2" color="text.secondary">
            { DECISION_LABELS[ status ] }
          </Typography>
        </Stack>
      </ListItem>
    )
  }

  const isStaleAnchor = isStale( note, suggestion )
  const goesToRelated = anchor === null || isStaleAnchor
  const chip = KIND_CHIPS[ kind ]

  return (
    <ListItem sx={ ROW_SX }>
      <Stack spacing={ 1 }>
        <Stack direction="row" useFlexGap spacing={ 1 } sx={ HEADER_SX }>
          { targetText }
          <Chip size="small" label={ chip.label } color={ chip.color } variant={ chip.variant } />
          { isStaleAnchor && <Chip size="small" color="warning" label="Stale" /> }
          { hasWikilink( note, target ) && (
            <Typography component="span" variant="body2" color="text.secondary">
              Already linked
            </Typography>
          ) }
        </Stack>
        <Typography variant="body2" color="text.secondary">
          { anchor === null ? 'Related' : `at "${ anchor }"` }
        </Typography>
        <Typography variant="body2">{ reason }</Typography>
        <Stack direction="row" useFlexGap spacing={ 1 }>
          <Button
            size="small"
            variant="contained"
            disabled={ isBusy }
            onClick={ () => onAccept( suggestion ) }
            sx={ BUTTON_SX }
          >
            { goesToRelated ? 'Add to Related' : 'Accept' }
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            disabled={ isBusy }
            onClick={ () => onReject( suggestion ) }
            sx={ BUTTON_SX }
          >
            Reject
          </Button>
        </Stack>
      </Stack>
    </ListItem>
  )
}
