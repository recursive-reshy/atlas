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
import {
  JobStatus,
  SourceDocument,
  VideoSource,
  parseNote,
} from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  VaultNotChosenError,
} from '../errors.js'
// Repositories
import {
  clearJobs,
  findJobById,
  insertJob,
  updateJob,
} from '../repositories/jobStore.repository.js'
import { insertLinkRun } from '../repositories/linkRuns.repository.js'
import {
  findSuggestions,
  insertSuggestions,
  listSuggestions,
  setStatus,
} from '../repositories/linkSuggestions.repository.js'
import {
  findLatestVersion,
  findProfileById,
  findProfileBySeedKey,
  setLastFolder,
} from '../repositories/promptProfiles.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
import { listTranscriptionRuns } from '../repositories/transcriptionRuns.repository.js'
import { insertFeed } from '../repositories/feeds.repository.js'
import { addStoredSource } from '../test-support/gmailSources.fixture.js'
// Services
import {
  acceptSuggestions,
  completeLinking,
  completeSummary,
  completeAcquisition,
  deleteExpiredJobs,
  discardJob,
  failJob,
  failLinking,
  failSummary,
  findJob,
  findSource,
  claimNextJob,
  getSource,
  listJobs,
  listLinkSuggestions,
  markStatus,
  queueJob,
  recordLinkRun,
  recordLinkSuggestions,
  recordSummaryRun,
  recordTranscriptionRun,
  recoverInterruptedJobs,
  regenerateSummary,
  rejectSuggestions,
  renderTranscript,
  retrySummary,
  runLinking,
  saveJob,
  submitPastedText,
  updateDraft,
} from './jobs.service.js'
// Models
import { assertKnownModel } from './models.service.js'
// Prompts
import {
  createProfile,
  deleteProfile,
  listProfiles,
  resolvePrompt,
  saveVersion,
} from './prompts.service.js'
// Clients
import { existingFolderSync, writeNote } from '../clients/vault.client.js'
// Formatters
import { formatNote } from '../formatters/note.formatter.js'
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Repositories
import { clearVaultDir } from '../repositories/users.repository.js'
// Logging
import { logger } from '../logger.js'
// Test support
import { createTestUser, defaultTestAdmin, defaultTestVaultPath } from '../test-support/auth.js'

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

const queueJobAt = async ( status: JobStatus ): Promise< string > => {
  const { id } = await queueJob( userId, { url } )

  if( status !== 'queued' ) {
    markStatus( userId, id, 'transcribing' )
  }
  if( status === 'ready_for_review' || status === 'summary_failed' ) {
    completeAcquisition( userId, id, { kind: 'video', ...transcript } )

    if( status === 'ready_for_review' ) {
      completeSummary( userId, id, '## Summary', [] )
    } else {
      failSummary( userId, id, 'earlier summary failure' )
    }
  }
  if( status === 'failed' ) failJob( userId, id, 'earlier failure' )

  return id
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

describe( 'queueJob', () => {
  it( 'returns a queued public job', async () => {
    const job = await queueJob( userId, { url } )

    expect( job ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      url,
      status: 'queued',
      error: null,
      created_at: startTime.toISOString(),
      updated_at: startTime.toISOString(),
      title: null,
      note_markdown: null,
      target_folder: null,
      default_folder: 'Mnemosyne',
      expires_at: null,
      saved_path: null,
      summary_model: null,
      prompt_profile_id: null,
      summary_usage: null,
      link_state: null,
      link_error: null,
      link_usage: null,
      source_type: 'video',
      feed_id: null,
      feed_name: null,
      gmail_source_id: null,
      gmail_source_name: null,
    } )
  } )

  it( 'does not expose a transcript property', async () => {
    expect( await queueJob( userId, { url } ) ).not.toHaveProperty( 'transcript' )
  } )

  it( 'produces a different id on each call', async () => {
    expect( ( await queueJob( userId, { url } ) ).id )
      .not.toBe( ( await queueJob( userId, { url } ) ).id )
  } )
} )

