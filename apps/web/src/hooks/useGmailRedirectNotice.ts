// React
import { useEffect, useState } from 'react'
// Packages
import { useSearchParams } from 'react-router'

interface GmailNotice {
  severity: 'success' | 'error'
  message: string
}

export interface GmailRedirectNoticeState {
  notice: GmailNotice | null
  clear: () => void
}

const FAILED = 'Connecting Gmail failed. Try again.'

const ERROR_MESSAGES: Record< string, string > = {
  denied: 'Google didn\'t grant access, so Gmail was not connected.',
  state: 'The connection request expired or wasn\'t recognised. Try connecting again.',
  no_refresh_token: 'Google didn\'t return a long-lived access. Remove Atlas at '
    + 'myaccount.google.com/permissions, then connect again.',
  scope: 'Read-only Gmail access wasn\'t granted. Connect again and allow the Gmail permission.',
  failed: FAILED,
}

const noticeFor = ( outcome: string, reason: string | null ): GmailNotice | null => {
  if( outcome === 'connected' ) {
    return { severity: 'success', message: 'Gmail connected' }
  }

  if( outcome === 'error' ) {
    return { severity: 'error', message: ERROR_MESSAGES[ reason ?? '' ] ?? FAILED }
  }

  return null
}

// The server's OAuth callback redirects to /settings?gmail=…; read once, then removed from the URL.
export function useGmailRedirectNotice(): GmailRedirectNoticeState {
  const [ params, setParams ] = useSearchParams()
  const [ notice, setNotice ] = useState< GmailNotice | null >( () => {
    const outcome = params.get( 'gmail' )

    return outcome === null ? null : noticeFor( outcome, params.get( 'reason' ) )
  } )

  useEffect( () => {
    if( !params.has( 'gmail' ) ) {
      return
    }

    setParams( ( current ) => {
      const next = new URLSearchParams( current )

      next.delete( 'gmail' )
      next.delete( 'reason' )
      return next
    }, { replace: true } )
  }, [ params, setParams ] )

  return { notice, clear: () => setNotice( null ) }
}
