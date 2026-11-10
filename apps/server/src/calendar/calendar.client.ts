// Shared
import type { CalendarChoice } from '@atlas/shared'
// Calendar
import { withCalendar } from './auth.js'

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