describe( 'findJob', () => {
  it( 'returns the public job', async () => {
    const { id } = await queueJob( userId, { url } )

    const job = findJob( userId, id )

    expect( job.id ).toBe( id )
    expect( job ).not.toHaveProperty( 'transcript' )
  } )

  it( 'returns the stored fields of a job', async () => {
    const { id } = await queueJob( userId, { url } )
    updateJob( userId, id, {
      title: 'A talk',
      expires_at: laterTime.toISOString(),
      saved_path: 'Mnemosyne/A talk.md',
    } )

    expect( findJob( userId, id ) ).toMatchObject( {
      title: 'A talk',
      expires_at: laterTime.toISOString(),
      saved_path: 'Mnemosyne/A talk.md',
    } )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => findJob( userId, 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'markStatus', () => {
  it( 'moves a video job from queued to transcribing', async () => {
    const { id } = await queueJob( userId, { url } )

    expect( markStatus( userId, id, 'transcribing' ).status ).toBe( 'transcribing' )
  } )

  it( 'updates updated_at and keeps created_at', async () => {
    const { id } = await queueJob( userId, { url } )
    vi.setSystemTime( laterTime )

    const job = markStatus( userId, id, 'transcribing' )

    expect( job.updated_at ).toBe( laterTime.toISOString() )
    expect( job.created_at ).toBe( startTime.toISOString() )
  } )

  it( 'throws ConflictError when skipping a step', async () => {
    const { id } = await queueJob( userId, { url } )

    expect( () => markStatus( userId, id, 'fetching' ) ).toThrow( ConflictError )
    expect( () => markStatus( userId, id, 'fetching' ) ).toThrow(
      'Cannot move job from queued to fetching',
    )
  } )

  it( 'logs a refused move with the statuses and source', async () => {
    const warnSpy = vi.spyOn( logger, 'warn' ).mockImplementation( () => undefined )
    const { id } = await queueJob( userId, { url } )

    expect( () => markStatus( userId, id, 'fetching' ) ).toThrow( ConflictError )

    expect( warnSpy ).toHaveBeenCalledWith(
      { from: 'queued', to: 'fetching', source_type: 'video' },
      'Job move refused',
    )
  } )

  it( 'throws ConflictError when moving backwards', async () => {
    const id = await queueJobAt( 'transcribing' )

    expect( () => markStatus( userId, id, 'fetching' ) ).toThrow( ConflictError )
  } )

  it( 'throws ConflictError from a final status', async () => {
    const id = await queueJobAt( 'failed' )

    expect( () => markStatus( userId, id, 'transcribing' ) ).toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => markStatus( userId, 'missing', 'transcribing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'failJob', () => {
  it.each( [ 'queued', 'transcribing' ] as const )(
    'fails a job from %s with the message',
    async ( status ) => {
      const id = await queueJobAt( status )

      const job = failJob( userId, id, 'yt-dlp exited with 1' )

      expect( job.status ).toBe( 'failed' )
      expect( job.error ).toBe( 'yt-dlp exited with 1' )
    },
  )

  it.each( [ 'failed' ] as const )( 'throws ConflictError from %s', async ( status ) => {
    const id = await queueJobAt( status )

    expect( () => failJob( userId, id, 'late' ) ).toThrow( ConflictError )
  } )
} )

describe( 'renderTranscript', () => {
  const queueReviewJob = async (
    outcome: 'ready_for_review' | 'summary_failed',
  ): Promise< string > => {
    const { id } = await queueJob( userId, { url } )

    markStatus( userId, id, 'transcribing' )
    completeAcquisition( userId, id, { kind: 'video', ...transcriptFixture } )

    if( outcome === 'ready_for_review' ) {
      completeSummary( userId, id, '## Summary', [] )
    } else {
      failSummary( userId, id, 'Rate limited' )
    }

    return id
  }

  it.each( [
    [ 'md', 'Video title.md', 'text/markdown; charset=utf-8', formatMarkdown ],
    [ 'txt', 'Video title.txt', 'text/plain; charset=utf-8', formatTxt ],
  ] as const )(
    'renders a review job as %s',
    async ( format, filename, contentType, formatter ) => {
      const id = await queueReviewJob( 'ready_for_review' )

      const rendered = renderTranscript( userId, id, format )

      expect( rendered ).toEqual( {
        filename,
        contentType,
        body: formatter( transcriptFixture ),
      } )
    },
  )

  it( 'still renders after the summary failed', async () => {
    const id = await queueReviewJob( 'summary_failed' )

    expect( renderTranscript( userId, id, 'md' ).body ).toBe( formatMarkdown( transcriptFixture ) )
  } )

  it( 'throws ConflictError once the job is saved', async () => {
    const id = await queueReviewJob( 'ready_for_review' )
    updateJob( userId, id, { status: 'saved', source_document: null } )

    expect( () => renderTranscript( userId, id, 'md' ) ).toThrow(
      new ConflictError( 'Transcript not ready' ),
    )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => renderTranscript( userId, 'missing', 'md' ) ).toThrow( NotFoundError )
  } )

  it.each( [
    'queued',
    'transcribing',
    'summarizing',
    'failed',
  ] as const )(
    'throws ConflictError from %s',
    async ( status ) => {
      const id = status === 'summarizing' ? await queueSummarizing() : await queueJobAt( status )

      expect( () => renderTranscript( userId, id, 'md' ) ).toThrow(
        new ConflictError( 'Transcript not ready' ),
      )
    },
  )
} )

describe( 'claimNextJob', () => {
  it( 'returns a summarizing job so it can be resumed', async () => {
    const id = await queueSummarizing()

    expect( claimNextJob()?.job.id ).toBe( id )
  } )

  it( 'returns undefined when no jobs exist', () => {
    expect( claimNextJob() ).toBeUndefined()
  } )

  it( 'returns the oldest queued job', async () => {
    const first = await queueJob( userId, { url: 'https://www.youtube.com/watch?v=a' } )
    await queueJob( userId, { url: 'https://www.youtube.com/watch?v=b' } )

    expect( claimNextJob() ).toEqual( { job: first, userId } )
  } )

  it( 'skips jobs that are no longer queued', async () => {
    const first = await queueJob( userId, { url: 'https://www.youtube.com/watch?v=a' } )
    const second = await queueJob( userId, { url: 'https://www.youtube.com/watch?v=b' } )
    markStatus( userId, first.id, 'transcribing' )

    expect( claimNextJob() ).toEqual( { job: second, userId } )
  } )

  it( 'returns undefined when every job has moved on', async () => {
    const first = await queueJob( userId, { url: 'https://www.youtube.com/watch?v=a' } )
    const second = await queueJob( userId, { url: 'https://www.youtube.com/watch?v=b' } )
    markStatus( userId, first.id, 'transcribing' )
    markStatus( userId, second.id, 'transcribing' )

    expect( claimNextJob() ).toBeUndefined()
  } )

  it( 'returns a job without a transcript field', async () => {
    await queueJob( userId, { url: 'https://www.youtube.com/watch?v=a' } )

    expect( claimNextJob() ).not.toHaveProperty( 'transcript' )
  } )
} )

describe( 'recoverInterruptedJobs', () => {
  it( 'fails jobs left mid-processing and returns how many', async () => {
    const queued = await queueJobAt( 'queued' )
    const transcribing = await queueJobAt( 'transcribing' )
    const finished = await queueJobAt( 'ready_for_review' )
    vi.setSystemTime( laterTime )

    expect( recoverInterruptedJobs() ).toBe( 1 )

    expect( findJob( userId, transcribing ) ).toMatchObject( {
      status: 'failed',
      error: 'Interrupted by restart',
      updated_at: laterTime.toISOString(),
    } )
    expect( findJob( userId, queued ).status ).toBe( 'queued' )
    expect( findJob( userId, finished ).status ).toBe( 'ready_for_review' )
  } )

  it( 'returns 0 when nothing needs recovery', () => {
    expect( recoverInterruptedJobs() ).toBe( 0 )
  } )
} )

const queueSummarizing = async (): Promise< string > => {
  const id = await queueJobAt( 'transcribing' )
  completeAcquisition( userId, id, { kind: 'video', ...transcript } )

  return id
}

describe( 'completeAcquisition', () => {
  it( 'moves a transcribing job to summarizing and stores transcript and title', async () => {
    const id = await queueJobAt( 'transcribing' )

    const job = completeAcquisition( userId, id, { kind: 'video', ...transcript } )

    expect( job.status ).toBe( 'summarizing' )
    expect( job.title ).toBe( 'A talk' )
    expect( job ).not.toHaveProperty( 'transcript' )
    expect( findJobById( userId, id )?.source_document ).toEqual( { kind: 'video', ...transcript } )
  } )

  it.each( [ 'queued', 'failed' ] as const )(
    'throws ConflictError from %s and changes nothing',
    async ( status ) => {
      const id = await queueJobAt( status )
      const before = findJobById( userId, id )

      expect( () => completeAcquisition( userId, id, { kind: 'video', ...transcript } ) )
        .toThrow( ConflictError )
      expect( findJobById( userId, id ) ).toEqual( before )
    },
  )
} )

describe( 'completeSummary', () => {
  it( 'stores the note and sets the expiry from the review TTL', async () => {
    const id = await queueSummarizing()

    const job = completeSummary( userId, id, '## Summary\nText', [ 'rust' ] )

    expect( job ).toMatchObject( {
      status: 'ready_for_review',
      error: null,
      expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
    } )
  } )

  it( 'stores the whole note: properties from the transcript, today as created', async () => {
    const id = await queueSummarizing()

    const job = completeSummary( userId, id, '## Summary\nText\n\n', [ 'Rust', 'mnemosyne' ] )

    expect( job.note_markdown ).toBe( formatNote( {
      title: transcript.meta.title,
      tags: [ 'rust' ],
      body: '## Summary\nText',
      document: { kind: 'video', ...transcript },
      created: '2026-10-14',
    } ) )
    expect( job.target_folder ).toBeNull()
  } )

  it.each( [ 'queued', 'transcribing', 'failed' ] as const )(
    'throws ConflictError from %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( () => completeSummary( userId, id, 'x', [] ) ).toThrow( ConflictError )
    },
  )

  it( 'throws ConflictError when called twice', async () => {
    const id = await queueSummarizing()
    completeSummary( userId, id, 'x', [] )

    expect( () => completeSummary( userId, id, 'y', [] ) ).toThrow( ConflictError )
  } )
} )

describe( 'failSummary', () => {
  it( 'moves a summarizing job to summary_failed with the error and an expiry', async () => {
    const id = await queueSummarizing()

    const job = failSummary( userId, id, 'Rate limited' )

    expect( job ).toMatchObject( {
      status: 'summary_failed',
      error: 'Rate limited',
      expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
    } )
    expect( findJobById( userId, id )?.source_document ).toEqual( { kind: 'video', ...transcript } )
  } )

  it( 'throws ConflictError from a non-summarizing status', async () => {
    const id = await queueJobAt( 'transcribing' )

    expect( () => failSummary( userId, id, 'x' ) ).toThrow( ConflictError )
  } )
} )

describe( 'failJob after the summary steps', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'refuses to fail a job in %s',
    async ( status ) => {
      const id = await queueSummarizing()

      if( status === 'ready_for_review' ) {
        completeSummary( userId, id, 'x', [] )
      } else {
        failSummary( userId, id, 'x' )
      }

      expect( () => failJob( userId, id, 'late' ) ).toThrow( ConflictError )
      expect( findJob( userId, id ).status ).toBe( status )
    },
  )

  it( 'refuses to fail a saved job', async () => {
    const id = await queueSummarizing()
    completeSummary( userId, id, 'x', [] )
    updateJob( userId, id, { status: 'saved' } )

    expect( () => failJob( userId, id, 'late' ) ).toThrow( ConflictError )
  } )

  it( 'can still fail a summarizing job', async () => {
    const id = await queueSummarizing()

    expect( failJob( userId, id, 'boom' ).status ).toBe( 'failed' )
  } )
} )

describe( 'getSource', () => {
  it( 'returns the stored transcript', async () => {
    const id = await queueSummarizing()

    expect( getSource( userId, id ) ).toEqual( { kind: 'video', ...transcript } )
  } )

  it( 'throws NotFoundError for an unknown job', () => {
    expect( () => getSource( userId, 'missing' ) ).toThrow( NotFoundError )
  } )

  it( 'throws when the job has no transcript', async () => {
    const { id } = await queueJob( userId, { url } )

    expect( () => getSource( userId, id ) ).toThrow( 'has no transcript' )
  } )
} )

describe( 'listJobs', () => {
  it( 'returns public jobs, newest first', async () => {
    const first = await queueJob( userId, { url } )
    vi.setSystemTime( laterTime )
    const second = await queueJob( userId, { url } )

    const jobs = listJobs( userId )

    expect( jobs.map( ( { id } ) => id ) ).toEqual( [ second.id, first.id ] )
    expect( jobs[ 0 ] ).not.toHaveProperty( 'transcript' )
  } )

  it( 'leaves out failed and saved jobs', async () => {
    const failed = await queueJobAt( 'failed' )
    const review = await queueJobAt( 'ready_for_review' )

    expect( listJobs( userId ).map( ( { id } ) => id ) ).toEqual( [ review ] )
    expect( listJobs( userId ).map( ( { id } ) => id ) ).not.toContain( failed )
  } )
} )

describe( 'findSource', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'returns the transcript when the job is %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( findSource( userId, id ) ).toEqual( { kind: 'video', ...transcript } )
    },
  )

  it( 'throws ConflictError while summarizing', async () => {
    const id = await queueSummarizing()

    expect( () => findSource( userId, id ) ).toThrow( new ConflictError( 'Transcript not ready' ) )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => findSource( userId, 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'folder memory', () => {
  const draft = '---\ntitle: "Edited title"\nsource: "x"\nchannel: "x"\nduration: "x"\n'
    + 'created: 2020-01-01\ntags: []\n---\n\n## Summary\nEdited.\n'

  const profileId = ( name: string ): string => {
    return listProfiles( userId ).find( ( profile ) => profile.name === name )?.id ?? ''
  }

  const reviewJob = async ( profile: string | null ): Promise< string > => {
    const { id } = await queueJob( userId, { url, profile_id: profile ?? undefined } )

    markStatus( userId, id, 'transcribing' )
    completeAcquisition( userId, id, { kind: 'video', ...transcript } )
    completeSummary( userId, id, '## Summary', [] )
    updateDraft( userId, id, { note_markdown: draft } )

    return id
  }

  describe( 'default_folder', () => {
    it( 'is the profile\'s last folder for a job in review', async () => {
      const study = profileId( 'Study' )
      setLastFolder( userId, study, 'Learning/React' )

      expect( findJob( userId, await reviewJob( study ) ).default_folder ).toBe( 'Learning/React' )
      expect( existingFolderSyncMock )
        .toHaveBeenCalledWith( defaultTestVaultPath(), 'Learning/React' )
    } )

    it( 'is the configured folder when the profile has no last folder', async () => {
      expect( findJob( userId, await reviewJob( profileId( 'Study' ) ) ).default_folder )
        .toBe( 'Mnemosyne' )
    } )

    it( 'is the configured folder when the last folder is gone from the vault', async () => {
      const study = profileId( 'Study' )
      setLastFolder( userId, study, 'Learning/Gone' )
      existingFolderSyncMock.mockReturnValue( false )

      expect( findJob( userId, await reviewJob( study ) ).default_folder ).toBe( 'Mnemosyne' )
    } )

    it( 'is the configured folder when the job has no profile', async () => {
      setLastFolder( userId, profileId( 'Study' ), 'Learning/React' )

      expect( findJob( userId, await reviewJob( null ) ).default_folder ).toBe( 'Mnemosyne' )
    } )

    it( 'keeps each profile\'s own folder', async () => {
      setLastFolder( userId, profileId( 'Study' ), 'Learning/React' )
      setLastFolder( userId, profileId( 'Coding' ), 'Projects' )

      expect( findJob( userId, await reviewJob( profileId( 'Coding' ) ) ).default_folder )
        .toBe( 'Projects' )
      expect( findJob( userId, await reviewJob( profileId( 'Business ideas' ) ) ).default_folder )
        .toBe( 'Mnemosyne' )
    } )

    it( 'is the configured folder outside review, without looking at the vault', async () => {
      const study = profileId( 'Study' )
      setLastFolder( userId, study, 'Learning/React' )
      const { id } = await queueJob( userId, { url, profile_id: study } )

      expect( findJob( userId, id ).default_folder ).toBe( 'Mnemosyne' )
      expect( existingFolderSyncMock ).not.toHaveBeenCalled()
    } )

    it( 'shows the next Study job the folder the last one was saved to', async () => {
      const study = profileId( 'Study' )
      const first = await reviewJob( study )
      updateDraft( userId, first, { target_folder: 'Learning/React' } )
      writeNoteMock.mockResolvedValue( 'Learning/React/Edited title.md' )

      await saveJob( userId, first )

      expect( findJob( userId, await reviewJob( study ) ).default_folder ).toBe( 'Learning/React' )
    } )
  } )

  describe( 'saving', () => {
    it( 'writes to the profile\'s last folder when no folder was picked', async () => {
      const study = profileId( 'Study' )
      setLastFolder( userId, study, 'Learning/React' )

      await saveJob( userId, await reviewJob( study ) )

      expect( writeNoteMock ).toHaveBeenCalledWith(
        expect.any( String ),
        'Learning/React',
        'Edited title',
        expect.any( String ),
      )
    } )

    it( 'remembers the picked folder for that profile only', async () => {
      const study = profileId( 'Study' )
      const id = await reviewJob( study )
      updateDraft( userId, id, { target_folder: 'Learning/Rust' } )

      await saveJob( userId, id )

      expect( findProfileById( userId, study )?.last_folder ).toBe( 'Learning/Rust' )
      expect( findProfileById( userId, profileId( 'Coding' ) )?.last_folder ).toBeNull()
    } )

    it( 'remembers the folder it used when none was picked', async () => {
      const study = profileId( 'Study' )
      const id = await reviewJob( study )

      await saveJob( userId, id )

      expect( findProfileById( userId, study )?.last_folder ).toBe( 'Mnemosyne' )
    } )

    it( 'remembers nothing when the write fails', async () => {
      const study = profileId( 'Study' )
      const id = await reviewJob( study )
      updateDraft( userId, id, { target_folder: 'Learning/Rust' } )
      writeNoteMock.mockRejectedValue( new Error( 'EACCES' ) )

      await expect( saveJob( userId, id ) ).rejects.toThrow( 'EACCES' )

      expect( findProfileById( userId, study )?.last_folder ).toBeNull()
    } )

    it( 'saves a job with no profile and remembers nothing', async () => {
      const id = await reviewJob( null )
      updateDraft( userId, id, { target_folder: 'Learning/Rust' } )

      await expect( saveJob( userId, id ) ).resolves.toBe( 'Mnemosyne/Edited title.md' )

      expect( listProfiles( userId ).map( ( profile ) => findProfileById(
        userId,
        profile.id,
      )?.last_folder ) )
        .toEqual( listProfiles( userId ).map( () => null ) )
    } )
  } )
} )

describe( 'saveJob', () => {
  const draft = [
    '---',
    'title: "Edited title"',
    'source: "x"',
    'channel: "x"',
    'duration: "x"',
    'created: 2020-01-01',
    'tags: [rust, Big Idea]',
    '---',
    '',
    '## Summary',
    'Edited.',
    '',
  ].join( '\n' )

  const queueDrafted = async ( target_folder?: string ): Promise< string > => {
    const id = await queueJobAt( 'ready_for_review' )
    updateDraft( userId, id, { note_markdown: draft, target_folder: target_folder ?? null } )

    return id
  }

  it( 'refuses until the user has chosen a vault, and keeps the job in review', async () => {
    const id = await queueDrafted()

    clearVaultDir( userId )

    await expect( saveJob( userId, id ) ).rejects.toThrow( VaultNotChosenError )
    expect( writeNoteMock ).not.toHaveBeenCalled()
    expect( findJob( userId, id ).status ).toBe( 'ready_for_review' )
  } )

  it( 'writes the stored draft, with locked properties and today as created', async () => {
    const id = await queueDrafted()

    await saveJob( userId, id )

    expect( writeNoteMock ).toHaveBeenCalledExactlyOnceWith(
      expect.any( String ),
      'Mnemosyne',
      'Edited title',
      [
        '---',
        'title: "Edited title"',
        `source: "${ url }"`,
        'channel: "Some Channel"',
        'duration: "01:00"',
        'created: 2026-10-14',
        'tags: [mnemosyne, rust, big-idea]',
        '---',
        '',
        '## Summary',
        'Edited.',
        '',
      ].join( '\n' ),
    )
  } )

  it( 'writes to the chosen folder', async () => {
    const id = await queueDrafted( 'Learning/AI' )

    await saveJob( userId, id )

    expect( writeNoteMock ).toHaveBeenCalledWith(
      expect.any( String ),
      'Learning/AI',
      'Edited title',
      expect.any( String ),
    )
  } )

  it( 'marks the job saved, keeps the title and note, and drops the transcript', async () => {
    const id = await queueDrafted()
    const note = findJobById( userId, id )?.note_markdown

    const savedPath = await saveJob( userId, id )

    expect( savedPath ).toBe( 'Mnemosyne/Edited title.md' )
    expect( findJob( userId, id ) ).toMatchObject( {
      status: 'saved',
      saved_path: 'Mnemosyne/Edited title.md',
      title: 'Edited title',
      expires_at: null,
    } )
    expect( findJobById( userId, id )?.source_document ).toBeNull()
    expect( findJobById( userId, id )?.note_markdown ).toBe( note )
  } )

  it( 'uses the path the vault returns, collision suffix included', async () => {
    const id = await queueDrafted()
    writeNoteMock.mockResolvedValue( 'Mnemosyne/Edited title (2).md' )

    await expect( saveJob( userId, id ) ).resolves.toBe( 'Mnemosyne/Edited title (2).md' )
  } )

  it( 'keeps the job in review when the folder is no longer valid', async () => {
    const id = await queueDrafted()
    updateJob( userId, id, { target_folder: '../outside' } )
    writeNoteMock.mockRejectedValue( new ValidationError( 'outside the vault' ) )

    await expect( saveJob( userId, id ) ).rejects.toThrow( ValidationError )

    expect( findJob( userId, id ).status ).toBe( 'ready_for_review' )
  } )

  it( 'throws ConflictError when there is no draft', async () => {
    const id = await queueDrafted()
    updateJob( userId, id, { note_markdown: null } )

    await expect( saveJob( userId, id ) ).rejects.toThrow( ConflictError )
    expect( writeNoteMock ).not.toHaveBeenCalled()
  } )

  it( 'keeps the job in review with its transcript when the write fails', async () => {
    const id = await queueDrafted()
    writeNoteMock.mockRejectedValue( new Error( 'EACCES' ) )

    await expect( saveJob( userId, id ) ).rejects.toThrow( 'EACCES' )

    expect( findJob( userId, id ).status ).toBe( 'ready_for_review' )
    expect( findJobById( userId, id )?.source_document ).toEqual( { kind: 'video', ...transcript } )
  } )

  it.each( [ 'queued', 'transcribing', 'summary_failed', 'failed' ] as const )(
    'throws ConflictError from %s without writing',
    async ( status ) => {
      const id = await queueJobAt( status )

      await expect( saveJob( userId, id ) ).rejects.toThrow( ConflictError )
      expect( writeNoteMock ).not.toHaveBeenCalled()
    },
  )

  it( 'throws ConflictError when saved twice', async () => {
    const id = await queueDrafted()
    await saveJob( userId, id )

    await expect( saveJob( userId, id ) ).rejects.toThrow( ConflictError )
    expect( writeNoteMock ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'throws NotFoundError for an unknown id', async () => {
    await expect( saveJob( userId, 'missing' ) ).rejects.toThrow( NotFoundError )
  } )
} )

describe( 'retrySummary', () => {
  it( 'moves a failed summary back to summarizing, clearing error and expiry', async () => {
    const id = await queueJobAt( 'summary_failed' )

    const job = retrySummary( userId, id )

    expect( job ).toMatchObject( { status: 'summarizing', error: null, expires_at: null } )
    expect( findJobById( userId, id )?.source_document ).toEqual( { kind: 'video', ...transcript } )
  } )

  it( 'makes the job runnable again', async () => {
    const id = await queueJobAt( 'summary_failed' )

    retrySummary( userId, id )

    expect( claimNextJob()?.job.id ).toBe( id )
  } )

  it.each( [ 'queued', 'transcribing', 'ready_for_review', 'failed' ] as const )(
    'throws ConflictError from %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( () => retrySummary( userId, id ) ).toThrow( ConflictError )
    },
  )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => retrySummary( userId, 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'discardJob', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'deletes a job that is %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      discardJob( userId, id )

      expect( findJobById( userId, id ) ).toBeUndefined()
      expect( () => findJob( userId, id ) ).toThrow( NotFoundError )
    },
  )

  it.each( [ 'queued', 'transcribing', 'failed' ] as const )(
    'throws ConflictError from %s and keeps the job',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( () => discardJob( userId, id ) ).toThrow( ConflictError )
      expect( findJob( userId, id ).status ).toBe( status )
    },
  )

  it( 'throws ConflictError for a summarizing job', async () => {
    const id = await queueSummarizing()

    expect( () => discardJob( userId, id ) ).toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => discardJob( userId, 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'deleteExpiredJobs', () => {
  it( 'deletes jobs past their expiry and returns how many', async () => {
    const expiredReview = await queueJobAt( 'ready_for_review' )
    const expiredFailed = await queueJobAt( 'summary_failed' )
    const fresh = await queueJobAt( 'ready_for_review' )
    updateJob( userId, expiredReview, { expires_at: '2026-10-14T09:00:00.000Z' } )
    updateJob( userId, expiredFailed, { expires_at: '2026-10-14T09:59:59.000Z' } )
    updateJob( userId, fresh, { expires_at: '2026-10-14T10:00:01.000Z' } )

    expect( deleteExpiredJobs() ).toBe( 2 )

    expect( findJobById( userId, expiredReview ) ).toBeUndefined()
    expect( findJobById( userId, expiredFailed ) ).toBeUndefined()
    expect( findJob( userId, fresh ).status ).toBe( 'ready_for_review' )
  } )

  it( 'returns 0 when nothing has expired', async () => {
    await queueJobAt( 'ready_for_review' )

    expect( deleteExpiredJobs() ).toBe( 0 )
  } )
} )

describe( 'updateDraft', () => {
  const queueReview = async (): Promise< string > => {
    const id = await queueSummarizing()
    completeSummary( userId, id, '## Summary\nText', [ 'rust' ] )

    return id
  }

  const draft = ( overrides: Record< string, string > = {} ): string => {
    const properties = {
      title: 'My title',
      source: 'https://wrong.example',
      channel: 'Wrong',
      duration: '9:99',
      created: '1999-01-01',
      ...overrides,
    }

    return [
      '---',
      `title: "${ properties.title }"`,
      `source: "${ properties.source }"`,
      `channel: "${ properties.channel }"`,
      `duration: "${ properties.duration }"`,
      `created: ${ properties.created }`,
      'tags: [rust, Big Idea]',
      '---',
      '',
      '## Edited',
      '',
    ].join( '\n' )
  }

  it( 'stores the note with locked properties re-applied and syncs the title', async () => {
    const id = await queueReview()

    const job = updateDraft( userId, id, { note_markdown: draft() } )

    expect( job.title ).toBe( 'My title' )
    expect( job.note_markdown ).toBe( [
      '---',
      'title: "My title"',
      `source: "${ url }"`,
      'channel: "Some Channel"',
      'duration: "01:00"',
      'created: 2026-10-14',
      'tags: [mnemosyne, rust, big-idea]',
      '---',
      '',
      '## Edited',
      '',
    ].join( '\n' ) )
    expect( findJobById( userId, id )?.note_markdown ).toBe( job.note_markdown )
  } )

  it.each( [ 'not a note', '---\ntitle: "A\ntags: [a\n---\n\nBody\n' ] )(
    'rejects %j with ValidationError and stores nothing',
    async ( note ) => {
      const id = await queueReview()
      const before = findJobById( userId, id )

      expect( () => updateDraft( userId, id, { note_markdown: note } ) ).toThrow( ValidationError )
      expect( () => updateDraft( userId, id, { note_markdown: note } ) )
        .toThrow( /front-matter invalid/ )
      expect( findJobById( userId, id ) ).toEqual( before )
    },
  )

  it( 'sets and clears the target folder without requiring it to exist', async () => {
    const id = await queueReview()

    expect( updateDraft( userId, id, { target_folder: 'New/Nested' } ).target_folder )
      .toBe( 'New/Nested' )
    expect( updateDraft( userId, id, { target_folder: null } ).target_folder ).toBeNull()
  } )

  it.each( [ '../x', '/abs', 'a//b', '.hidden' ] )(
    'rejects the folder %j with ValidationError',
    async ( folder ) => {
      const id = await queueReview()

      expect( () => updateDraft( userId, id, { target_folder: folder } ) )
        .toThrow( ValidationError )
      expect( findJobById( userId, id )?.target_folder ).toBeNull()
    },
  )

  it( 'restarts the expiry and bumps updated_at, for a folder-only change too', async () => {
    const id = await queueReview()
    vi.setSystemTime( laterTime )

    const job = updateDraft( userId, id, { target_folder: 'A' } )

    expect( job.expires_at ).toBe( new Date( laterTime.getTime() + 24 * 3_600_000 ).toISOString() )
    expect( job.updated_at ).toBe( laterTime.toISOString() )
  } )

  it( 'leaves the note alone when only the folder changes', async () => {
    const id = await queueReview()
    const before = findJobById( userId, id )?.note_markdown

    expect( updateDraft( userId, id, { target_folder: 'A' } ).note_markdown ).toBe( before )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => updateDraft( userId, crypto.randomUUID(), { target_folder: 'A' } ) )
      .toThrow( NotFoundError )
  } )

  it.each( [ 'queued', 'transcribing', 'failed', 'summary_failed' ] as const )(
    'throws ConflictError from %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( () => updateDraft( userId, id, { target_folder: 'A' } ) ).toThrow( ConflictError )
    },
  )
} )

describe( 'recordTranscriptionRun', () => {
  it( 'stores a run with the tokens and the cost they come to', async () => {
    const id = await queueJobAt( 'transcribing' )

    recordTranscriptionRun( userId, id, {
      model: 'gemini-3.8-flash',
      duration_seconds: 3600,
      input_tokens: 1_000_000,
      output_tokens: 200_000,
      outcome: 'ok',
      error: null,
    } )

    expect( listTranscriptionRuns( userId, id ) ).toEqual( [ {
      id: 1,
      job_id: id,
      model: 'gemini-3.8-flash',
      duration_seconds: 3600,
      input_tokens: 1_000_000,
      output_tokens: 200_000,
      cost_usd: 1.5,
      outcome: 'ok',
      error: null,
      created_at: startTime.toISOString(),
    } ] )
  } )

  it( 'stores a failed run with its error, no tokens and no cost', async () => {
    const id = await queueJobAt( 'transcribing' )

    recordTranscriptionRun( userId, id, {
      model: 'gemini-3.8-flash',
      duration_seconds: 60,
      input_tokens: null,
      output_tokens: null,
      outcome: 'error',
      error: 'Gemini request failed (500)',
    } )

    expect( listTranscriptionRuns( userId, id ) ).toMatchObject( [ {
      outcome: 'error',
      error: 'Gemini request failed (500)',
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    } ] )
  } )

  it( 'has no cost for a model that is not priced', async () => {
    const id = await queueJobAt( 'transcribing' )

    recordTranscriptionRun( userId, id, {
      model: 'some-new-model',
      duration_seconds: 60,
      input_tokens: 100,
      output_tokens: 10,
      outcome: 'ok',
      error: null,
    } )

    expect( listTranscriptionRuns( userId, id )[ 0 ] ).toMatchObject( {
      input_tokens: 100,
      cost_usd: null,
    } )
  } )
} )

describe( 'recordSummaryRun and summary_usage', () => {
  const version = (): number => resolvePrompt( userId, null ).version.id

  it( 'has no usage before the first attempt', async () => {
    expect( findJob( userId, await queueJobAt( 'queued' ) ).summary_usage ).toBeNull()
  } )

  it( 'records a succeeded run with tokens and the estimated cost', async () => {
    const id = await queueJobAt( 'ready_for_review' )

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1_000_000, output_tokens: 100_000 },
    } )

    expect( findJob( userId, id ).summary_usage ).toEqual( {
      last_run: {
        model: 'claude-sonnet-5-5',
        profile_id: resolvePrompt( userId, null ).profile.id,
        profile_name: 'Business ideas',
        prompt_version: 1,
        input_tokens: 1_000_000,
        output_tokens: 100_000,
        cost_usd: 3,
        outcome: 'succeeded',
        created_at: startTime.toISOString(),
      },
      run_count: 1,
      total_input_tokens: 1_000_000,
      total_output_tokens: 100_000,
      total_cost_usd: 3,
    } )
  } )

  it( 'records tokens but no cost for a model without a price', async () => {
    const id = await queueJobAt( 'ready_for_review' )

    recordSummaryRun( userId, id, {
      model: 'claude-haiku-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 10, output_tokens: 5 },
    } )

    expect( findJob( userId, id ).summary_usage ).toMatchObject( {
      last_run: { input_tokens: 10, output_tokens: 5, cost_usd: null },
      total_cost_usd: null,
    } )
  } )

  it( 'records a failed run with the billed tokens and the error', async () => {
    const id = await queueJobAt( 'summary_failed' )

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
      error: 'Summary was cut off',
    } )

    expect( findJob( userId, id ).summary_usage ).toMatchObject( {
      last_run: { outcome: 'failed', input_tokens: 1_000_000, cost_usd: 2 },
      total_cost_usd: 2,
    } )
  } )

  it( 'records a failed run without tokens or cost when no response came back', async () => {
    const id = await queueJobAt( 'summary_failed' )

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: undefined,
      error: 'Summary request failed: Overloaded',
    } )

    expect( findJob( userId, id ).summary_usage ).toEqual( expect.objectContaining( {
      last_run: expect.objectContaining( {
        outcome: 'failed',
        input_tokens: null,
        output_tokens: null,
        cost_usd: null,
      } ) as unknown,
      run_count: 1,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
    } ) )
  } )

  it( 'reports the latest run, the count and the totals over several runs', async () => {
    const id = await queueJobAt( 'ready_for_review' )
    const first = version()
    saveVersion( userId, resolvePrompt( userId, null ).profile.id, 'A newer prompt' )

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: first,
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    } )
    recordSummaryRun( userId, id, {
      model: 'claude-opus-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 500_000, output_tokens: 100_000 },
    } )

    expect( findJob( userId, id ).summary_usage ).toMatchObject( {
      last_run: { model: 'claude-opus-5-5', prompt_version: 2, cost_usd: 4 },
      run_count: 2,
      total_input_tokens: 1_500_000,
      total_output_tokens: 100_000,
      total_cost_usd: 6,
    } )
  } )

  it( 'has no total cost when any run with tokens is unpriced', async () => {
    const id = await queueJobAt( 'ready_for_review' )

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1000, output_tokens: 10 },
    } )
    recordSummaryRun( userId, id, {
      model: 'claude-haiku-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1000, output_tokens: 10 },
    } )

    expect( findJob( userId, id ).summary_usage?.total_cost_usd ).toBeNull()
  } )

  it( 'keeps the profile name after the profile is deleted', async () => {
    const id = await queueJobAt( 'ready_for_review' )
    const { id: profileId } = createProfile( userId, { name: 'Temporary', guidance: 'x' } )
    const versionId = resolvePrompt( userId, profileId ).version.id

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: versionId,
      usage: { input_tokens: 1, output_tokens: 1 },
    } )
    deleteProfile( userId, profileId )

    expect( findJob( userId, id ).summary_usage?.last_run ).toMatchObject( {
      profile_id: profileId,
      profile_name: 'Temporary',
    } )
  } )
} )

