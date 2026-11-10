// Shared
import {
  ConnectCalendarResponse,
  GetCalendarResponse,
  ListCalendarsResponse,
  SyncCalendarResponse,
} from '@atlas/shared'
import type { CalendarChoice, SelectCalendarBody } from '@atlas/shared'
// App
import { request, send } from '#src/lib/request'

export const getCalendar = async (): Promise< GetCalendarResponse > => {
  return request( '/api/calendar', GetCalendarResponse )
}

export const listCalendars = async (): Promise< CalendarChoice[] > => {
  const { calendars } = await request( '/api/calendar/calendars', ListCalendarsResponse )

  return calendars
}

export const selectCalendar = async (
  body: SelectCalendarBody,
): Promise< GetCalendarResponse > => {
  return request( '/api/calendar/selection', GetCalendarResponse, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  } )
}

// Imported time is kept unless `removeTime` is true
export const disconnectCalendar = async ( removeTime: boolean ): Promise< void > => {
  await send( `/api/calendar?remove_time=${ removeTime }`, { method: 'DELETE' } )
}

export const startCalendarConnect = async (): Promise< string > => {
  const { url } = await request(
    '/api/calendar/connect',
    ConnectCalendarResponse,
    { method: 'POST' },
  )

  return url
}

// `ifOlderThan` skips the read when the last one is newer than that many seconds
export const syncCalendar = async ( ifOlderThan?: number ): Promise< SyncCalendarResponse > => {
  const query = ifOlderThan === undefined ? '' : `?if_older_than=${ ifOlderThan }`

  return request( `/api/calendar/sync${ query }`, SyncCalendarResponse, { method: 'POST' } )
}
