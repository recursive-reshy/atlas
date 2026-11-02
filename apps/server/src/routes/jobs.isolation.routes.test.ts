// Node
import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest'
// Shared
import { ListJobsResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Config
import { config } from '../config.js'
// Repositories
import { findJobById } from '../repositories/jobStore.repository.js'
// Services
import {
  completeAcquisition,
  completeLinking,
  completeSummary,
  markStatus,
  queueJob,
  recordLinkRun,
  recordLinkSuggestions,
} from '../services/jobs.service.js'
import { resolveLinkerPrompt } from '../services/prompts.service.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'
import type { TestUser } from '../test-support/auth.js'
import { transcriptFixture } from '../test-support/transcript.fixture.js'

let owner: TestUser
let other: TestUser

// A job in review with link suggestions, so every job route has something to refuse
const reviewedJob = async (): Promise< { id: string, suggestion: string } > => {
  const { id } = await queueJob( owner.id, { url: 'https://www.youtube.com/watch?v=abc' } )

  markStatus( owner.id, id, 'downloading' )
  markStatus( owner.id, id, 'converting' )
  markStatus( owner.id, id, 'transcribing' )
  completeAcquisition( owner.id, id, { kind: 'video', ...transcriptFixture } )
  completeSummary( owner.id, id, '## Summary', [] )

  const runId = recordLinkRun( owner.id, id, {
    model: 'claude-haiku-5-5',
    promptVersionId: resolveLinkerPrompt( owner.id ).version.id,
    usage: undefined,
  } )

  recordLinkSuggestions( owner.id, id, runId, [
    { target: 'Alpha', kind: 'new_concept', anchor: null, reason: 'Because.' },
  ] )
  completeLinking( owner.id, id )

  const stored = await signedInRequest( app, owner ).get( `/api/jobs/${ id }/link-suggestions` )
  const [ first ] = ( stored.body as { suggestions: { id: string }[] } ).suggestions

  return { id, suggestion: first?.id ?? '' }
}

const agent = config.agent

const ownerVault = (): string => join( config.vaultsPath, 'owner' )
const otherVault = (): string => join( config.vaultsPath, 'other' )

afterEach( () => {
  config.agent = agent
} )

beforeEach( async () => {
  config.agent = { url: 'http://localhost:8100', secret: 'x'.repeat( 32 ), timeoutMs: 1000 }
  owner = createTestUser( { role: 'admin', vault_dir: 'owner' } )
  other = createTestUser( { vault_dir: 'other' } )
  // Only its own two folders: other test files share the vaults root
  await rm( ownerVault(), { recursive: true, force: true } )
  await rm( otherVault(), { recursive: true, force: true } )
  await mkdir( ownerVault(), { recursive: true } )
  await mkdir( otherVault(), { recursive: true } )
} )

describe( 'the jobs routes are per user', () => {
  it( 'answers every job route for another user\'s job like an unknown id', async () => {
    const { id, suggestion } = await reviewedJob()
    const unknown = crypto.randomUUID()
    const note = '---\ntitle: "A"\n---\n\nText\n'

    const calls = ( jobId: string ): [ string, string, object? ][] => [
      [ 'get', `/api/jobs/${ jobId }` ],
      [ 'get', `/api/jobs/${ jobId }/source` ],
      [ 'post', `/api/jobs/${ jobId }/text`, { text: 'x'.repeat( 400 ) } ],
      [ 'patch', `/api/jobs/${ jobId }/draft`, { target_folder: 'Notes' } ],
      [ 'post', `/api/jobs/${ jobId }/save`, {} ],
      [ 'post', `/api/jobs/${ jobId }/retry-summary`, {} ],
      [ 'post', `/api/jobs/${ jobId }/regenerate-summary`, {} ],
      [ 'get', `/api/jobs/${ jobId }/link-suggestions` ],
      [ 'post', `/api/jobs/${ jobId }/link-suggestions/accept`, {
        ids: [ suggestion ],
        note_markdown: note,
      } ],
      [ 'post', `/api/jobs/${ jobId }/link-suggestions/reject`, { ids: [ suggestion ] } ],
      [ 'post', `/api/jobs/${ jobId }/linking`, {} ],
      [ 'delete', `/api/jobs/${ jobId }` ],
      [ 'get', `/api/jobs/${ jobId }/download?format=md` ],
    ]

    for( const [ method, path, body ] of calls( id ) ) {
      const agent = signedInRequest( app, other )
      const asOther = method === 'get' ? agent.get( path ) : agent[ method as 'post' ]( path )
      const response = await ( body === undefined ? asOther : asOther.send( body ) )
      const reference = calls( unknown ).find( ( [ m, p ] ) => {
        return m === method && p.replace( unknown, '{id}' ) === path.replace( id, '{id}' )
      } )
      const unknownAgent = signedInRequest( app, other )
      const asUnknown = method === 'get'
        ? unknownAgent.get( reference?.[ 1 ] ?? '' )
        : unknownAgent[ method as 'post' ]( reference?.[ 1 ] ?? '' )
      const unknownResponse = await ( reference?.[ 2 ] === undefined
        ? asUnknown
        : asUnknown.send( reference[ 2 ] ) )

      expect( response.status, `${ method } ${ path }` ).toBe( 404 )
      expect( response.body, `${ method } ${ path }` ).toEqual( unknownResponse.body )
    }

    expect( findJobById( owner.id, id )?.status ).toBe( 'ready_for_review' )
  } )

  it( 'lists only the caller\'s own jobs', async () => {
    const { id } = await reviewedJob()
    const theirs = await signedInRequest( app, other )
      .post( '/api/jobs' )
      .send( { url: 'https://www.youtube.com/watch?v=xyz' } )

    const mine = ListJobsResponse.parse(
      ( await signedInRequest( app, owner ).get( '/api/jobs' ) ).body,
    ).jobs
    const seen = ListJobsResponse.parse(
      ( await signedInRequest( app, other ).get( '/api/jobs' ) ).body,
    ).jobs

    expect( mine.map( ( job ) => job.id ) ).toEqual( [ id ] )
    expect( seen.map( ( job ) => job.id ) )
      .toEqual( [ ( theirs.body as { job_id: string } ).job_id ] )
  } )

  it( 'saves a note only for its owner, into the shared vault until 5.1', async () => {
    const { id } = await reviewedJob()

    const refused = await signedInRequest( app, other ).post( `/api/jobs/${ id }/save` ).send( {} )
    const saved = await signedInRequest( app, owner ).post( `/api/jobs/${ id }/save` ).send( {} )

    expect( refused.status ).toBe( 404 )
    expect( saved.status ).toBe( 200 )
    expect( ( await readdir( ownerVault(), { recursive: true } ) ).length ).toBeGreaterThan( 0 )
  } )

  it( 'gives every user the folder list', async () => {
    const response = await signedInRequest( app, other ).get( '/api/vault/folders' )

    expect( response.status ).toBe( 200 )
  } )
} )