describe( 'queueJob and videos that are not on YouTube (ADR 0081)', () => {
  it.each( [
    'https://vimeo.com/123',
    'https://www.dailymotion.com/video/x1',
    'https://www.tiktok.com/@a/video/1',
    'https://www.twitch.tv/videos/1',
  ] )( 'refuses %s instead of reading it as an article', async ( link ) => {
    await expect( queueJob( userId, { url: link } ) )
      .rejects.toThrow( new ValidationError( 'Only YouTube videos are supported' ) )
    expect( listJobs( userId ) ).toEqual( [] )
  } )

  it( 'refuses a video chosen for a page that is not YouTube', async () => {
    await expect( queueJob( userId, { url: 'https://example.com/clip', source_type: 'video' } ) )
      .rejects.toThrow( ValidationError )
  } )

  it( 'still queues such a page when it is said to be an article', async () => {
    const job = await queueJob( userId, { url: 'https://vimeo.com/123', source_type: 'article' } )

    expect( job ).toMatchObject( { status: 'queued', source_type: 'article' } )
  } )

  it( 'does not refuse a feed item whose text is already in hand', async () => {
    const document = {
      kind: 'article' as const,
      meta: {
        title: 'Post',
        source: 'https://vimeo.com/blog/post',
        author: null,
        site: 'Vimeo blog',
        published: null,
        fetched_at: startTime.toISOString(),
        origin: 'feed' as const,
      },
      markdown: 'x'.repeat( 400 ),
    }

    const job = await queueJob( userId, { url: 'https://vimeo.com/blog/post' }, { document } )

    expect( job.status ).toBe( 'summarizing' )
  } )
} )

