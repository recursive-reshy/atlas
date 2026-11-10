// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'

const ACTIONS_SX = { flexWrap: 'wrap', pt: 2, borderTop: 1, borderColor: 'divider' } as const

// As in 0.3.0: a disabled button still takes the pointer and shows not-allowed.
const BUTTON_SX = { '&.Mui-disabled': { pointerEvents: 'auto', cursor: 'not-allowed' } } as const

interface ReviewActionsProps {
  hasFailed: boolean
  canSave: boolean
  isSaving: boolean
  isRetrying: boolean
  isDiscarding: boolean
  isRegenerating: boolean
  onSave: () => void
  onRetry: () => void
  onDiscard: () => void
  onRegenerate: () => void
}

export function ReviewActions(
  {
    hasFailed,
    canSave,
    isSaving,
    isRetrying,
    isDiscarding,
    isRegenerating,
    onSave,
    onRetry,
    onDiscard,
    onRegenerate,
  }: ReviewActionsProps,
): ReactElement {
  return (
    <Stack direction="row" useFlexGap spacing={ 2 } sx={ ACTIONS_SX }>
      { hasFailed
        ? (
          <Button variant="contained" disabled={ isRetrying } onClick={ onRetry } sx={ BUTTON_SX }>
            { isRetrying ? 'Retrying…' : 'Retry summary' }
          </Button>
        )
        : (
          <Button
            variant="contained"
            disabled={ isSaving || !canSave }
            onClick={ onSave }
            sx={ BUTTON_SX }
          >
            { isSaving ? 'Saving…' : 'Save to vault' }
          </Button>
        ) }
      { !hasFailed && (
        <Button
          variant="outlined"
          disabled={ isRegenerating }
          onClick={ onRegenerate }
          sx={ BUTTON_SX }
        >
          Regenerate summary
        </Button>
      ) }
      <Button
        variant="outlined"
        color="inherit"
        disabled={ isDiscarding }
        onClick={ onDiscard }
        sx={ BUTTON_SX }
      >
        Discard
      </Button>
    </Stack>
  )
}
