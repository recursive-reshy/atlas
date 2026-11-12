// Node
import { readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import * as calendarAccount from './calendarAccount.repository.js'
import * as calendarEvents from './calendarEvents.repository.js'
import * as calendarRules from './calendarRules.repository.js'
import * as extractionRuns from './extractionRuns.repository.js'
import * as feedItems from './feedItems.repository.js'
import * as feeds from './feeds.repository.js'
import * as gmailAccount from './gmailAccount.repository.js'
import * as gmailMessages from './gmailMessages.repository.js'
import * as gmailSources from './gmailSources.repository.js'
import * as health from './health.repository.js'
import * as jobStore from './jobStore.repository.js'
import * as linkRuns from './linkRuns.repository.js'
import * as linkSuggestions from './linkSuggestions.repository.js'
import * as meleteConcepts from './meleteConcepts.repository.js'
import * as meleteNoteConcepts from './meleteNoteConcepts.repository.js'
import * as meleteNotes from './meleteNotes.repository.js'
import * as meleteQuestions from './meleteQuestions.repository.js'
import * as meleteReviews from './meleteReviews.repository.js'
import * as meleteRuns from './meleteRuns.repository.js'
import * as meleteSections from './meleteSections.repository.js'
import * as meleteSubjects from './meleteSubjects.repository.js'
import * as postings from './postings.repository.js'
import * as promptProfiles from './promptProfiles.repository.js'
import * as settings from './settings.repository.js'
import * as summaryRuns from './summaryRuns.repository.js'
import * as themisAreas from './themisAreas.repository.js'
import * as themisCheckins from './themisCheckins.repository.js'
import * as themisGoals from './themisGoals.repository.js'
import * as themisMetrics from './themisMetrics.repository.js'
import * as timeEntries from './timeEntries.repository.js'
import * as transcriptionRuns from './transcriptionRuns.repository.js'
import * as userModules from './userModules.repository.js'

// Repositories that hold users, sessions or app-wide values, or that read across users for the
// background loops, take no `userId` (ADR 0062)
const EXEMPT = [ 'system', 'users', 'sessions', 'appSettings' ]

type AnyFunction = ( ...args: never[] ) => unknown

// Every data repository, imported by name so the guard is typed. A new one must be added here;
// the file listing below fails until it is.
const DATA_REPOSITORIES: Record< string, Record< string, unknown > > = {
  calendarAccount,
  calendarEvents,
  calendarRules,
  extractionRuns,
  feedItems,
  feeds,
  gmailAccount,
  gmailMessages,
  gmailSources,
  health,
  jobStore,
  linkRuns,
  linkSuggestions,
  meleteConcepts,
  meleteNoteConcepts,
  meleteNotes,
  meleteQuestions,
  meleteReviews,
  meleteRuns,
  meleteSections,
  meleteSubjects,
  postings,
  promptProfiles,
  settings,
  summaryRuns,
  themisAreas,
  themisCheckins,
  themisGoals,
  themisMetrics,
  timeEntries,
  transcriptionRuns,
  userModules,
}

const files = readdirSync( dirname( fileURLToPath( import.meta.url ) ) )
  .filter( ( file ) => file.endsWith( '.repository.ts' ) )
  .map( ( file ) => file.replace( '.repository.ts', '' ) )

// The first parameter's name, read from the function's source (types are already stripped).
const firstParameter = ( fn: AnyFunction ): string | null => {
  const match = /^(?:async\s*)?(?:function\s*[\w$]*\s*)?\(?\s*([A-Za-z_$][\w$]*)\s*[,)=]/
    .exec( fn.toString() )

  return match === null ? null : ( match[ 1 ] ?? null )
}

const offenders = ( name: string ): string[] => {
  return Object.entries( DATA_REPOSITORIES[ name ] ?? {} )
    .filter( ( [ , value ] ) => typeof value === 'function' )
    .filter( ( [ , value ] ) => firstParameter( value as AnyFunction ) !== 'userId' )
    .map( ( [ exported ] ) => exported )
}

describe( 'the repository signature guard', () => {
  it( 'maps every repository file that is not exempt', () => {
    expect( files.filter( ( name ) => !EXEMPT.includes( name ) ).sort() )
      .toEqual( Object.keys( DATA_REPOSITORIES ).sort() )
  } )

  it( 'reads the first parameter of arrow, async and plain functions', () => {
    expect( firstParameter( ( userId: string ) => userId ) ).toBe( 'userId' )
    expect( firstParameter( async ( userId: string, id: string ) => {
      return await Promise.resolve( `${ userId }${ id }` )
    } ) ).toBe( 'userId' )
    expect( firstParameter( function lookup( userId: string ) { return userId } ) ).toBe( 'userId' )
    expect( firstParameter( ( id: string ) => id ) ).toBe( 'id' )
    expect( firstParameter( () => 1 ) ).toBeNull()
    expect( firstParameter( ( { userId }: { userId: string } ) => userId ) ).toBeNull()
  } )

  it( 'has userId first in every function of every data repository', () => {
    for( const name of Object.keys( DATA_REPOSITORIES ) ) {
      expect( offenders( name ), `${ name }.repository.ts` ).toEqual( [] )
    }
  } )

  it( 'keeps the exempt repositories to the ones that look across users or hold users', () => {
    expect( EXEMPT.toSorted() ).toEqual( [ 'appSettings', 'sessions', 'system', 'users' ] )
    expect( files ).toEqual( expect.arrayContaining( EXEMPT ) )
  } )
} )
