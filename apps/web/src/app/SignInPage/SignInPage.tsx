// React
import type { ReactElement } from 'react'
// Packages
import { Navigate } from 'react-router'
// App
import { useMe } from '../useMe'
import { GatePage } from '../GatePage'
import { SignIn } from '../SignIn'

// The /signin route: the sign-in screen, or the app for someone already signed in.
export function SignInPage(): ReactElement {
  const { me, isLoading } = useMe()

  if( isLoading ) {
    return <GatePage title="Sign in"><p role="status">Loading…</p></GatePage>
  }

  if( me !== null ) {
    return <Navigate to="/" replace />
  }

  return <SignIn />
}
