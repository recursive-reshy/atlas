// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'

// As elsewhere: a disabled button still takes the pointer, so its tooltip can explain why.
const DELETE_SX = { '&.Mui-disabled': { pointerEvents: 'auto', cursor: 'not-allowed' } } as const

interface ProfileActionsProps {
  deleteBlockedReason: string | null
  onNew: () => void
  onRename: () => void
  onDelete: () => void
  // The list also offers these; without a selected summary profile only New profile applies.
  onSetDefault?: () => void
  isDefault?: boolean
  hasProfile?: boolean
}

export function ProfileActions(
  {
    deleteBlockedReason,
    onNew,
    onRename,
    onDelete,
    onSetDefault,
    isDefault = false,
    hasProfile = true,
  }: ProfileActionsProps,
): ReactElement {
  return (
    <Stack direction="row" useFlexGap spacing={ 1 } sx={ { flexWrap: 'wrap' } }>
      <Button variant="outlined" onClick={ onNew }>New profile</Button>
      { hasProfile && <Button variant="outlined" onClick={ onRename }>Rename</Button> }
      { hasProfile && onSetDefault !== undefined && (
        <Button variant="outlined" onClick={ onSetDefault } disabled={ isDefault }>
          Set as default
        </Button>
      ) }
      { hasProfile && (
        <Tooltip title={ deleteBlockedReason ?? '' }>
          <span>
            <Button
              variant="outlined"
              color="error"
              onClick={ onDelete }
              disabled={ deleteBlockedReason !== null }
              sx={ DELETE_SX }
            >
              Delete
            </Button>
          </span>
        </Tooltip>
      ) }
    </Stack>
  )
}
