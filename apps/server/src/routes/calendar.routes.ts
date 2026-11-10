// Express
import { Router } from 'express'
// Controllers
import {
  calendarCallback,
  connectCalendar,
  deleteCalendar,
  getCalendarStatus,
  getCalendars,
  putSelection,
} from '../controllers/calendar.controller.js'

export const calendarRoutes: Router = Router()

calendarRoutes.get( '/calendar', getCalendarStatus )
calendarRoutes.post( '/calendar/connect', connectCalendar )
calendarRoutes.get( '/calendar/oauth/callback', calendarCallback )
calendarRoutes.get( '/calendar/calendars', getCalendars )
calendarRoutes.put( '/calendar/selection', putSelection )
calendarRoutes.delete( '/calendar', deleteCalendar )