describe( 'queueJob options', () => {
  const codingId = (): string => listProfiles( userId )
    .find( ( { name } ) => name === 'Coding' )?.id ?? ''

  it( 'stores the model and profile when given', async () => {
    const profileId = codingId()

    const job = await queueJob(
      userId,
      { url: url, model: 'claude-opus-5-5', profile_id: profileId },
    )

    expect( assertKnownModelMock ).toHaveBeenCalledWith( userId, 'claude-opus-5-5' )
    expect( job )
      .toMatchObject( { summary_model: 'claude-opus-5-5', prompt_profile_id: profileId } )
    expect( findJobById( userId, job.id ) ).toMatchObject( {
      summary_model: 'claude-opus-5-5',
      prompt_profile_id: profileId,
    } )
  } )

  it( 'stores null for both when no options are given', async () => {
    const none = { summary_model: null, prompt_profile_id: null }

    expect( await queueJob( userId, { url } ) ).toMatchObject( none )
    expect( await queueJob( userId, { url } ) ).toMatchObject( none )
    expect( assertKnownModelMock ).not.toHaveBeenCalled()
  } )

  it( 'rejects an unknown model and queues nothing', async () => {
    assertKnownModelMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

    await expect( queueJob( userId, { url: url, model: 'nope' } ) )
      .rejects.toThrow( 'Unknown model: nope' )
    expect( listJobs( userId ) ).toEqual( [] )
  } )

  it( 'rejects an unknown profile', async () => {
    await expect( queueJob( userId, { url: url, profile_id: crypto.randomUUID() } ) )
      .rejects.toThrow( ValidationError )
    expect( listJobs( userId ) ).toEqual( [] )
  } )

  it( 'rejects a deleted profile', async () => {
    const profileId = codingId()
    deleteProfile( userId, profileId )

    await expect( queueJob( userId, { url, profile_id: profileId } ) )
      .rejects.toThrow( ValidationError )
  } )
} )

