// Shared
import { ModuleId, UsageCategory } from '@atlas/shared'
import type {
  AdminUser,
  CreateUserBody,
  UpdateUserBody,
  UsageResponse,
  UsageTotals,
  UserUsage,
} from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Repositories
import { inTransaction } from '../repositories/database.js'
import { deleteSessionsForUser } from '../repositories/sessions.repository.js'
import { listModules, setModules } from '../repositories/userModules.repository.js'
import {
  clearVaultDir,
  deleteUser,
  findUserById,
  insertUser,
  listUsers,
  updateUser,
} from '../repositories/users.repository.js'
import type { StoredUser } from '../repositories/users.repository.js'
import { transcriptionSeconds, usageTotals } from '../repositories/system.repository.js'
import type { UsageRange, UsageRow } from '../repositories/system.repository.js'
// Melete
import { instantAt, wallTime } from '../melete/day.js'
// Services
import { seedUser } from './seedUser.service.js'
import { releaseVaultFolder } from './vaultOnboarding.service.js'

const toAdminUser = ( user: StoredUser ): AdminUser => ( {
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  status: user.status,
  modules: user.role === 'admin' ? ModuleId.options : listModules( user.id ),
  vault_dir: user.vault_dir,
  last_signin_at: user.last_signin_at,
  created_at: user.created_at,
} )

// The admin can't be changed here, and nobody else is found by an unknown ID
const targetOf = ( adminId: string, id: string ): StoredUser => {
  const user = findUserById( id )

  if( user === undefined ) {
    throw new NotFoundError( 'User not found' )
  }

  if( user.id === adminId ) {
    throw new ConflictError( 'You can\'t change your own account here' )
  }

  return user
}

export const listAdminUsers = (): AdminUser[] => listUsers().map( toAdminUser )

export const createUser = ( body: CreateUserBody, now: Date ): AdminUser => {
  const id = crypto.randomUUID()

  return inTransaction( () => {
    const inserted = insertUser( {
      id,
      email: body.email,
      name: body.name,
      role: 'member',
      status: 'active',
      created_at: now.toISOString(),
    } )

    if( !inserted.ok ) {
      throw new ConflictError( 'That email is already a user' )
    }

    setModules( id, body.modules )
    seedUser( id, now.toISOString() )

    const created = findUserById( id )

    if( created === undefined ) {
      throw new NotFoundError( 'User not found' )
    }

    return toAdminUser( created )
  } )
}

export const changeUser = ( adminId: string, id: string, body: UpdateUserBody ): AdminUser => {
  targetOf( adminId, id )

  return inTransaction( () => {
    updateUser( id, { name: body.name, status: body.status } )

    if( body.modules !== undefined ) {
      setModules( id, body.modules )
    }

    if( body.status === 'removed' ) {
      deleteSessionsForUser( id )
    }

    return toAdminUser( targetOf( adminId, id ) )
  } )
}

export const resetVault = ( adminId: string, id: string ): AdminUser => {
  const { vault_dir: vaultDir } = targetOf( adminId, id )

  clearVaultDir( id )
  releaseVaultFolder( vaultDir )

  return toAdminUser( targetOf( adminId, id ) )
}

export const deleteUserAccount = ( adminId: string, id: string, confirm: string ): void => {
  const user = targetOf( adminId, id )

  if( user.status !== 'removed' ) {
    throw new ConflictError( 'Remove the user before deleting them' )
  }

  if( confirm !== user.email ) {
    throw new ValidationError( 'Type the user\'s email to confirm' )
  }

  deleteUser( id )
  releaseVaultFolder( user.vault_dir )
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

const currentMonth = ( now: Date, timeZone: string ): string => {
  const { year, month } = wallTime( now.getTime(), timeZone )

  return `${ year }-${ String( month ).padStart( 2, '0' ) }`
}

// The month's first and next-month's first instants on the zone's clock, as UTC ISO strings
const monthBounds = ( month: string, timeZone: string ): { from: string, to: string } => {
  const [ , year, number ] = MONTH.exec( month ) ?? []
  const start = instantAt( Number( year ), Number( number ), 1, 0, timeZone )
  const next = instantAt( Number( year ), Number( number ) + 1, 1, 0, timeZone )

  return { from: new Date( start ).toISOString(), to: new Date( next ).toISOString() }
}

const emptyTotals = (): UsageTotals => ( {
  input_tokens: 0,
  output_tokens: 0,
  cost_usd: null,
  runs: 0,
} )

const categoriesOf = ( rows: UsageRow[], userId: string ): UserUsage[ 'month' ] => {
  const totals = Object.fromEntries(
    UsageCategory.options.map( ( category ) => [ category, emptyTotals() ] ),
  ) as UserUsage[ 'month' ]

  for( const { user_id, category, ...sums } of rows ) {
    if( user_id === userId ) {
      totals[ category ] = sums
    }
  }

  return totals
}

// Month defaults to the current one on the app's clock; every user appears, idle or removed
export const getUsage = (
  month: string | undefined,
  now: Date,
  timeZone: string = config.timeZone,
): UsageResponse => {
  const chosen = month ?? currentMonth( now, timeZone )

  if( !MONTH.test( chosen ) ) {
    throw new ValidationError( 'month must look like 2026-10' )
  }

  const range: UsageRange = monthBounds( chosen, timeZone )
  const monthRows = usageTotals( range )
  const allRows = usageTotals( null )
  const monthSeconds = transcriptionSeconds( range )
  const allSeconds = transcriptionSeconds( null )

  return {
    month: chosen,
    time_zone: timeZone,
    users: listUsers().map( ( { id } ) => ( {
      user_id: id,
      month: categoriesOf( monthRows, id ),
      all_time: categoriesOf( allRows, id ),
      transcription: {
        month_seconds: monthSeconds.get( id ) ?? 0,
        all_time_seconds: allSeconds.get( id ) ?? 0,
      },
    } ) ),
  }
}
