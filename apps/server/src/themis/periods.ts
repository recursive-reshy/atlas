// Config
import { config } from '../config.js'
// Melete
import { dayStart, wallTime } from '../melete/day.js'
// Shared
import type { ThemisCheckinCadence, ThemisGoalStatus } from '@atlas/shared'

// Weeks run Monday to Sunday; months and quarters are calendar ones (ADR 0092). Everything here
// works on study days as YYYY-MM-DD strings and takes the clock as an argument.

export type Period = 'week' | 'month' | 'quarter'

export type DayRange = { from: string, to: string }

const DAY_MS = 86_400_000

const pad = ( value: number ): string => String( value ).padStart( 2, '0' )

const format = ( date: Date ): string => {
  const month = pad( date.getUTCMonth() + 1 )

  return `${ date.getUTCFullYear() }-${ month }-${ pad( date.getUTCDate() ) }`
}

const parse = ( day: string ): Date => {
  const [ year, month, date ] = day.split( '-' ).map( Number )

  return new Date( Date.UTC( year, month - 1, date ) )
}

export const addDays = ( day: string, days: number ): string => {
  return format( new Date( parse( day ).getTime() + days * DAY_MS ) )
}

export const weekStart = ( day: string ): string => {
  return addDays( day, -( ( parse( day ).getUTCDay() + 6 ) % 7 ) )
}

export const monthStart = ( day: string ): string => `${ day.slice( 0, 7 ) }-01`

export const quarterStart = ( day: string ): string => {
  const month = Number( day.slice( 5, 7 ) )

  return `${ day.slice( 0, 4 ) }-${ pad( Math.floor( ( month - 1 ) / 3 ) * 3 + 1 ) }-01`
}

const monthsLater = ( start: string, months: number ): string => {
  const date = parse( start )

  return format( new Date( Date.UTC( date.getUTCFullYear(), date.getUTCMonth() + months, 1 ) ) )
}

export const periodRange = ( period: Period, day: string ): DayRange => {
  if( period === 'week' ) {
    const from = weekStart( day )

    return { from, to: addDays( from, 6 ) }
  }

  const from = period === 'month' ? monthStart( day ) : quarterStart( day )

  return { from, to: addDays( monthsLater( from, period === 'month' ? 1 : 3 ), -1 ) }
}

// The period of the cadence that finished just before `day`'s own period began
export const previousPeriod = ( cadence: ThemisCheckinCadence, day: string ): DayRange => {
  return periodRange( cadence === 'weekly' ? 'week' : 'month', addDays(
    cadence === 'weekly' ? weekStart( day ) : monthStart( day ),
    -1,
  ) )
}

export const studyDay = ( now: Date, options?: Parameters< typeof dayStart >[ 1 ] ): string => {
  const start = dayStart( now, options )
  const { year, month, day } = wallTime( start.getTime(), options?.timeZone ?? config.timeZone )

  return `${ year }-${ pad( month ) }-${ pad( day ) }`
}

export type CheckinGoal = {
  status: ThemisGoalStatus
  checkin_cadence: ThemisCheckinCadence | null
  created_day: string
}

export type DueCheckin = { period_start: string, period_end: string }

// Due from the first day of a period for the one just finished, if the goal existed before it
// ended and nothing was answered for it; an unanswered older period is a gap, not a backlog.
export const checkinDue = (
  goal: CheckinGoal,
  today: string,
  answered: string[],
): DueCheckin | null => {
  if( goal.status !== 'active' || goal.checkin_cadence === null ) {
    return null
  }

  const { from, to } = previousPeriod( goal.checkin_cadence, today )

  if( goal.created_day > to || answered.includes( from ) ) {
    return null
  }

  return { period_start: from, period_end: to }
}