describe( 'regenerateSummary', () => {
  const codingId = (): string => listProfiles( userId )
    .find( ( { name } ) => name === 'Coding' )?.id ?? ''

  const queueReviewed = async (): Promise< string > => {
    const id = await queueJobAt( 'ready_for_review' )
    const note_markdown = findJobById( userId, id )?.note_markdown ?? ''
    updateDraft( userId, id, { note_markdown, target_folder: 'Learning' } )

    return id
  }

  it( 'moves a job in review to summarizing and keeps the note and folder', async () => {
    const id = await queueReviewed()
    const before = findJobById( userId, id )

    const job = await regenerateSummary( userId, id, {} )

    expect( job ).toMatchObject( {
      status: 'summarizing',
      error: null,
      expires_at: null,
      target_folder: 'Learning',
      note_markdown: before?.note_markdown,
    } )
    expect( findJobById( userId, id )?.source_document ).not.toBeNull()
  } )

  it( 'stores the new model and profile when given', async () => {
    const id = await queueReviewed()

    const job = await regenerateSummary(
      userId,
      id,
      { model: 'claude-opus-5-5', profile_id: codingId() },
    )

    expect( assertKnownModelMock ).toHaveBeenCalledWith( userId, 'claude-opus-5-5' )
    expect( job ).toMatchObject( {
      summary_model: 'claude-opus-5-5',
      prompt_profile_id: codingId(),
    } )
  } )

  it( 'keeps the earlier choices when none are given', async () => {
    const profileId = codingId()
    const { id } = await queueJob(
      userId,
      { url: url, model: 'claude-opus-5-5', profile_id: profileId },
    )
    markStatus( userId, id, 'transcribing' )
    completeAcquisition( userId, id, { kind: 'video', ...transcript } )
    completeSummary( userId, id, '## Summary', [] )

    const job = await regenerateSummary( userId, id, {} )

    expect( job )
      .toMatchObject( { summary_model: 'claude-opus-5-5', prompt_profile_id: profileId } )
  } )

  it.each( [
    'queued',
    'transcribing',
    'summary_failed',
    'failed',
  ] as const )( 'refuses a job that is %s', async ( status ) => {
    const id = await queueJobAt( status )

    await expect( regenerateSummary( userId, id, {} ) ).rejects.toThrow( ConflictError )
    expect( findJob( userId, id ).status ).toBe( status )
  } )

  it( 'refuses a job that is already summarizing', async () => {
    const id = await queueJobAt( 'transcribing' )
    completeAcquisition( userId, id, { kind: 'video', ...transcript } )

    await expect( regenerateSummary( userId, id, {} ) ).rejects.toThrow( ConflictError )
    expect( findJob( userId, id ).status ).toBe( 'summarizing' )
  } )

  it( 'refuses a saved job', async () => {
    const id = await queueReviewed()
    await saveJob( userId, id )

    await expect( regenerateSummary( userId, id, {} ) ).rejects.toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown job', async () => {
    await expect( regenerateSummary( userId, crypto.randomUUID(), {} ) )
      .rejects.toThrow( NotFoundError )
  } )

  it( 'rejects an unknown model or profile and leaves the job in review', async () => {
    const id = await queueReviewed()
    assertKnownModelMock.mockRejectedValueOnce( new ValidationError( 'Unknown model: nope' ) )

    await expect( regenerateSummary( userId, id, { model: 'nope' } ) )
      .rejects.toThrow( ValidationError )
    await expect( regenerateSummary( userId, id, { profile_id: crypto.randomUUID() } ) )
      .rejects.toThrow( ValidationError )
    expect( findJob( userId, id ).status ).toBe( 'ready_for_review' )
  } )
} )

