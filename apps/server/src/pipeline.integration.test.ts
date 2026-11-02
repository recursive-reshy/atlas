// Node
import { access } from 'node:fs/promises'
import path from 'node:path'
// Packages
import { z } from 'zod'
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest'
// App
import { app } from './app.js'
// Test support
import { signedInRequest as request } from './test-support/auth.js'
// Config
import { config } from './config.js'
// Clients
import { checkTranscriptionModel } from './clients/openaiTranscription.client.js'
// Repositories
import { clearJobs, findJobById } from './repositories/jobStore.repository.js'
// Worker
import { startWorker } from './worker/worker.js'
// Test support
import { defaultTestAdmin } from './test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const HAPPY_URL = 'https://www.youtube.com/watch?v=cFoaK1OQRhw'
const MISSING_URL = 'https://www.youtube.com/watch?v=zzzzzzzzzzz'
const POLL_INTERVAL_MS = 2000
const JOB_DEADLINE_MS = 5 * 60 * 1000

const JobBody = z.object( {
  job: z.object( { status: z.string(), error: z.string().nullable() } ),
} )
const CreatedBody = z.object( { job_id: z.string() } )

type FinishedJob = { jobId: string, status: string, error: string | null }

let stopWorker: () => Promise< void >

const waitForJob = async ( jobId: string ): Promise< FinishedJob > => {
  const deadline = Date.now() + JOB_DEADLINE_MS

  while( Date.now() < deadline ) {
    const response = await request( app ).get( `/api/jobs/${ jobId }` ).expect( 200 )
    const { job } = JobBody.parse( response.body )

    if( [ 'ready_for_review', 'summary_failed', 'failed' ].includes( job.status ) ) {
      return { jobId, ...job }
    }

    await new Promise( ( resolve ) => setTimeout( resolve, POLL_INTERVAL_MS ) )
  }

  throw new Error( `Job ${ jobId } did not finish within 5 minutes` )
}

const queueAndWait = async ( url: string ): Promise< FinishedJob > => {
  const created = await request( app ).post( '/api/jobs' ).send( { url } ).expect( 202 )
  const { job_id: jobId } = CreatedBody.parse( created.body )

  return waitForJob( jobId )
}

const exists = async ( target: string ): Promise< boolean > => {
  return access( target ).then( () => true, () => false )
}

beforeAll( async () => {
  try {
    await checkTranscriptionModel( {
      baseUrl: config.openaiBaseUrl,
      apiKey: config.openaiApiKey,
      model: config.transcriptionModel,
    } )
  } catch( error ) {
    throw new Error(
      'OpenAI is not reachable with OPENAI_API_KEY. Set a real key in .env before running the '
      + 'integration tests.',
      { cause: error },
    )
  }

  stopWorker = startWorker()
} )

afterAll( async () => {
  await stopWorker()
  clearJobs( userId )
} )

describe( 'pipeline (real yt-dlp, ffmpeg and OpenAI)', () => {
  let failedJobId = ''

  it( 'fails a job for a video that does not exist and cleans up', async () => {
    const { jobId, status, error } = await queueAndWait( MISSING_URL )
    failedJobId = jobId

    expect( status ).toBe( 'failed' )
    expect( error ).toBeTruthy()

    await request( app ).get( `/api/jobs/${ jobId }/download` ).expect( 409 )
    expect( await exists( path.join( config.workDir, jobId ) ) ).toBe( false )
  } )

  it( 'still transcribes a real video after a failure', async () => {
    expect( failedJobId ).not.toBe( '' )

    const { jobId, status, error } = await queueAndWait( HAPPY_URL )

    expect( status ).toBe( 'ready_for_review' )
    expect( error ).toBeNull()

    const markdown = await request( app ).get( `/api/jobs/${ jobId }/download` )
    expect( markdown.status ).toBe( 200 )
    expect( markdown.headers[ 'content-type' ] ).toMatch( /text\/markdown/ )
    expect( markdown.text.startsWith( '---' ) ).toBe( true )
    expect( markdown.text ).toContain( `model: ${ config.transcriptionModel }` )

    const srt = await request( app ).get( `/api/jobs/${ jobId }/download?format=srt` )
    expect( srt.status ).toBe( 400 )

    const txt = await request( app ).get( `/api/jobs/${ jobId }/download?format=txt` )
    expect( txt.status ).toBe( 200 )
    expect( txt.text.trim() ).not.toBe( '' )

    const document = findJobById( userId, jobId )?.source_document
    const transcript = document?.kind === 'video' ? document : undefined
    expect( transcript?.meta.title ).toBeTruthy()
    expect( transcript?.meta.duration_seconds ).toBeGreaterThan( 0 )
    expect( transcript?.text.trim() ).not.toBe( '' )

    expect( await exists( path.join( config.workDir, jobId ) ) ).toBe( false )
  } )
} )
