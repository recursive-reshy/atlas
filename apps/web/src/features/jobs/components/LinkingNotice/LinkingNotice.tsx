// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { AgentStatus, LinkState } from '@atlas/shared'

const BUTTON_SX = { '&.Mui-disabled': { pointerEvents: 'auto', cursor: 'not-allowed' } } as const

interface LinkingNoticeProps {
  linkState: LinkState | null
  linkError: string | null
  agentStatus: AgentStatus | null
  isRunning: boolean
  error: string | null
  onRun: () => void
}

export function LinkingNotice(
  { linkState, linkError, agentStatus, isRunning, error, onRun }: LinkingNoticeProps,
): ReactElement | null {
  const retryButton = (
    <Button
      size="small"
      color="inherit"
      disabled={ isRunning }
      onClick={ onRun }
      sx={ BUTTON_SX }
    >
      Retry linking
    </Button>
  )

  if( linkState === 'failed' ) {
    return (
      <Stack spacing={ 1 }>
        <Alert severity="warning" action={ retryButton }>{ linkError ?? 'Linking failed.' }</Alert>
        { error !== null && <Alert severity="error">{ error }</Alert> }
      </Stack>
    )
  }

  if( linkState !== 'off' || agentStatus === null ) {
    return null
  }

  return (
    <Stack spacing={ 1 } sx={ { alignItems: 'flex-start' } }>
      { agentStatus === 'not_configured'
        ? (
          <Typography variant="body2" color="text.secondary">
            { 'Linking isn\'t set up. Add the agent service in ' }
            <Link component={ RouterLink } to="/settings/models">Settings</Link>
            { '.' }
          </Typography>
        )
        : (
          <Button
            size="small"
            variant="outlined"
            disabled={ isRunning }
            onClick={ onRun }
            sx={ BUTTON_SX }
          >
            Run linking
          </Button>
        ) }
      { error !== null && <Alert severity="error">{ error }</Alert> }
    </Stack>
  )
}