describe( 'article jobs', () => {
  const article: SourceDocument = {
    kind: 'article',
    meta: {
      title: 'A post',
      source: 'https://example.com/post',
      author: 'Ada',
      site: 'Example',
      published: '2026-10-01',
      fetched_at: '2026-10-18T10:00:00.000Z',
      origin: 'fetched',
    },
    markdown: 'Some text.',
  }

  const feedId = crypto.randomUUID()

  const insertArticle = ( status: 'summarizing' | 'ready_for_review' ): string => {
    const id = crypto.randomUUID()
    const now = startTime.toISOString()

    insertFeed( userId, {
      id: feedId,
      url: 'https://example.com',
      feed_url: 'https://example.com/feed.xml',
      name: 'A blog',
      profile_id: null,
      enabled: true,
      auto_summarize: false,
      etag: null,
      last_modified: null,
      last_checked_at: null,
      last_error: null,
      last_skipped_count: 0,
      created_at: now,
      deleted_at: null,
    } )
    insertJob( userId, {
      id,
      url: article.meta.source,
      status,
      error: null,
      created_at: now,
      updated_at: now,
      title: 'A post',
      note_markdown: null,
      target_folder: null,
      expires_at: null,
      saved_path: null,
      summary_model: null,
      prompt_profile_id: null,
      link_state: null,
      link_error: null,
      source_document: article,
      source_type: 'article',
      feed_id: feedId,
      feed_name: null,
      gmail_source_id: null,
      gmail_source_name: null,
    } )

    return id
  }

  const insertReviewed = (): string => {
    const id = insertArticle( 'summarizing' )
    completeSummary( userId, id, '## Summary\n\nText.', [ 'writing' ] )

    return id
  }

  it( 'exposes source_type, feed_id and feed_name on the public job', () => {
    const id = insertArticle( 'summarizing' )

    expect( findJob( userId, id ) ).toMatchObject( {
      source_type: 'article',
      feed_id: feedId,
      feed_name: 'A blog',
    } )
    expect( listJobs( userId )[ 0 ] )
      .toMatchObject( { source_type: 'article', feed_name: 'A blog' } )
  } )

  it( 'writes the article locked properties when the summary completes', () => {
    const id = insertReviewed()
    const { properties } = parseNote( findJobById( userId, id )?.note_markdown ?? '' )

    expect( properties ).toEqual( {
      title: 'A post',
      source: 'https://example.com/post',
      author: 'Ada',
      site: 'Example',
      published: '2026-10-01',
      created: '2026-10-14',
      tags: [ 'mnemosyne', 'writing' ],
    } )
  } )

  it( 'keeps the article keys and drops typed video keys on a draft update', () => {
    const id = insertReviewed()

    updateDraft( userId, id, { note_markdown: [
      '---',
      'title: "Mine"',
      'source: "x"',
      'channel: "typed"',
      'duration: "typed"',
      'author: "typed"',
      'created: 2020-01-01',
      'tags: [rust]',
      '---',
      '',
      'Edited.',
      '',
    ].join( '\n' ) } )

    expect( parseNote( findJobById( userId, id )?.note_markdown ?? '' ).properties ).toEqual( {
      title: 'Mine',
      source: 'https://example.com/post',
      author: 'Ada',
      site: 'Example',
      published: '2026-10-01',
      created: '2026-10-14',
      tags: [ 'mnemosyne', 'rust' ],
    } )
  } )

  it( 'saves the note with the article locked properties and today as created', async () => {
    const id = insertReviewed()

    await saveJob( userId, id )

    const [ , , , markdown ] = writeNoteMock.mock.calls[ 0 ] ?? []

    expect( parseNote( markdown ?? '' ).properties ).toMatchObject( {
      source: 'https://example.com/post',
      author: 'Ada',
      site: 'Example',
      created: '2026-10-14',
    } )
    expect( markdown ).not.toContain( 'duration' )
    expect( markdown ).not.toContain( 'channel' )
  } )
} )

