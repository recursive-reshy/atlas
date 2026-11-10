// Shared
import { ConnectCalendarResponse, SyncCalendarResponse } from '@atlas/shared'
// App
import { request } from '#src/lib/request'

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
