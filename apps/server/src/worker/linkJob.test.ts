// Node
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
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
import type { LinkResponse } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Clients
import { AgentError, requestLinks } from '../clients/agent.client.js'
// Repositories
import { clearJobs, updateJob } from '../repositories/jobStore.repository.js'
import { listSuggestions } from '../repositories/linkSuggestions.repository.js'
import {
  findProfileBySeedKey,
  setLastFolder,
} from '../repositories/promptProfiles.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import {
  completeAcquisition,
  completeSummary,
  findJob,
  markStatus,
  queueJob,
} from '../services/jobs.service.js'
// Summarizer
import { DEFAULT_LINKER_GUIDANCE } from '../summarizer/prompts.js'
// Worker
import { linkJob } from './linkJob.js'
// Test support
import { createTestUser, defaultTestAdmin, defaultTestVaultPath } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../clients/agent.client.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '../clients/agent.client.js' ) >()

  return { ...original, requestLinks: vi.fn() }
} )

const requestLinksMock = vi.mocked( requestLinks )

const NOW = new Date( '2026-10-21T10:00:00.000Z' )
const source = 'https://www.youtube.com/watch?v=abc123'

const usage = {
  input_tokens: 1000,
  output_tokens: 200,
  cache_read_input_tokens: 400,
  cache_creation_input_tokens: 50,
  tool_calls: 5,
  turns: 6,
}

const suggestion = ( target: string, anchor: string | null = null ) => ( {
  target,
  kind: 'new_concept' as const,
  anchor,
  reason: `About ${ target }.`,
} )

const linkedResponse = ( ...targets: string[] ): LinkResponse => ( {
  outcome: 'linked',
  reason: null,
  suggestions: targets.map( ( target ) => suggestion( target ) ),
  usage,
} )

const queueLinking = async (
  profile_id?: string,
  owner: string = userId,
): Promise< string > => {
  const { id } = await queueJob( owner, { url: source, profile_id } )

  markStatus( owner, id, 'downloading' )
  markStatus( owner, id, 'converting' )
  markStatus( owner, id, 'transcribing' )
  completeAcquisition( owner, id, {
    kind: 'video',
    meta: {
      title: 'A talk',
      source,
      channel: 'Channel',
      duration_seconds: 60,
      transcribed_at: '2026-10-21T09:00:00.000Z',
      model: 'large-v3-turbo',
    },
    text: 'Rust has an ownership model.',
  } )
  completeSummary( owner, id, '## Summary\n\nAbout ownership.', [ 'rust', 'memory' ] )

  return id
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( NOW )
  clearJobs( userId )
  vi.resetAllMocks()
  config.agent = { url: 'http://agent:8100', secret: 'x'.repeat( 32 ), timeoutMs: 1000 }
  setSetting( userId, 'linking_model', 'claude-haiku-5-5' )
  requestLinksMock.mockResolvedValue( linkedResponse( 'Ownership' ) )
} )

afterEach( () => {
  config.agent = null
  vi.useRealTimers()
} )