describe( 'queueJob with source types', () => {
  const articleUrl = 'https://example.com/post'
  const pasted = `# Pasted title\n\n${ 'Some pasted words. '.repeat( 20 ) }`

  it( 'detects a video URL and queues it', async () => {
    expect( await queueJob( userId, { url } ) )
      .toMatchObject( { source_type: 'video', status: 'queued' } )
  } )

  it( 'detects an article URL and queues it', async () => {
    expect( await queueJob( userId, { url: articleUrl } ) )
      .toMatchObject( { source_type: 'article', status: 'queued' } )
  } )

  it( 'lets the body override the detected type', async () => {
    expect( ( await queueJob( userId, { url, source_type: 'article' } ) ).source_type )
      .toBe( 'article' )
    expect( ( await queueJob( userId, { url, source_type: 'video' } ) ).source_type )
      .toBe( 'video' )
  } )

  it( 'stores pasted text as an article document and goes straight to summarizing', async () => {
    const job = await queueJob( userId, { url: articleUrl, text: pasted } )

    expect( job ).toMatchObject( {
      source_type: 'article',
      status: 'summarizing',
      title: 'Pasted title',
    } )
    expect( findJobById( userId, job.id )?.source_document ).toMatchObject( {
      kind: 'article',
      meta: {
        title: 'Pasted title',
        source: articleUrl,
        origin: 'pasted',
        fetched_at: startTime.toISOString(),
      },
      markdown: pasted.trim(),
    } )
  } )

  it( 'prefers the given title for pasted text', async () => {
    const job = await queueJob( userId, { url: articleUrl, text: pasted, title: 'My title' } )

    expect( job.title ).toBe( 'My title' )
  } )

  it( 'refuses pasted text for a video', async () => {
    await expect( queueJob( userId, { url, text: pasted } ) ).rejects.toThrow( ValidationError )
  } )

  it( 'validates the model and profile for pasted text too', async () => {
    assertKnownModelMock.mockRejectedValueOnce( new ValidationError( 'Unknown model: nope' ) )

    await expect( queueJob( userId, { url: articleUrl, text: pasted, model: 'nope' } ) )
      .rejects.toThrow( ValidationError )
  } )

  it( 'stores a ready-made article document and goes straight to summarizing', async () => {
    const document: SourceDocument = {
      kind: 'article',
      meta: {
        title: 'From a feed',
        source: articleUrl,
        author: 'Ada',
        site: 'A blog',
        published: '2026-10-01',
        fetched_at: startTime.toISOString(),
        origin: 'feed',
      },
      markdown: 'Full text from the feed.',
    }

    const job = await queueJob( userId, { url: articleUrl }, { document } )

    expect( job ).toMatchObject( {
      status: 'summarizing',
      source_type: 'article',
      title: 'From a feed',
    } )
    expect( findJobById( userId, job.id )?.source_document ).toEqual( document )
  } )

  it( 'stores a feed id that the caller passes', async () => {
    const feedId = crypto.randomUUID()

    expect( ( await queueJob( userId, { url: articleUrl }, { feed_id: feedId } ) ).feed_id )
      .toBe( feedId )
  } )

  describe( 'a Gmail source', () => {
    it( 'stores the source id and shows its name on the job', async () => {
      const source = addStoredSource( userId, { name: 'Substacks', destination: 'newsletter' } )

      const job = await queueJob( userId, { url: articleUrl }, { gmail_source_id: source.id } )

      expect( job ).toMatchObject( {
        gmail_source_id: source.id,
        gmail_source_name: 'Substacks',
        feed_id: null,
        feed_name: null,
      } )
      expect( findJob( userId, job.id ) ).toMatchObject( { gmail_source_name: 'Substacks' } )
    } )

    it( 'leaves the Gmail fields null for a job with no source', async () => {
      expect( await queueJob( userId, { url: articleUrl } ) )
        .toMatchObject( { gmail_source_id: null, gmail_source_name: null } )
    } )

    it( 'refuses a source that does not exist, and stores no job', async () => {
      await expect( queueJob(
        userId,
        { url: articleUrl },
        { gmail_source_id: crypto.randomUUID() },
      ) )
        .rejects.toThrow( ValidationError )
      expect( listJobs( userId ) ).toEqual( [] )
    } )
  } )
} )

