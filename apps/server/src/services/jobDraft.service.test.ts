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
import { JobStatus, VideoSource } from '@atlas/shared'
// Config
// Errors
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  VaultNotChosenError,
} from '../errors.js'
// Repositories
import { clearJobs, findJobById, updateJob } from '../repositories/jobStore.repository.js'

import { findProfileById, setLastFolder } from '../repositories/promptProfiles.repository.js'
// Services
import {
  completeSummary,
  completeAcquisition,
  failJob,
  failSummary,
  findJob,
  markStatus,
  queueJob,
} from './jobs.service.js'

import {
  discardJob,
  saveJob,
  submitPastedText,
  updateDraft,
} from './jobDraft.service.js'
// Models
import { assertKnownModel } from './models.service.js'
// Prompts
import { listProfiles } from './prompts.service.js'
// Clients
import { existingFolderSync, writeNote } from '../clients/vault.client.js'
// Formatters
// Fixtures
// Repositories
import { clearVaultDir } from '../repositories/users.repository.js'
// Logging
// Test support
import { defaultTestAdmin, defaultTestVaultPath } from '../test-support/auth.js'

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

const queueSummarizing = async (): Promise< string > => {
  const id = await queueJobAt( 'transcribing' )
  completeAcquisition( userId, id, { kind: 'video', ...transcript } )

  return id
}

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
