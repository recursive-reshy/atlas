// Packages
import { describe, it, expect } from 'vitest'
// Shared
import { JobStatus, LinkState, SourceType } from '@atlas/shared'
// Errors
import { ConflictError } from '../errors.js'
// Lifecycle
import {
  LINK_MOVES,
  MOVES,
  STATES,
  assertLinkMove,
  assertMove,
  canMove,
  statusesWhere,
} from './lifecycle.js'

const STATUSES = JobStatus.options
const SOURCES = SourceType.options

// The 0.7.0 moves, written out independently of the table (pinned by the characterization test)
const ALLOWED: Record< SourceType, string[] > = {
  video: [
    'queued>transcribing',
    'transcribing>summarizing',
  ],
  article: [
    'queued>fetching',
    'fetching>summarizing',
    'failed>summarizing',
  ],
}

const ANY_SOURCE = [
  'summarizing>linking',
  'summarizing>ready_for_review',
  'summarizing>summary_failed',
  'linking>ready_for_review',
  'summary_failed>summarizing',
  'ready_for_review>summarizing',
  'ready_for_review>linking',
  'ready_for_review>saved',
  'queued>failed',
  'transcribing>failed',
  'fetching>failed',
  'summarizing>failed',
  'linking>failed',
  // The one same-state move: a draft, folder or property edit
  'ready_for_review>ready_for_review',
]

describe( 'canMove', () => {
  it.each( SOURCES )( 'allows exactly the 0.7.0 moves for a %s job', ( source ) => {
    const allowed = new Set( [ ...ALLOWED[ source ], ...ANY_SOURCE ] )

    for( const from of STATUSES ) {
      for( const to of STATUSES ) {
        expect( canMove( from, to, source ), `${ source } ${ from } > ${ to }` )
          .toBe( allowed.has( `${ from }>${ to }` ) )
      }
    }
  } )

  it( 'allows a same-state move only in an editable state', () => {
    for( const status of STATUSES ) {
      expect( canMove( status, status, 'article' ) ).toBe( STATES[ status ].editable )
    }
  } )
} )

describe( 'assertMove', () => {
  it( 'returns for an allowed move', () => {
    expect( () => assertMove( { status: 'queued', source_type: 'video' }, 'transcribing' ) )
      .not.toThrow()
  } )

  it( 'throws the existing ConflictError message for a refused move', () => {
    const refuse = () => assertMove( { status: 'queued', source_type: 'video' }, 'summarizing' )

    expect( refuse ).toThrow( ConflictError )
    expect( refuse ).toThrow( 'Cannot move job from queued to summarizing' )
  } )

  it( 'refuses a move the job\'s source does not make', () => {
    expect( () => assertMove( { status: 'queued', source_type: 'article' }, 'transcribing' ) )
      .toThrow( ConflictError )
    expect( () => assertMove( { status: 'failed', source_type: 'video' }, 'summarizing' ) )
      .toThrow( ConflictError )
  } )
} )

describe( 'MOVES', () => {
  it( 'lists every move once', () => {
    const keys = MOVES.flatMap( ( { from, to, sources } ) => {
      return ( sources ?? SOURCES ).map( ( source ) => `${ source } ${ from }>${ to }` )
    } )

    expect( new Set( keys ).size ).toBe( keys.length )
  } )
} )

describe( 'STATES', () => {
  it( 'has an entry for every status', () => {
    expect( Object.keys( STATES ).sort() ).toEqual( [ ...STATUSES ].sort() )
  } )

  it( 'marks no state as both active and terminal', () => {
    expect( statusesWhere( 'active' ).filter( ( status ) => STATES[ status ].terminal ) )
      .toEqual( [] )
  } )
} )

describe( 'statusesWhere', () => {
  it.each( [
    [ 'runnable', [ 'queued', 'summarizing', 'linking' ] ],
    [
      'active',
      [
        'queued',
        'fetching',
        'transcribing',
        'summarizing',
        'linking',
        'ready_for_review',
        'summary_failed',
      ],
    ],
    [ 'expires', [ 'ready_for_review', 'summary_failed' ] ],
    [ 'terminal', [ 'saved', 'failed' ] ],
    [ 'editable', [ 'ready_for_review' ] ],
  ] as const )( 'returns the %s states', ( key, expected ) => {
    expect( statusesWhere( key ) ).toEqual( expected )
  } )

  it( 'returns the states that go to failed on restart', () => {
    expect( statusesWhere( 'onRestart', 'failed' ) ).toEqual( [
      'fetching',
      'transcribing',
    ] )
  } )

  it( 'returns the states that go to review on restart', () => {
    expect( statusesWhere( 'onRestart', 'ready_for_review' ) ).toEqual( [ 'linking' ] )
  } )
} )

describe( 'link states', () => {
  const STATE_OR_NULL: Array< LinkState | null > = [ null, ...LinkState.options ]

  const allowed = new Set( [
    // A summary completes with linking off or on
    'null>off',
    'null>pending',
    // The linking run finishes
    'pending>linked',
    'pending>failed',
    // Running linking again from review
    'off>pending',
    'linked>pending',
    'failed>pending',
    // Regenerating the summary clears the state
    'off>null',
    'linked>null',
    'failed>null',
  ] )

  it( 'allows exactly the moves 0.7.0 makes', () => {
    for( const from of STATE_OR_NULL ) {
      for( const to of STATE_OR_NULL ) {
        const move = `${ String( from ) }>${ String( to ) }`
        const attempt = () => assertLinkMove( from, to )

        if( allowed.has( move ) ) {
          expect( attempt, move ).not.toThrow()
        } else {
          expect( attempt, move ).toThrow( ConflictError )
        }
      }
    }
  } )

  it( 'lists each link move once', () => {
    const keys = LINK_MOVES.map( ( { from, to } ) => `${ String( from ) }>${ String( to ) }` )

    expect( new Set( keys ).size ).toBe( keys.length )
    expect( new Set( keys ) ).toEqual( allowed )
  } )
} )
