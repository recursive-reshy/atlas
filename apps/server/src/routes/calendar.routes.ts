// Express
import { Router } from 'express'
// Controllers
import {
  getDrafts,
  patchDraft,
  postApprove,
  postApproveMatched,
  postDismiss,
} from '../controllers/calendarDrafts.controller.js'
import {
  deleteRuleById,
  getRules,
  patchRule,
  postRule,
} from '../controllers/calendarRules.controller.js'
import {
  calendarCallback,
  connectCalendar,
  deleteCalendar,
  getCalendarStatus,
  getCalendars,
  postSync,
  putSelection,
} from '../controllers/calendar.controller.js'

export const calendarRoutes: Router = Router()

calendarRoutes.get( '/calendar', getCalendarStatus )
calendarRoutes.post( '/calendar/connect', connectCalendar )
calendarRoutes.get( '/calendar/oauth/callback', calendarCallback )
calendarRoutes.get( '/calendar/calendars', getCalendars )
calendarRoutes.put( '/calendar/selection', putSelection )
calendarRoutes.delete( '/calendar', deleteCalendar )
calendarRoutes.post( '/calendar/sync', postSync )
calendarRoutes.get( '/calendar/rules', getRules )
calendarRoutes.post( '/calendar/rules', postRule )
calendarRoutes.patch( '/calendar/rules/:id', patchRule )
calendarRoutes.delete( '/calendar/rules/:id', deleteRuleById )
calendarRoutes.get( '/calendar/drafts', getDrafts )
calendarRoutes.post( '/calendar/drafts/approve-matched', postApproveMatched )
calendarRoutes.patch( '/calendar/drafts/:id', patchDraft )
calendarRoutes.post( '/calendar/drafts/:id/approve', postApprove )
calendarRoutes.post( '/calendar/drafts/:id/dismiss', postDismiss )
