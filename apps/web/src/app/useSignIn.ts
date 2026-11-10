// Packages
import { useLocation } from 'react-router'

// Sign-in is a full-page trip to Google and back (ADR 0068), so it ends in `location.assign`.
export function useSignIn(): () => void {
  const { pathname, search } = useLocation()
  const returnTo = pathname === '/signin' ? '/' : `${ pathname }${ search }`

  return () => {
    window.location.assign( `/api/auth/google?returnTo=${ encodeURIComponent( returnTo ) }` )
  }
}
