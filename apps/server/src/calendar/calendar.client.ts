// Shared
import type { CalendarChoice } from '@atlas/shared'
// Calendar
import { withCalendar } from './auth.js'
import type { IncomingEvent } from './reconcile.js'

const nameOf = ( { summaryOverride, summary, id }: {
  summaryOverride?: string | null
  summary?: string | null
  id?: string | null
} ): string => summaryOverride ?? summary ?? id ?? ''

// Every calendar the account can read, across pages, primary first, then by name
export const listCalendars = ( userId: string ): Promise< CalendarChoice[] > => {
  return withCalendar( userId, async ( client ) => {
    const found: CalendarChoice[] = []
    let pageToken: string | undefined

    do {
      const { data } = await client.calendarList.list( { pageToken, maxResults: 250 } )

      for( const item of data.items ?? [] ) {
        if( item.id ) {
          found.push( { id: item.id, name: nameOf( item ), primary: item.primary === true } )
        }
      }

      pageToken = data.nextPageToken ?? undefined
    } while( pageToken !== undefined )

    return found.sort( ( a, b ) => Number( b.primary ) - Number( a.primary )
      || a.name.localeCompare( b.name, undefined, { sensitivity: 'base' } ) )
  } )
}

// A calendar of this account; Google's 404 means it isn't one
export const findCalendar = (
  userId: string,
  calendarId: string,
): Promise< { id: string, name: string } > => {
  return withCalendar( userId, async ( client ) => {
    const { data } = await client.calendarList.get( { calendarId } )

    return { id: data.id ?? calendarId, name: nameOf( data ) }
  } )
}

// Timed events that overlap the window, recurring ones expanded, across every page. Only the
// title and the times are kept (ADR 0108); all-day and cancelled events are left out. Any
// failure rejects, so a sync never works from half a read.
export const listEvents = (
  userId: string,
  calendarId: string,
  from: Date,
  to: Date,
): Promise< IncomingEvent[] > => {
  return withCalendar( userId, async ( client ) => {
    const found: IncomingEvent[] = []
    let pageToken: string | undefined

    do {
      const { data } = await client.events.list( {
        calendarId,
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,
        showDeleted: false,
        maxResults: 250,
        pageToken,
      } )

      for( const item of data.items ?? [] ) {
        const start = item.start?.dateTime
        const end = item.end?.dateTime

        if( item.id && start && end && item.status !== 'cancelled' ) {
          found.push( {
            event_id: item.id,
            title: item.summary ?? '',
            started_at: new Date( start ).toISOString(),
            ended_at: new Date( end ).toISOString(),
          } )
        }
      }

      pageToken = data.nextPageToken ?? undefined
    } while( pageToken !== undefined )

    return found
  } )
}
