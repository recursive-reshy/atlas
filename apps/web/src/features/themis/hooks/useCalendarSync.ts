// React
import { useEffect } from 'react'
// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
// App
import { syncCalendar } from '../api/calendar.api'
import { calendarKeys, themisKeys } from '#src/lib/queryKeys'

// A read under this many seconds old is skipped by the server
const FRESH_SECONDS = 300

// Opening Home reads the calendar once when it is connected; the page never waits for it and a
// failure stays in the Status panel (ADR 0109)
export function useCalendarSync( isConnected: boolean ): void {
  const queryClient = useQueryClient()
  const { mutate } = useMutation( {
    mutationFn: () => syncCalendar( FRESH_SECONDS ),
    onSuccess: async () => {
      await queryClient.invalidateQueries( { queryKey: themisKeys.all } )
      await queryClient.invalidateQueries( { queryKey: calendarKeys.all } )
    },
  } )

  useEffect( () => {
    if( isConnected ) {
      mutate()
    }
  }, [ isConnected, mutate ] )
}
