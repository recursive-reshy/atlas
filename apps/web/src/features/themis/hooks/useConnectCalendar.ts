// Packages
import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// App
import { startCalendarConnect } from '../api/calendar.api'

// Connecting is a full-page trip to Google and back (ADR 0108), so it ends in `location.assign`
export function useConnectCalendar(): UseMutationResult< string, Error, void > {
  return useMutation( {
    mutationFn: () => startCalendarConnect(),
    onSuccess: ( url ) => {
      window.location.assign( url )
    },
  } )
}
