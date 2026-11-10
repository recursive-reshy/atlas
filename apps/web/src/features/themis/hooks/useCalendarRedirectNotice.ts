// React
import { useEffect, useState } from 'react'
// Packages
import { useSearchParams } from 'react-router'

interface CalendarNotice {
  severity: 'success' | 'error'
  message: string
}

export interface CalendarRedirectNoticeState {
  notice: CalendarNotice | null
  clear: () => void
}

const FAILED = 'Connecting Google Calendar failed. Try again.'

const ERROR_MESSAGES: Record< string, string > = {
  denied: 'Google didn\'t grant access, so Google Calendar was not connected.',
  state: 'The connection request expired or wasn\'t recognised. Try connecting again.',
  no_refresh_token: 'Google didn\'t return a long-lived access. Remove Atlas at '
    + 'myaccount.google.com/permissions, then connect again.',
  scope: 'Calendar access wasn\'t granted. Connect again and allow the Calendar permission.',
  failed: FAILED,
}

const noticeFor = ( outcome: string, reason: string | null ): CalendarNotice | null => {
  if( outcome === 'choose' ) {
    return {
      severity: 'success',
      message: 'Google Calendar connected. Choose a calendar to import.',
    }
  }

  if( outcome === 'error' ) {
    return { severity: 'error', message: ERROR_MESSAGES[ reason ?? '' ] ?? FAILED }
  }

  return null
}

// The server's OAuth callback redirects to /settings/sources?calendar=…; read once, then removed
export function useCalendarRedirectNotice(): CalendarRedirectNoticeState {
  const [ params, setParams ] = useSearchParams()
  const [ notice, setNotice ] = useState< CalendarNotice | null >( () => {
    const outcome = params.get( 'calendar' )

    return outcome === null ? null : noticeFor( outcome, params.get( 'reason' ) )
  } )

  useEffect( () => {
    if( !params.has( 'calendar' ) ) {
      return
    }

    setParams( ( current ) => {
      const next = new URLSearchParams( current )

      next.delete( 'calendar' )
      next.delete( 'reason' )
      return next
    }, { replace: true } )
  }, [ params, setParams ] )

  return { notice, clear: () => setNotice( null ) }
}
