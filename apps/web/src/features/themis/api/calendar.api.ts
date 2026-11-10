// Shared
import {
  ApproveCalendarDraftResponse,
  ApproveMatchedResponse,
  CalendarDraftResponse,
  CalendarRuleResponse,
  ConnectCalendarResponse,
  GetCalendarResponse,
  ListCalendarDraftsResponse,
  ListCalendarRulesResponse,
  ListCalendarsResponse,
  SyncCalendarResponse,
} from '@atlas/shared'
import type {
  ApproveCalendarDraftResponse as Approved,
  CalendarChoice,
  CalendarDraft,
  CalendarRule,
  CreateCalendarRuleBody,
  SelectCalendarBody,
  UpdateCalendarDraftBody,
  UpdateCalendarRuleBody,
} from '@atlas/shared'
// App
import { request, send } from '#src/lib/request'

const jsonInit = ( method: string, body: unknown ): RequestInit => ( {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify( body ),
} )

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
  return request( '/api/calendar/selection', GetCalendarResponse, jsonInit( 'PUT', body ) )
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

const draftUrl = ( id: string ): string => `/api/calendar/drafts/${ encodeURIComponent( id ) }`
const ruleUrl = ( id: string ): string => `/api/calendar/rules/${ encodeURIComponent( id ) }`

export const listDrafts = async (): Promise< CalendarDraft[] > => {
  const { drafts } = await request( '/api/calendar/drafts', ListCalendarDraftsResponse )

  return drafts
}

export const updateDraft = async (
  id: string,
  body: UpdateCalendarDraftBody,
): Promise< CalendarDraft > => {
  const { draft } = await request(
    draftUrl( id ),
    CalendarDraftResponse,
    jsonInit( 'PATCH', body ),
  )

  return draft
}

export const approveDraft = async ( id: string ): Promise< Approved > => {
  return request( `${ draftUrl( id ) }/approve`, ApproveCalendarDraftResponse, { method: 'POST' } )
}

export const approveMatched = async (): Promise< number > => {
  const { approved } = await request(
    '/api/calendar/drafts/approve-matched',
    ApproveMatchedResponse,
    { method: 'POST' },
  )

  return approved
}

export const dismissDraft = async ( id: string ): Promise< void > => {
  await send( `${ draftUrl( id ) }/dismiss`, { method: 'POST' } )
}

export const listRules = async (): Promise< CalendarRule[] > => {
  const { rules } = await request( '/api/calendar/rules', ListCalendarRulesResponse )

  return rules
}

export const createRule = async ( body: CreateCalendarRuleBody ): Promise< CalendarRule > => {
  const { rule } = await request(
    '/api/calendar/rules',
    CalendarRuleResponse,
    jsonInit( 'POST', body ),
  )

  return rule
}

export const updateRule = async (
  id: string,
  body: UpdateCalendarRuleBody,
): Promise< CalendarRule > => {
  const { rule } = await request( ruleUrl( id ), CalendarRuleResponse, jsonInit( 'PATCH', body ) )

  return rule
}

export const deleteRule = async ( id: string ): Promise< void > => {
  await send( ruleUrl( id ), { method: 'DELETE' } )
}
