// Shared
import type {
  CalendarChoice,
  GetCalendarResponse,
  SelectCalendarBody,
} from '@atlas/shared'
// Calendar
import {
  CalendarAuthError,
  CalendarNotConnectedError,
  MissingCalendarScopeError,
  MissingRefreshTokenError,
  OAuthStateError,
  completeConsent,
  createConsentUrl,
  disconnect,
} from '../calendar/auth.js'
import { findCalendar, listCalendars as listFromGoogle } from '../calendar/calendar.client.js'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Logging
import { logger } from '../logger.js'
// Repositories
import { deleteDrafts, removeImported } from '../repositories/calendarEvents.repository.js'
import {
  findCalendarAccount,
  selectCalendar,
} from '../repositories/calendarAccount.repository.js'
import type { StoredCalendarAccount } from '../repositories/calendarAccount.repository.js'
// Themis
import { addDays, studyDay } from '../themis/periods.js'

export type ConsentFailure = 'denied' | 'state' | 'no_refresh_token' | 'scope' | 'failed'

const NOT_CONFIGURED = 'Calendar isn\'t configured'
const NOT_CONNECTED = 'Calendar isn\'t connected'
const MAX_DAYS_BACK = 365

const isConfigured = (): boolean => config.gmail !== null && config.calendar.redirectUri !== null

const requireConfigured = (): void => {
  if( !isConfigured() ) {
    throw new ConflictError( NOT_CONFIGURED )
  }
}

export const getCalendar = ( userId: string ): GetCalendarResponse => {
  if( !isConfigured() ) {
    return { status: 'not_configured' }
  }

  const account = findCalendarAccount( userId )

  if( account === undefined ) {
    return { status: 'not_connected' }
  }

  return {
    status: account.status === 'broken' ? 'broken' : 'connected',
    email: account.email,
    ...account.calendar_id === null
      ? {}
      : {
        calendar: {
          id: account.calendar_id,
          name: account.calendar_name ?? account.calendar_id,
        },
      },
    ...account.import_from === null ? {} : { import_from: account.import_from },
    ...account.last_synced_at === null ? {} : { last_synced_at: account.last_synced_at },
    ...account.error === null ? {} : { error: account.error },
  }
}

export const startConnect = ( userId: string ): string => {
  requireConfigured()

  return createConsentUrl( userId )
}

const failureFor = ( error: unknown ): ConsentFailure => {
  if( error instanceof OAuthStateError ) {
    return 'state'
  }

  if( error instanceof MissingRefreshTokenError ) {
    return 'no_refresh_token'
  }

  if( error instanceof MissingCalendarScopeError ) {
    return 'scope'
  }

  logger.error( 'Calendar: completing the consent failed' )

  return 'failed'
}

export const finishConnect = async (
  userId: string,
  { code, state, error }: { code?: string, state?: string, error?: string },
): Promise< ConsentFailure | null > => {
  if( !isConfigured() ) {
    return 'failed'
  }

  if( error !== undefined ) {
    return error === 'access_denied' ? 'denied' : 'failed'
  }

  if( state === undefined ) {
    return 'state'
  }

  if( code === undefined ) {
    return 'failed'
  }

  try {
    await completeConsent( userId, { code, state } )

    return null
  } catch( failure ) {
    return failureFor( failure )
  }
}

// A connection the person must fix is a conflict they can read, not a server error
const asConflict = ( error: unknown ): unknown => {
  return error instanceof CalendarNotConnectedError || error instanceof CalendarAuthError
    ? new ConflictError( error.message )
    : error
}

const requireAccount = ( userId: string ): StoredCalendarAccount => {
  const account = findCalendarAccount( userId )

  if( account === undefined ) {
    throw new ConflictError( NOT_CONNECTED )
  }

  return account
}

export const listCalendars = async ( userId: string ): Promise< CalendarChoice[] > => {
  requireConfigured()
  requireAccount( userId )

  try {
    return await listFromGoogle( userId )
  } catch( error ) {
    throw asConflict( error )
  }
}

const checkImportDay = ( day: string ): void => {
  const today = studyDay( new Date() )

  if( day > today ) {
    throw new ValidationError( 'The day to import from can\'t be in the future' )
  }

  if( day < addDays( today, -MAX_DAYS_BACK ) ) {
    throw new ValidationError(
      `The day to import from can't be more than ${ MAX_DAYS_BACK } days back`,
    )
  }
}

// Choosing another calendar drops the old one's drafts; its approved and dismissed events stay
export const chooseCalendar = async (
  userId: string,
  { calendar_id, import_from }: SelectCalendarBody,
): Promise< GetCalendarResponse > => {
  requireConfigured()

  const account = requireAccount( userId )

  checkImportDay( import_from )

  let calendar: { id: string, name: string }

  try {
    calendar = await findCalendar( userId, calendar_id )
  } catch( error ) {
    throw ( error as { code?: unknown } ).code === 404
      ? new NotFoundError( 'Calendar not found' )
      : asConflict( error )
  }

  if( account.calendar_id !== null && account.calendar_id !== calendar.id ) {
    deleteDrafts( userId, account.calendar_id )
  }

  selectCalendar( userId, calendar, import_from )

  return getCalendar( userId )
}

export const disconnectCalendar = async (
  userId: string,
  removeTime: boolean,
): Promise< void > => {
  requireConfigured()

  const calendarId = findCalendarAccount( userId )?.calendar_id ?? null

  await disconnect( userId )

  if( removeTime && calendarId !== null ) {
    removeImported( userId, calendarId )
  }
}
