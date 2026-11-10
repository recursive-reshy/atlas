// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Shared
import { VideoSource, parseNote } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Repositories
import { clearJobs, updateJob } from '../repositories/jobStore.repository.js'
import { insertLinkRun } from '../repositories/linkRuns.repository.js'
import {
  findSuggestions,
  insertSuggestions,
  listSuggestions,
  setStatus,
} from '../repositories/linkSuggestions.repository.js'
import {
  findLatestVersion,
  findProfileBySeedKey,
} from '../repositories/promptProfiles.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import {
  completeSummary,
  completeAcquisition,
  findJob,
  claimNextJob,
  markStatus,
  queueJob,
  recoverInterruptedJobs,
  regenerateSummary,
} from './jobs.service.js'
import {
  acceptSuggestions,
  completeLinking,
  failLinking,
  listLinkSuggestions,
  recordLinkRun,
  recordLinkSuggestions,
  rejectSuggestions,
  runLinking,
} from './jobLinking.service.js'
import { discardJob, saveJob } from './jobDraft.service.js'
// Models
import { assertKnownModel } from './models.service.js'
// Prompts

// Clients
import { existingFolderSync, writeNote } from '../clients/vault.client.js'
// Formatters
// Fixtures
// Repositories
// Logging
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../clients/vault.client.js' )
vi.mock( './models.service.js' )
vi.mock( '../repositories/linkSuggestions.repository.js', async ( importOriginal ) => {
  const original = await importOriginal<
    typeof import( '../repositories/linkSuggestions.repository.js' )
  >()

  return { ...original, setStatus: vi.fn( original.setStatus ) }
} )

const writeNoteMock = vi.mocked( writeNote )
const existingFolderSyncMock = vi.mocked( existingFolderSync )
const assertKnownModelMock = vi.mocked( assertKnownModel )

const url = 'https://www.youtube.com/watch?v=abc'
const startTime = new Date( '2026-10-14T10:00:00.000Z' )
const laterTime = new Date( '2026-10-14T10:05:00.000Z' )