describe( 'step rules per source type', () => {
  const articleUrl = 'https://example.com/post'
  const article: SourceDocument = {
    kind: 'article',
    meta: {
      title: 'A post',
      source: articleUrl,
      author: null,
      site: 'Example',
      published: null,
      fetched_at: '2026-10-18T10:00:00.000Z',
      origin: 'fetched',
    },
    markdown: 'Some text.',
  }

  it( 'moves an article job queued to fetching and nowhere else', async () => {
    const { id } = await queueJob( userId, { url: articleUrl } )

    expect( () => markStatus( userId, id, 'transcribing' ) ).toThrow( ConflictError )
    expect( markStatus( userId, id, 'fetching' ).status ).toBe( 'fetching' )
    expect( () => markStatus( userId, id, 'transcribing' ) ).toThrow( ConflictError )
  } )

  it( 'refuses fetching for a video job', async () => {
    const { id } = await queueJob( userId, { url } )

    expect( () => markStatus( userId, id, 'fetching' ) ).toThrow( ConflictError )
  } )

  it( 'completes an article from fetching and goes to summarizing', async () => {
    const { id } = await queueJob( userId, { url: articleUrl } )
    markStatus( userId, id, 'fetching' )

    const job = completeAcquisition( userId, id, article )

    expect( job ).toMatchObject( { status: 'summarizing', title: 'A post' } )
    expect( findJobById( userId, id )?.source_document ).toEqual( article )
  } )

  it( 'refuses an article document for a job that is not fetching', async () => {
    const { id } = await queueJob( userId, { url: articleUrl } )

    expect( () => completeAcquisition( userId, id, article ) ).toThrow( ConflictError )
  } )

  it( 'refuses a video document for an article job and an article for a video job', async () => {
    const articleJob = await queueJob( userId, { url: articleUrl } )
    markStatus( userId, articleJob.id, 'fetching' )
    const videoJob = await queueJobAt( 'transcribing' )

    expect( () => completeAcquisition( userId, articleJob.id, { kind: 'video', ...transcript } ) )
      .toThrow( ConflictError )
    expect( () => completeAcquisition( userId, videoJob, article ) ).toThrow( ConflictError )
  } )

  it( 'fails an article job that was fetching when the server stopped', async () => {
    const { id } = await queueJob( userId, { url: articleUrl } )
    markStatus( userId, id, 'fetching' )

    expect( recoverInterruptedJobs() ).toBe( 1 )
    expect( findJob( userId, id ) )
      .toMatchObject( { status: 'failed', error: 'Interrupted by restart' } )
  } )
} )

describe( 'submitPastedText', () => {
  const articleUrl = 'https://example.com/post'
  const text = `A heading-less article. ${ 'More words here. '.repeat( 20 ) }`

  const failedArticle = async (
    options: { model?: string, profile_id?: string } = {},
  ): Promise< string > => {
    const { id } = await queueJob( userId, { url: articleUrl, ...options } )
    markStatus( userId, id, 'fetching' )
    failJob( userId, id, 'The page needs a login or is paywalled' )

    return id
  }

  it( 'builds a pasted document, clears the error and goes to summarizing', async () => {
    const id = await failedArticle()

    const job = submitPastedText( userId, id, { text } )

    expect( job ).toMatchObject( {
      status: 'summarizing',
      error: null,
      title: text.slice( 0, 120 ).trim(),
    } )
    expect( findJobById( userId, id )?.source_document ).toMatchObject( {
      kind: 'article',
      meta: { source: articleUrl, origin: 'pasted' },
      markdown: text.trim(),
    } )
  } )

  it( 'uses the given title', async () => {
    const id = await failedArticle()

    expect( submitPastedText( userId, id, { text, title: 'Mine' } ).title ).toBe( 'Mine' )
  } )

  it( 'keeps the model and the profile of the job', async () => {
    const profileId = listProfiles( userId )[ 0 ]?.id ?? ''
    const id = await failedArticle( { model: 'claude-opus-5-5', profile_id: profileId } )

    expect( submitPastedText( userId, id, { text } ) )
      .toMatchObject( { summary_model: 'claude-opus-5-5', prompt_profile_id: profileId } )
  } )

  it( 'refuses a video job, even a failed one', async () => {
    const id = await queueJobAt( 'failed' )

    expect( () => submitPastedText( userId, id, { text } ) ).toThrow( ConflictError )
  } )

  it( 'refuses an article job that has not failed', async () => {
    const queued = await queueJob( userId, { url: articleUrl } )

    expect( () => submitPastedText( userId, queued.id, { text } ) ).toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown job', () => {
    expect( () => submitPastedText( userId, crypto.randomUUID(), { text } ) )
      .toThrow( NotFoundError )
  } )
} )

describe( 'renderTranscript for articles', () => {
  const articleUrl = 'https://example.com/post'

  const reviewedArticle = async (): Promise< string > => {
    const { id } = await queueJob( userId, { url: articleUrl } )
    markStatus( userId, id, 'fetching' )
    completeAcquisition( userId, id, {
      kind: 'article',
      meta: {
        title: 'A post',
        source: articleUrl,
        author: null,
        site: null,
        published: null,
        fetched_at: '2026-10-18T10:00:00.000Z',
        origin: 'fetched',
      },
      markdown: 'Some text.',
    } )
    completeSummary( userId, id, '## Summary', [] )

    return id
  }

  it( 'renders Markdown as the title, the source URL and the text', async () => {
    const id = await reviewedArticle()

    expect( renderTranscript( userId, id, 'md' ) ).toMatchObject( {
      contentType: 'text/markdown; charset=utf-8',
      body: `# A post\n\n${ articleUrl }\n\nSome text.`,
    } )
  } )

  it.each( [ 'txt' ] as const )( 'refuses %s', async ( format ) => {
    const id = await reviewedArticle()

    expect( () => renderTranscript( userId, id, format ) )
      .toThrow( new ConflictError( 'Only Markdown is available for articles' ) )
  } )
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

describe( 'jobs of two users', () => {
  it( 'hands the worker the oldest runnable job of anyone, with its owner', async () => {
    const member = createTestUser().id
    const first = await queueJob( member, { url } )
    await queueJob( userId, { url } )

    expect( claimNextJob() ).toEqual( { job: first, userId: member } )
  } )

  it( 'recovers the interrupted jobs of every user', async () => {
    const member = createTestUser().id
    const mine = await queueJobAt( 'transcribing' )
    const { id: theirs } = await queueJob( member, { url } )
    markStatus( member, theirs, 'transcribing' )

    expect( recoverInterruptedJobs() ).toBe( 2 )
    expect( findJob( userId, mine ).status ).toBe( 'failed' )
    expect( findJob( member, theirs ).status ).toBe( 'failed' )
  } )

  it( 'deletes the expired jobs of every user and leaves the rest', async () => {
    const member = createTestUser().id
    const mine = await queueJobAt( 'ready_for_review' )
    const { id: theirs } = await queueJob( member, { url } )
    markStatus( member, theirs, 'transcribing' )
    completeAcquisition( member, theirs, { kind: 'video', ...transcript } )
    completeSummary( member, theirs, '## Summary', [] )
    updateJob( userId, mine, { expires_at: '2026-10-14T09:00:00.000Z' } )
    updateJob( member, theirs, { expires_at: '2026-10-14T09:00:00.000Z' } )
    const kept = await queueJobAt( 'ready_for_review' )

    expect( deleteExpiredJobs() ).toBe( 2 )
    expect( findJobById( userId, mine ) ).toBeUndefined()
    expect( findJobById( member, theirs ) ).toBeUndefined()
    expect( findJob( userId, kept ).status ).toBe( 'ready_for_review' )
  } )

  it( 'refuses another user\'s job by id', async () => {
    const member = createTestUser().id
    const mine = await queueJobAt( 'ready_for_review' )

    expect( () => findJob( member, mine ) ).toThrow( NotFoundError )
    expect( () => discardJob( member, mine ) ).toThrow( NotFoundError )
    expect( () => updateDraft( member, mine, { target_folder: 'A' } ) ).toThrow( NotFoundError )
    expect( listJobs( member ) ).toEqual( [] )
  } )
} )
