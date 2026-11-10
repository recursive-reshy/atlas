// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useSearchParams } from 'react-router'
// App
import { useSignIn } from '../useSignIn'
import { GatePage } from '../GatePage'

const FAILED = 'Sign-in failed. Try again.'

const ERRORS: Record< string, string > = {
  not_allowed: 'This Google account is not allowed. Ask the admin to add it.',
  expired: 'Sign-in took too long. Try again.',
  failed: FAILED,
}

export function SignIn(): ReactElement {
  const signIn = useSignIn()
  const [ params ] = useSearchParams()
  const code = params.get( 'error' )

  return (
    <GatePage title="Sign in">
      { code !== null && <Alert severity="error">{ ERRORS[ code ] ?? FAILED }</Alert> }
      <Typography color="text.secondary">
        Use the Google account the admin added for you.
      </Typography>
      <Button variant="contained" size="large" onClick={ signIn }>Sign in with Google</Button>
    </GatePage>
  )
}
