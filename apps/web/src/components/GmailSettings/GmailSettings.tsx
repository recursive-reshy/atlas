// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { GmailAccount } from '@atlas/shared'
// App
import { GMAIL_CONNECT_URL } from '#src/api/gmail.api'
import { useGmailAccount } from '#src/hooks/useGmailAccount'
import { useGmailRedirectNotice } from '#src/hooks/useGmailRedirectNotice'
import { ConfirmDialog } from '../ConfirmDialog'
import { GmailSources } from '../GmailSources'

const DISCONNECT_MESSAGE = 'Mnemosyne will revoke its access and forget the stored credentials. '
  + 'Your sources, inbox items and collected jobs are kept.'
const SETUP_URL = 'https://github.com/recursive-reshy/mnemosyne#google-cloud-setup-for-gmail'

interface AccountCardProps {
  account: GmailAccount
  onDisconnect: () => void
}

function AccountCard( { account, onDisconnect }: AccountCardProps ): ReactElement {
  if( account.status === 'not_configured' ) {
    return (
      <Typography>
        Gmail isn&apos;t set up. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
        TOKEN_ENCRYPTION_KEY to .env and restart the app. See the{ ' ' }
        <Link href={ SETUP_URL } target="_blank" rel="noreferrer">setup steps</Link>.
      </Typography>
    )
  }

  if( account.status === 'not_connected' ) {
    return (
      <Stack direction="row" spacing={ 2 } sx={ { alignItems: 'center' } }>
        <Typography color="text.secondary">Not connected</Typography>
        <Button variant="contained" component="a" href={ GMAIL_CONNECT_URL }>
          Connect Gmail
        </Button>
      </Stack>
    )
  }

  if( account.status === 'reconnect_needed' ) {
    return (
      <Alert
        severity="warning"
        action={ <Button component="a" href={ GMAIL_CONNECT_URL }>Reconnect</Button> }
      >
        Reconnect needed. { account.error }
      </Alert>
    )
  }

  return (
    <Stack direction="row" spacing={ 2 } sx={ { alignItems: 'center' } }>
      <Typography>{ `Connected as ${ account.email ?? '' }` }</Typography>
      <Button variant="outlined" onClick={ onDisconnect }>Disconnect</Button>
    </Stack>
  )
}

export function GmailSettings(): ReactElement {
  const { account, isLoading, error, disconnect } = useGmailAccount()
  const { notice, clear } = useGmailRedirectNotice()
  const [ isConfirming, setIsConfirming ] = useState( false )

  const handleConfirm = (): void => {
    setIsConfirming( false )
    disconnect.mutate()
  }

  return (
    <Stack spacing={ 2 }>
      <Typography variant="h6" component="h3">Gmail</Typography>
      { isLoading && <Typography role="status">Loading Gmail…</Typography> }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { disconnect.isError && <Alert severity="error">{ disconnect.error?.message }</Alert> }
      { account !== null && (
        <AccountCard account={ account } onDisconnect={ () => setIsConfirming( true ) } />
      ) }
      { account !== null && account.status !== 'not_configured' && (
        <GmailSources connected={ account.status === 'connected' } />
      ) }
      <ConfirmDialog
        open={ isConfirming }
        title="Disconnect Gmail?"
        message={ DISCONNECT_MESSAGE }
        confirmLabel="Disconnect Gmail"
        onConfirm={ handleConfirm }
        onCancel={ () => setIsConfirming( false ) }
      />
      <Snackbar
        open={ notice !== null }
        autoHideDuration={ 8000 }
        onClose={ clear }
        anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } }
      >
        <Alert severity={ notice?.severity ?? 'info' } onClose={ clear }>
          { notice?.message }
        </Alert>
      </Snackbar>
    </Stack>
  )
}