describe( 'linkJob', () => {
  it( 'sends the note, the model and the linker guidance to the agent', async () => {
    const id = await queueLinking()
    updateJob( userId, id, { target_folder: 'Learning/Rust' } )

    await linkJob( userId, id )

    expect( requestLinksMock ).toHaveBeenCalledTimes( 1 )
    expect( requestLinksMock ).toHaveBeenCalledWith( {
      note: {
        title: 'A talk',
        tags: [ 'mnemosyne', 'rust', 'memory' ],
        folder: 'Learning/Rust',
        body: expect.stringContaining( 'About ownership.' ) as string,
      },
      vault_dir: 'vault',
      model: 'claude-haiku-5-5',
      guidance: DEFAULT_LINKER_GUIDANCE,
    } )
  } )

  it( 'sends the vault folder of the job\'s owner', async () => {
    await mkdir( join( config.vaultsPath, 'brother' ), { recursive: true } )

    const member = createTestUser( { vault_dir: 'brother' } )
    const id = await queueLinking( undefined, member.id )

    await linkJob( member.id, id )

    expect( requestLinksMock.mock.calls[ 0 ]?.[ 0 ].vault_dir ).toBe( 'brother' )
  } )

  it( 'ends in review with a link error, and calls no agent, when no vault is chosen', async () => {
    const member = createTestUser()
    const id = await queueLinking( undefined, member.id )

    await linkJob( member.id, id )

    expect( requestLinksMock ).not.toHaveBeenCalled()
    expect( findJob( member.id, id ) ).toMatchObject( {
      status: 'ready_for_review',
      link_state: 'failed',
      link_error: 'Choose a vault first',
    } )
  } )

  it( 'ends in review with a link error, calling no agent, when the vault is missing', async () => {
    const member = createTestUser( { vault_dir: 'link-gone' } )
    const id = await queueLinking( undefined, member.id )

    await linkJob( member.id, id )

    expect( requestLinksMock ).not.toHaveBeenCalled()
    expect( findJob( member.id, id ) ).toMatchObject( {
      status: 'ready_for_review',
      link_state: 'failed',
      link_error: 'Your vault folder is missing',
    } )
  } )

  it( 'sends only the body, never the front-matter', async () => {
    const id = await queueLinking()

    await linkJob( userId, id )

    const body = requestLinksMock.mock.calls[ 0 ]?.[ 0 ].note.body ?? ''

    expect( body.startsWith( '---' ) ).toBe( false )
    expect( body ).not.toContain( 'created:' )
  } )

  it( 'uses the default note folder when the job has none', async () => {
    const id = await queueLinking()

    await linkJob( userId, id )

    expect( requestLinksMock.mock.calls[ 0 ]?.[ 0 ].note.folder ).toBe( config.defaultNoteFolder )
  } )

  it( 'uses the profile\'s last folder, when it exists, for a job with no folder', async () => {
    const study = findProfileBySeedKey( userId, 'study' )?.id ?? ''
    setLastFolder( userId, study, 'Learning/React' )
    await mkdir( join( defaultTestVaultPath(), 'Learning/React' ), { recursive: true } )
    const id = await queueLinking( study )

    await linkJob( userId, id )

    expect( requestLinksMock.mock.calls[ 0 ]?.[ 0 ].note.folder ).toBe( 'Learning/React' )
  } )

  it( 'stores the suggestions as pending and ends in review as linked', async () => {
    requestLinksMock.mockResolvedValue( linkedResponse( 'Ownership', 'Memory Safety', 'Rust' ) )
    const id = await queueLinking()

    await linkJob( userId, id )

    expect( findJob( userId, id ) ).toMatchObject( {
      status: 'ready_for_review',
      link_state: 'linked',
      link_error: null,
      expires_at: new Date( NOW.getTime() + 24 * 3_600_000 ).toISOString(),
    } )
    expect( listSuggestions( userId, id ).map( ( { target, status, position } ) => ( {
      target,
      status,
      position,
    } ) ) ).toEqual( [
      { target: 'Ownership', status: 'pending', position: 0 },
      { target: 'Memory Safety', status: 'pending', position: 1 },
      { target: 'Rust', status: 'pending', position: 2 },
    ] )
  } )

  it( 'records a succeeded run with the usage the agent reported', async () => {
    const id = await queueLinking()

    await linkJob( userId, id )

    expect( findJob( userId, id ).link_usage ).toMatchObject( {
      run_count: 1,
      last_run: {
        model: 'claude-haiku-5-5',
        prompt_version: 1,
        input_tokens: 1000,
        output_tokens: 200,
        cache_read_input_tokens: 400,
        cache_creation_input_tokens: 50,
        tool_calls: 5,
        outcome: 'succeeded',
      },
    } )
  } )

  it( 'is linked with no suggestions when the agent finds nothing to link', async () => {
    requestLinksMock.mockResolvedValue( linkedResponse() )
    const id = await queueLinking()

    await linkJob( userId, id )

    expect( findJob( userId, id ) )
      .toMatchObject( { status: 'ready_for_review', link_state: 'linked' } )
    expect( listSuggestions( userId, id ) ).toEqual( [] )
  } )

  it( 'ends in review as failed, with the reason, when the agent reports a failure', async () => {
    requestLinksMock.mockResolvedValue( {
      outcome: 'failed',
      reason: 'Timed out after 90 s',
      suggestions: [],
      usage,
    } )
    const id = await queueLinking()

    await linkJob( userId, id )

    expect( findJob( userId, id ) ).toMatchObject( {
      status: 'ready_for_review',
      link_state: 'failed',
      link_error: 'Timed out after 90 s',
      error: null,
      expires_at: new Date( NOW.getTime() + 24 * 3_600_000 ).toISOString(),
    } )
    expect( listSuggestions( userId, id ) ).toEqual( [] )
    expect( findJob( userId, id ).link_usage?.last_run )
      .toMatchObject( { outcome: 'failed', input_tokens: 1000 } )
  } )

  it( 'fails the link when the agent is unreachable, recording a run without usage', async () => {
    requestLinksMock.mockRejectedValue( new AgentError( 'Agent service unreachable' ) )
    const id = await queueLinking()

    await linkJob( userId, id )

    expect( findJob( userId, id ) ).toMatchObject( {
      status: 'ready_for_review',
      link_state: 'failed',
      link_error: 'Agent service unreachable',
    } )
    expect( findJob( userId, id ).link_usage?.last_run ).toMatchObject( {
      outcome: 'failed',
      input_tokens: null,
      tool_calls: null,
    } )
  } )

  it( 'turns any other error into a failed link state too', async () => {
    requestLinksMock.mockRejectedValue( new TypeError( 'boom' ) )
    const id = await queueLinking()

    await linkJob( userId, id )

    expect( findJob( userId, id ) ).toMatchObject( {
      status: 'ready_for_review',
      link_state: 'failed',
      link_error: 'boom',
    } )
  } )

  it( 'fails the link, not the job, when the draft cannot be read', async () => {
    const id = await queueLinking()
    updateJob( userId, id, { note_markdown: 'no front-matter here' } )

    await linkJob( userId, id )

    expect( requestLinksMock ).not.toHaveBeenCalled()
    expect( findJob( userId, id ) )
      .toMatchObject( { status: 'ready_for_review', link_state: 'failed' } )
  } )
} )
