// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  ConnectCalendarResponse,
  GetCalendarResponse,
  ListCalendarsResponse,
  SelectCalendarBody,
} from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  chooseCalendar,
  disconnectCalendar,
  finishConnect,
  getCalendar,
  listCalendars,
  startConnect,
} from '../services/calendar.service.js'

const CallbackQuery = z.object( {
  code: z.string().min( 1 ).optional(),
  state: z.string().min( 1 ).optional(),
  error: z.string().min( 1 ).optional(),
} )

const DisconnectQuery = z.object( {
  remove_time: z.enum( [ 'true', 'false' ] ).default( 'false' ).transform( ( v ) => v === 'true' ),
} )

export const getCalendarStatus = ( req: Request, res: Response< GetCalendarResponse > ): void => {
  res.status( 200 ).json( getCalendar( currentUser( req ).id ) )
}

export const connectCalendar = ( req: Request, res: Response< ConnectCalendarResponse > ): void => {
  res.status( 200 ).json( { url: startConnect( currentUser( req ).id ) } )
}

export const calendarCallback = async ( req: Request, res: Response ): Promise< void > => {
  const parsed = CallbackQuery.safeParse( req.query )
  const failure = parsed.success
    ? await finishConnect( currentUser( req ).id, parsed.data )
    : 'failed'

  res.redirect(
    302,
    failure === null
      ? '/settings/sources?calendar=choose'
      : `/settings/sources?calendar=error&reason=${ failure }`,
  )
}

export const getCalendars = async (
  req: Request,
  res: Response< ListCalendarsResponse >,
): Promise< void > => {
  res.status( 200 ).json( { calendars: await listCalendars( currentUser( req ).id ) } )
}

export const putSelection = async (
  req: Request,
  res: Response< GetCalendarResponse >,
): Promise< void > => {
  res.status( 200 ).json(
    await chooseCalendar( currentUser( req ).id, SelectCalendarBody.parse( req.body ) ),
  )
}

export const deleteCalendar = async ( req: Request, res: Response ): Promise< void > => {
  const { remove_time } = DisconnectQuery.parse( req.query )

  await disconnectCalendar( currentUser( req ).id, remove_time )
  res.status( 204 ).end()
}