const transcript: Pick< VideoSource, 'meta' | 'text' > = {
  meta: {
    title: 'A talk',
    source: url,
    channel: 'Some Channel',
    duration_seconds: 60,
    transcribed_at: '2026-10-14T10:04:00.000Z',
    model: 'large-v3',
  },
  text: 'Hello',
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( startTime )
  clearJobs( userId )
  writeNoteMock.mockReset()
  writeNoteMock.mockResolvedValue( 'Mnemosyne/Edited title.md' )
  existingFolderSyncMock.mockReset()
  existingFolderSyncMock.mockReturnValue( true )
  assertKnownModelMock.mockReset()
  assertKnownModelMock.mockResolvedValue( undefined )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'linking', () => {
  const agent = { url: 'http://agent:8100', secret: 'x'.repeat( 32 ), timeoutMs: 1000 }
  const usage = {
    input_tokens: 1000,
    output_tokens: 200,
    cache_read_input_tokens: 400,
    cache_creation_input_tokens: 50,
    tool_calls: 5,
    turns: 6,
  }

  beforeEach( () => {
    config.agent = agent
  } )

  afterEach( () => {
    config.agent = null
  } )

  const summarizing = async (): Promise< string > => {
    const { id } = await queueJob( userId, { url } )

    markStatus( userId, id, 'transcribing' )
    completeAcquisition( userId, id, { kind: 'video', ...transcript } )

    return id
  }

  const linking = async (): Promise< string > => {
    const id = await summarizing()

    completeSummary( userId, id, '## Summary', [ 'rust' ] )

    return id
  }

  const linkerVersion = (): { id: number, version: number } => {
    const version = findLatestVersion( userId, findProfileBySeedKey( userId, 'linker' )?.id ?? '' )

    if( version === undefined ) {
      throw new Error( 'The linker profile has no version' )
    }

    return version
  }

  const suggestion = ( target: string ) => ( {
    target,
    kind: 'new_concept' as const,
    anchor: null,
    reason: `About ${ target }.`,
  } )

  describe( 'completeSummary', () => {
    it( 'moves to linking, pending and without an expiry, when linking is on', async () => {
      const id = await summarizing()

      const job = completeSummary( userId, id, '## Summary', [ 'rust' ] )

      expect( job ).toMatchObject( {
        status: 'linking',
        link_state: 'pending',
        link_error: null,
        expires_at: null,
      } )
      expect( job.note_markdown ).toContain( '## Summary' )
    } )

    it( 'goes to review with linking off when the agent is not configured', async () => {
      config.agent = null
      const id = await summarizing()

      expect( completeSummary( userId, id, '## Summary', [] ) ).toMatchObject( {
        status: 'ready_for_review',
        link_state: 'off',
        expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
      } )
    } )

    it( 'goes to review with linking off when the switch is off', async () => {
      setSetting( userId, 'linking_enabled', false )
      const id = await summarizing()

      expect( completeSummary( userId, id, '## Summary', [] ) ).toMatchObject( {
        status: 'ready_for_review',
        link_state: 'off',
      } )
    } )
  } )

  describe( 'completeLinking', () => {
    it( 'moves to review as linked and starts the expiry', async () => {
      const id = await linking()

      expect( completeLinking( userId, id ) ).toMatchObject( {
        status: 'ready_for_review',
        link_state: 'linked',
        link_error: null,
        expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
      } )
    } )

    it.each( [ 'summarizing', 'ready_for_review' ] as const )(
      'refuses a job that is %s',
      async ( status ) => {
        const id = await linking()
        updateJob( userId, id, { status } )

        expect( () => completeLinking( userId, id ) ).toThrow( ConflictError )
      },
    )
  } )

  describe( 'failLinking', () => {
    it( 'moves to review as failed with the reason, never to a failed status', async () => {
      const id = await linking()

      expect( failLinking( userId, id, 'Agent service unreachable' ) ).toMatchObject( {
        status: 'ready_for_review',
        link_state: 'failed',
        link_error: 'Agent service unreachable',
        error: null,
        expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
      } )
    } )

    it( 'refuses a job that is not linking', async () => {
      const id = await summarizing()

      expect( () => failLinking( userId, id, 'x' ) ).toThrow( ConflictError )
    } )
  } )

  describe( 'recordLinkRun and link_usage', () => {
    it( 'has no link usage before a run', async () => {
      expect( findJob( userId, await linking() ).link_usage ).toBeNull()
    } )

    it( 'records usage and a computed cost, and returns the run id', async () => {
      const id = await linking()

      const runId = recordLinkRun( userId, id, {
        model: 'claude-sonnet-5-5',
        promptVersionId: linkerVersion().id,
        usage,
      } )

      expect( runId ).toBeGreaterThan( 0 )
      expect( findJob( userId, id ).link_usage ).toEqual( {
        last_run: {
          model: 'claude-sonnet-5-5',
          prompt_version: linkerVersion().version,
          input_tokens: 1000,
          output_tokens: 200,
          cache_read_input_tokens: 400,
          cache_creation_input_tokens: 50,
          tool_calls: 5,
          cost_usd: 0.004,
          outcome: 'succeeded',
          created_at: startTime.toISOString(),
        },
        run_count: 1,
        total_input_tokens: 1000,
        total_output_tokens: 200,
        total_cost_usd: 0.004,
      } )
    } )

    it( 'shows tokens only for a model without a single price', async () => {
      const id = await linking()

      recordLinkRun( userId, id, {
        model: 'claude-haiku-5-5',
        promptVersionId: linkerVersion().id,
        usage,
      } )

      expect( findJob( userId, id ).link_usage ).toMatchObject( {
        last_run: { cost_usd: null, input_tokens: 1000 },
        total_cost_usd: null,
      } )
    } )

    it( 'records a failed run without usage', async () => {
      const id = await linking()

      recordLinkRun( userId, id, {
        model: 'claude-haiku-5-5',
        promptVersionId: linkerVersion().id,
        usage: undefined,
        error: 'Agent service unreachable',
      } )

      expect( findJob( userId, id ).link_usage?.last_run ).toMatchObject( {
        outcome: 'failed',
        input_tokens: null,
        output_tokens: null,
        tool_calls: null,
        cost_usd: null,
      } )
    } )

    it( 'records a failed run that still has usage', async () => {
      const id = await linking()

      recordLinkRun( userId, id, {
        model: 'claude-sonnet-5-5',
        promptVersionId: linkerVersion().id,
        usage,
        error: 'Timed out after 90 s',
      } )

      expect( findJob( userId, id ).link_usage?.last_run )
        .toMatchObject( { outcome: 'failed', input_tokens: 1000, cost_usd: 0.004 } )
    } )
  } )

  describe( 'recordLinkSuggestions', () => {
    it( 'stores the suggestions as pending under the run', async () => {
      const id = await linking()
      const runId = recordLinkRun( userId, id, {
        model: 'claude-haiku-5-5',
        promptVersionId: linkerVersion().id,
        usage,
      } )

      recordLinkSuggestions( userId, id, runId, [ suggestion( 'Alpha' ), suggestion( 'Beta' ) ] )

      expect( listSuggestions( userId, id ).map( ( { target, status, position } ) => ( {
        target,
        status,
        position,
      } ) ) ).toEqual( [
        { target: 'Alpha', status: 'pending', position: 0 },
        { target: 'Beta', status: 'pending', position: 1 },
      ] )
    } )
  } )

  describe( 'claimNextJob', () => {
    it( 'returns a job that is linking', async () => {
      const id = await linking()

      expect( claimNextJob()?.job.id ).toBe( id )
    } )
  } )

  describe( 'recoverInterruptedJobs', () => {
    it( 'moves a linking job to review as failed, and counts it with the step jobs', async () => {
      const id = await linking()
      const { id: transcribing } = await queueJob( userId, { url } )
      markStatus( userId, transcribing, 'transcribing' )
      const stillSummarizing = await summarizing()

      expect( recoverInterruptedJobs() ).toBe( 2 )
      expect( findJob( userId, id ) ).toMatchObject( {
        status: 'ready_for_review',
        link_state: 'failed',
        link_error: 'Interrupted by restart',
        expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
      } )
      expect( findJob( userId, transcribing ).status ).toBe( 'failed' )
      expect( findJob( userId, stillSummarizing ).status ).toBe( 'summarizing' )
    } )
  } )

  describe( 'regenerateSummary', () => {
    it( 'supersedes pending suggestions, keeps decided ones, clears the link state', async () => {
      const id = await linking()
      completeLinking( userId, id )
      const runId = recordLinkRun( userId, id, {
        model: 'claude-haiku-5-5',
        promptVersionId: linkerVersion().id,
        usage,
      } )
      const [ accepted ] = insertSuggestions( userId, runId, id, [ suggestion( 'Alpha' ) ] )
      insertSuggestions( userId, runId, id, [ suggestion( 'Beta' ) ] )
      setStatus( userId, [ accepted?.id ?? '' ], 'accepted', startTime.toISOString() )

      const job = await regenerateSummary( userId, id, {} )

      expect( job ).toMatchObject( { status: 'summarizing', link_state: null, link_error: null } )
      expect( listSuggestions(
        userId,
        id,
      ).map( ( { target, status } ) => ( { target, status } ) ) )
        .toEqual( [ { target: 'Alpha', status: 'accepted' } ] )
    } )

    it( 'supersedes nothing when the choices are refused', async () => {
      const id = await linking()
      completeLinking( userId, id )
      const runId = insertLinkRun( userId, {
        job_id: id,
        model: 'claude-haiku-5-5',
        prompt_version_id: linkerVersion().id,
        input_tokens: null,
        output_tokens: null,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: null,
        tool_calls: null,
        cost_usd: null,
        outcome: 'succeeded',
        error: null,
        created_at: startTime.toISOString(),
      } )
      insertSuggestions( userId, runId, id, [ suggestion( 'Alpha' ) ] )
      assertKnownModelMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

      await expect( regenerateSummary( userId, id, { model: 'nope' } ) )
        .rejects.toThrow( ValidationError )
      expect( listSuggestions( userId, id ).map( ( { status } ) => status ) )
        .toEqual( [ 'pending' ] )
    } )
  } )

  describe( 'reviewing link suggestions', () => {
    const setStatusMock = vi.mocked( setStatus )

    const reviewed = async (
      ...targets: string[]
    ): Promise< { id: string, ids: string[] } > => {
      const id = await linking()
      const runId = recordLinkRun( userId, id, {
        model: 'claude-haiku-5-5',
        promptVersionId: linkerVersion().id,
        usage,
      } )

      recordLinkSuggestions( userId, id, runId, targets.map( ( target ) => suggestion( target ) ) )
      completeLinking( userId, id )

      return { id, ids: listSuggestions(
        userId,
        id,
      ).map( ( { id: suggestionId } ) => suggestionId ) }
    }

    const withLink = ( id: string, target: string ): string => {
      return `${ findJob( userId, id ).note_markdown ?? '' }\n- [[${ target }]]\n`
    }

    const statuses = ( id: string ): string[] => {
      return listSuggestions( userId, id ).map( ( { status } ) => status )
    }

    describe( 'listLinkSuggestions', () => {
      it( 'lists the suggestions of the job in position order', async () => {
        const { id } = await reviewed( 'Alpha', 'Beta' )

        expect( listLinkSuggestions( userId, id ).map( ( { target } ) => target ) )
          .toEqual( [ 'Alpha', 'Beta' ] )
      } )

      it( 'throws NotFoundError for an unknown job', () => {
        expect( () => listLinkSuggestions( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
      } )
    } )

    describe( 'runLinking', () => {
      it( 'moves a reviewed job to linking, pending and without an expiry', async () => {
        const { id } = await reviewed( 'Alpha' )

        expect( runLinking( userId, id, {} ) ).toMatchObject( {
          status: 'linking',
          link_state: 'pending',
          link_error: null,
          expires_at: null,
        } )
      } )

      it( 'works from a failed link state and from linking switched off', async () => {
        config.agent = null
        const off = await summarizing()
        completeSummary( userId, off, '## Summary', [] )
        config.agent = agent

        expect( runLinking( userId, off, {} ) )
          .toMatchObject( { status: 'linking', link_state: 'pending' } )

        const failed = await linking()
        failLinking( userId, failed, 'Agent service unreachable' )

        expect( runLinking( userId, failed, {} ) ).toMatchObject( {
          status: 'linking',
          link_state: 'pending',
          link_error: null,
        } )
      } )

      it( 'supersedes pending suggestions and keeps the decided ones', async () => {
        const { id, ids } = await reviewed( 'Alpha', 'Beta' )
        setStatus( userId, [ ids[ 0 ] ?? '' ], 'accepted', startTime.toISOString() )

        runLinking( userId, id, {} )

        expect( listSuggestions(
          userId,
          id,
        ).map( ( { target, status } ) => ( { target, status } ) ) )
          .toEqual( [ { target: 'Alpha', status: 'accepted' } ] )
      } )

      it( 'saves the note first when one is sent', async () => {
        const { id } = await reviewed( 'Alpha' )
        const note = withLink( id, 'Alpha' )

        const job = runLinking( userId, id, { note_markdown: note } )

        expect( job.note_markdown ).toContain( '- [[Alpha]]' )
        expect( job.status ).toBe( 'linking' )
      } )

      it( 'leaves the draft alone when no note is sent', async () => {
        const { id } = await reviewed( 'Alpha' )
        const before = findJob( userId, id ).note_markdown

        expect( runLinking( userId, id, {} ).note_markdown ).toBe( before )
      } )

      it( 'changes nothing when the note is invalid', async () => {
        const { id } = await reviewed( 'Alpha' )
        const before = findJob( userId, id )

        expect( () => runLinking( userId, id, { note_markdown: 'no front-matter' } ) )
          .toThrow( ValidationError )
        expect( findJob( userId, id ) ).toEqual( before )
        expect( statuses( id ) ).toEqual( [ 'pending' ] )
      } )

      it.each( [ 'summarizing', 'linking', 'summary_failed', 'saved' ] as const )(
        'refuses a job that is %s',
        async ( status ) => {
          const { id } = await reviewed( 'Alpha' )
          updateJob( userId, id, { status } )

          expect( () => runLinking( userId, id, {} ) ).toThrow( ConflictError )
        },
      )

      it( 'refuses with "Linking isn\'t configured" when there is no agent', async () => {
        const { id } = await reviewed( 'Alpha' )
        config.agent = null

        expect( () => runLinking( userId, id, {} ) )
          .toThrow( new ConflictError( 'Linking isn\'t configured' ) )
        expect( findJob( userId, id ).status ).toBe( 'ready_for_review' )
      } )

      it( 'throws NotFoundError for an unknown job', () => {
        expect( () => runLinking( userId, crypto.randomUUID(), {} ) ).toThrow( NotFoundError )
      } )
    } )

    describe( 'acceptSuggestions', () => {
      afterEach( () => {
        setStatusMock.mockClear()
      } )

      it( 'stores the note and marks the suggestions accepted together', async () => {
        const { id, ids } = await reviewed( 'Alpha', 'Beta', 'Gamma' )
        vi.setSystemTime( laterTime )

        const result = acceptSuggestions( userId, id, {
          ids: [ ids[ 0 ] ?? '', ids[ 2 ] ?? '' ],
          note_markdown: withLink( id, 'Alpha' ),
        } )

        expect( result.job.note_markdown ).toContain( '- [[Alpha]]' )
        expect( findJob( userId, id ).note_markdown ).toBe( result.job.note_markdown )
        expect( result.suggestions.map( ( { target, status, decided_at } ) => ( {
          target,
          status,
          decided_at,
        } ) ) ).toEqual( [
          { target: 'Alpha', status: 'accepted', decided_at: laterTime.toISOString() },
          { target: 'Beta', status: 'pending', decided_at: null },
          { target: 'Gamma', status: 'accepted', decided_at: laterTime.toISOString() },
        ] )
      } )

      it( 'restarts the expiry', async () => {
        const { id, ids } = await reviewed( 'Alpha' )
        vi.setSystemTime( laterTime )

        const { job } = acceptSuggestions( userId, id, {
          ids: [ ids[ 0 ] ?? '' ],
          note_markdown: withLink( id, 'Alpha' ),
        } )

        expect( job.expires_at )
          .toBe( new Date( laterTime.getTime() + 24 * 3_600_000 ).toISOString() )
      } )

      it( 'keeps the locked properties, as a draft save does', async () => {
        const { id, ids } = await reviewed( 'Alpha' )
        const note = withLink( id, 'Alpha' ).replace( /source: ".*"/, 'source: "https://evil.example"' )

        const { job } = acceptSuggestions(
          userId,
          id,
          { ids: [ ids[ 0 ] ?? '' ], note_markdown: note },
        )

        expect( parseNote( job.note_markdown ?? '' ).properties.source )
          .toBe( transcript.meta.source )
      } )

      it( 'changes nothing when the note is invalid', async () => {
        const { id, ids } = await reviewed( 'Alpha' )
        const before = findJob( userId, id )

        expect( () => acceptSuggestions(
          userId,
          id,
          { ids: [ ids[ 0 ] ?? '' ], note_markdown: 'nope' },
        ) )
          .toThrow( ValidationError )
        expect( findJob( userId, id ) ).toEqual( before )
        expect( statuses( id ) ).toEqual( [ 'pending' ] )
      } )

      it( 'rolls the draft back when recording the decision fails', async () => {
        const { id, ids } = await reviewed( 'Alpha' )
        const before = findJob( userId, id )
        vi.setSystemTime( laterTime )
        setStatusMock.mockImplementationOnce( () => {
          throw new Error( 'disk full' )
        } )

        expect( () => acceptSuggestions( userId, id, {
          ids: [ ids[ 0 ] ?? '' ],
          note_markdown: withLink( id, 'Alpha' ),
        } ) ).toThrow( 'disk full' )
        expect( findJob( userId, id ) ).toEqual( before )
        expect( statuses( id ) ).toEqual( [ 'pending' ] )
      } )

      it( 'refuses a job that is not in review', async () => {
        const { id, ids } = await reviewed( 'Alpha' )
        updateJob( userId, id, { status: 'linking' } )

        expect( () => acceptSuggestions(
          userId,
          id,
          { ids, note_markdown: withLink( id, 'Alpha' ) },
        ) )
          .toThrow( ConflictError )
      } )

      it( 'names the first id that is not a pending suggestion of the job', async () => {
        const { id, ids } = await reviewed( 'Alpha', 'Beta' )
        const unknown = crypto.randomUUID()
        const { ids: otherIds } = await reviewed( 'Elsewhere' )

        for( const bad of [ unknown, otherIds[ 0 ] ?? '' ] ) {
          expect( () => acceptSuggestions( userId, id, {
            ids: [ ids[ 0 ] ?? '', bad, ids[ 1 ] ?? '' ],
            note_markdown: withLink( id, 'Alpha' ),
          } ) ).toThrow( new ConflictError( `Link suggestion ${ bad } is not pending` ) )
        }

        expect( statuses( id ) ).toEqual( [ 'pending', 'pending' ] )
      } )

      it( 'refuses a suggestion that is already decided or superseded', async () => {
        const { id, ids } = await reviewed( 'Alpha', 'Beta' )
        setStatus( userId, [ ids[ 0 ] ?? '' ], 'rejected', startTime.toISOString() )
        setStatus( userId, [ ids[ 1 ] ?? '' ], 'superseded', startTime.toISOString() )

        for( const done of ids ) {
          expect( () => acceptSuggestions( userId, id, {
            ids: [ done ],
            note_markdown: withLink( id, 'Alpha' ),
          } ) ).toThrow( new ConflictError( `Link suggestion ${ done } is not pending` ) )
        }
      } )
    } )

    describe( 'rejectSuggestions', () => {
      it( 'marks the suggestions rejected without touching the draft or the expiry', async () => {
        const { id, ids } = await reviewed( 'Alpha', 'Beta' )
        const before = findJob( userId, id )
        vi.setSystemTime( laterTime )

        const result = rejectSuggestions( userId, id, { ids: [ ids[ 1 ] ?? '' ] } )

        expect( result.job.note_markdown ).toBe( before.note_markdown )
        expect( result.job.expires_at ).toBe( before.expires_at )
        expect( result.suggestions.map( ( { target, status, decided_at } ) => ( {
          target,
          status,
          decided_at,
        } ) ) ).toEqual( [
          { target: 'Alpha', status: 'pending', decided_at: null },
          { target: 'Beta', status: 'rejected', decided_at: laterTime.toISOString() },
        ] )
      } )

      it( 'refuses a job that is not in review', async () => {
        const { id, ids } = await reviewed( 'Alpha' )
        updateJob( userId, id, { status: 'linking' } )

        expect( () => rejectSuggestions( userId, id, { ids } ) ).toThrow( ConflictError )
      } )

      it( 'names the first id that is not pending', async () => {
        const { id, ids } = await reviewed( 'Alpha' )
        const unknown = crypto.randomUUID()
        setStatus( userId, ids, 'accepted', startTime.toISOString() )

        expect( () => rejectSuggestions( userId, id, { ids: [ unknown ] } ) )
          .toThrow( new ConflictError( `Link suggestion ${ unknown } is not pending` ) )
        expect( () => rejectSuggestions( userId, id, { ids } ) )
          .toThrow( new ConflictError( `Link suggestion ${ ids[ 0 ] ?? '' } is not pending` ) )
      } )
    } )

    describe( 'saving and discarding', () => {
      it( 'saveJob leaves the suggestion rows alone', async () => {
        const { id, ids } = await reviewed( 'Alpha' )

        await saveJob( userId, id )

        expect( findSuggestions( userId, id, ids ) ).toHaveLength( 1 )
        expect( findJob( userId, id ).status ).toBe( 'saved' )
      } )

      it( 'discardJob removes them with the job', async () => {
        const { id, ids } = await reviewed( 'Alpha' )

        discardJob( userId, id )

        expect( findSuggestions( userId, id, ids ) ).toEqual( [] )
      } )
    } )
  } )
} )
