// Shared
import { JobStatus, LinkState, SourceType } from '@atlas/shared'
// Errors
import { ConflictError } from '../errors.js'

type StateInfo = {
  runnable: boolean
  active: boolean
  expires: boolean
  terminal: boolean
  editable: boolean
  onRestart: JobStatus | null
}

const state = ( overrides: Partial< StateInfo > = {} ): StateInfo => ( {
  runnable: false,
  active: false,
  expires: false,
  terminal: false,
  editable: false,
  onRestart: null,
  ...overrides,
} )

// `runnable`: the worker picks it up. `active`: listed by listActiveJobs. `expires`: entering
// it starts the review clock. `editable`: a same-state move (draft, folder) is allowed.
// `onRestart`: where an interrupted job goes at startup.
export const STATES: Record< JobStatus, StateInfo > = {
  queued: state( { runnable: true, active: true } ),
  fetching: state( { active: true, onRestart: 'failed' } ),
  downloading: state( { active: true, onRestart: 'failed' } ),
  converting: state( { active: true, onRestart: 'failed' } ),
  transcribing: state( { active: true, onRestart: 'failed' } ),
  summarizing: state( { runnable: true, active: true } ),
  linking: state( { runnable: true, active: true, onRestart: 'ready_for_review' } ),
  ready_for_review: state( { active: true, expires: true, editable: true } ),
  summary_failed: state( { active: true, expires: true } ),
  saved: state( { terminal: true } ),
  failed: state( { terminal: true } ),
}

type Move = { from: JobStatus, to: JobStatus, sources?: SourceType[] }

// A move without `sources` is made by jobs of any source
export const MOVES: readonly Move[] = [
  { from: 'queued', to: 'downloading', sources: [ 'video' ] },
  { from: 'downloading', to: 'converting', sources: [ 'video' ] },
  { from: 'converting', to: 'transcribing', sources: [ 'video' ] },
  { from: 'transcribing', to: 'summarizing', sources: [ 'video' ] },
  { from: 'queued', to: 'fetching', sources: [ 'article' ] },
  { from: 'fetching', to: 'summarizing', sources: [ 'article' ] },
  { from: 'summarizing', to: 'linking' },
  { from: 'summarizing', to: 'ready_for_review' },
  { from: 'summarizing', to: 'summary_failed' },
  { from: 'linking', to: 'ready_for_review' },
  { from: 'summary_failed', to: 'summarizing' },
  { from: 'ready_for_review', to: 'summarizing' },
  { from: 'ready_for_review', to: 'linking' },
  { from: 'ready_for_review', to: 'saved' },
  { from: 'failed', to: 'summarizing', sources: [ 'article' ] },
  { from: 'queued', to: 'failed' },
  { from: 'downloading', to: 'failed' },
  { from: 'converting', to: 'failed' },
  { from: 'transcribing', to: 'failed' },
  { from: 'fetching', to: 'failed' },
  { from: 'summarizing', to: 'failed' },
  { from: 'linking', to: 'failed' },
]

export const canMove = ( from: JobStatus, to: JobStatus, source: SourceType ): boolean => {
  if( from === to ) {
    return STATES[ from ].editable
  }

  return MOVES.some( ( move ) => {
    return move.from === from
      && move.to === to
      && ( move.sources === undefined || move.sources.includes( source ) )
  } )
}

export const assertMove = (
  { status, source_type }: { status: JobStatus, source_type: SourceType },
  to: JobStatus,
): void => {
  if( !canMove( status, to, source_type ) ) {
    throw new ConflictError( `Cannot move job from ${ status } to ${ to }` )
  }
}

export const statusesWhere = (
  key: keyof StateInfo,
  value: StateInfo[ keyof StateInfo ] = true,
): JobStatus[] => {
  return JobStatus.options.filter( ( status ) => STATES[ status ][ key ] === value )
}

type LinkValue = LinkState | null

export const LINK_STATES: readonly LinkValue[] = [ null, ...LinkState.options ]

export const LINK_MOVES: ReadonlyArray< { from: LinkValue, to: LinkValue } > = [
  { from: null, to: 'off' },
  { from: null, to: 'pending' },
  { from: 'pending', to: 'linked' },
  { from: 'pending', to: 'failed' },
  { from: 'off', to: 'pending' },
  { from: 'linked', to: 'pending' },
  { from: 'failed', to: 'pending' },
  { from: 'off', to: null },
  { from: 'linked', to: null },
  { from: 'failed', to: null },
]

export const assertLinkMove = ( from: LinkValue, to: LinkValue ): void => {
  if( !LINK_MOVES.some( ( move ) => move.from === from && move.to === to ) ) {
    throw new ConflictError(
      `Cannot move link state from ${ String( from ) } to ${ String( to ) }`,
    )
  }
}
