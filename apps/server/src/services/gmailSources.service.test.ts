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
import type { CreateGmailSourceBody, GmailMatch } from '@atlas/shared'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Gmail
import { GmailAuthError } from '../gmail/auth.js'
import {
  countMatches,
  getMessage,
  listLabels,
  listMatchingIds,
} from '../gmail/gmail.client.js'
// Repositories
import { saveAccount, setAccountStatus } from '../repositories/gmailAccount.repository.js'
import { listNewsletterInbox } from '../repositories/gmailMessages.repository.js'
import { getDatabase } from '../repositories/database.js'
import { findSourceById, insertSource } from '../repositories/gmailSources.repository.js'
import type { StoredGmailSource } from '../repositories/gmailSources.repository.js'
// Test support
import { buildMessage } from '../test-support/gmailMessage.fixture.js'
import type { MessageOptions } from '../test-support/gmailMessage.fixture.js'
// Services
import {
  createSource,
  deleteSource,
  listGmailSources,
  previewSource,
  requireConnectedGmail,
  updateSource,
} from './gmailSources.service.js'
import { listJobs } from './jobs.service.js'
import { listProfiles } from './prompts.service.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../gmail/gmail.client.js' )

const configMock = vi.hoisted( () => {
  const mock: { gmail: Record< string, unknown > | null } = { gmail: { clientId: 'id' } }

  return mock
} )

vi.mock( '../config.js', async ( importOriginal ) => {
  const { config } = await importOriginal< typeof import( '../config.js' ) >()

  return { config: Object.assign( configMock, config, { gmail: configMock.gmail } ) }
} )

const NOW = new Date( '2026-10-20T12:00:00.000Z' )
const DAY = 86_400_000

const labelMatch: GmailMatch = { kind: 'labels', label_ids: [ 'Label_1' ] }
const twoLabels: GmailMatch = { kind: 'labels', label_ids: [ 'Label_1', 'Label_9' ] }
const queryMatch: GmailMatch = { kind: 'query', query: 'from:donotreply@upwork.com' }

const daysAgo = ( days: number ): string => new Date( NOW.getTime() - days * DAY ).toISOString()

let messages: Record< string, MessageOptions >

const serve = ( found: Record< string, MessageOptions > ): void => {
  messages = found
}

type Matching = { ids: string[], heads: string[], missingLabelIds: string[] }

const idsOf = ( ...ids: string[] ): Matching => {
  return { ids, heads: ids.slice( 0, 1 ), missingLabelIds: [] }
}

const connect = (): void => {
  saveAccount( userId, {
    email: 'naresh@example.com',
    refresh_token_enc: 'v1:x',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    status: 'connected',
    error: null,
    connected_at: '2026-10-19T10:00:00.000Z',
  } )
}

const buildSource = ( overrides: Partial< StoredGmailSource > = {} ): StoredGmailSource => {
  return {
    id: crypto.randomUUID(),
    name: 'Existing',
    match: queryMatch,
    destination: 'jobs',
    profile_id: null,
    enabled: true,
    auto_summarize: false,
    sync_from: daysAgo( 3 ),
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: daysAgo( 3 ),
    deleted_at: null,
    ...overrides,
  }
}

const storedFor = ( sourceId: string ): { message_id: string, status: string }[] => {
  return getDatabase()
    .prepare( `SELECT message_id, status FROM gmail_messages WHERE source_id = ?
      ORDER BY added_at DESC` )
    .all( sourceId ) as { message_id: string, status: string }[]
}

const countRows = (): number => {
  const row = getDatabase()
    .prepare( 'SELECT COUNT(*) AS n FROM gmail_messages' )
    .get() as { n: number }

  return row.n
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( NOW )
  vi.resetAllMocks()
  connect()
  serve( {} )
  vi.mocked( listLabels ).mockResolvedValue( [
    { id: 'Label_1', name: 'Upwork', type: 'user' },
    { id: 'Label_2', name: 'Freelancer', type: 'user' },
  ] )
  vi.mocked( listMatchingIds ).mockResolvedValue( idsOf() )
  vi.mocked( getMessage ).mockImplementation( ( _userId, id, format = 'full' ) => {
    const options = messages[ id ]

    return options === undefined
      ? Promise.reject( new Error( `unexpected message ${ id }` ) )
      : Promise.resolve( buildMessage( id, options, format ) )
  } )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'requireConnectedGmail', () => {
  it( 'passes when Gmail is configured and connected', () => {
    expect( () => requireConnectedGmail( userId ) ).not.toThrow()
  } )

  it( 'refuses with a conflict when Gmail is not configured', () => {
    configMock.gmail = null

    expect( () => requireConnectedGmail( userId ) )
      .toThrow( new ConflictError( 'Gmail isn\'t configured' ) )

    configMock.gmail = { clientId: 'id' }
  } )

  it( 'refuses when there is no account', () => {
    getDatabase().prepare( 'DELETE FROM gmail_account' ).run()

    expect( () => requireConnectedGmail( userId ) )
      .toThrow( new ConflictError( 'Gmail isn\'t connected' ) )
  } )

  it( 'refuses when the account needs a reconnect', () => {
    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    expect( () => requireConnectedGmail( userId ) ).toThrow( ConflictError )
  } )
} )

describe( 'listGmailSources', () => {
  it( 'returns public sources with label names and counts', async () => {
    insertSource( userId, buildSource( { name: 'Alerts', match: labelMatch } ) )

    const sources = await listGmailSources( userId )

    expect( sources ).toHaveLength( 1 )
    expect( sources[ 0 ] ).toMatchObject( {
      name: 'Alerts',
      label_names: [ 'Upwork' ],
      inbox_count: 0,
      postings_count: 0,
      destination: 'jobs',
    } )
  } )

  it( 'leaves label_names empty for a search source', async () => {
    insertSource( userId, buildSource() )

    expect( ( await listGmailSources( userId ) )[ 0 ]?.label_names ).toEqual( [] )
  } )

  it( 'falls back to the ids when the labels cannot be read', async () => {
    vi.mocked( listLabels ).mockRejectedValue( new GmailAuthError( 'revoked' ) )
    insertSource( userId, buildSource( { match: twoLabels } ) )

    expect( ( await listGmailSources( userId ) )[ 0 ]?.label_names )
      .toEqual( [ 'Label_1', 'Label_9' ] )
  } )

  it( 'falls back to the id for a label that no longer exists', async () => {
    insertSource( userId, buildSource( { match: twoLabels } ) )

    expect( ( await listGmailSources( userId ) )[ 0 ]?.label_names )
      .toEqual( [ 'Upwork', 'Label_9' ] )
  } )

  it( 'does not ask Gmail for labels when no source uses them', async () => {
    insertSource( userId, buildSource() )

    await listGmailSources( userId )

    expect( listLabels ).not.toHaveBeenCalled()
  } )

  it( 'leaves out deleted sources', async () => {
    insertSource( userId, buildSource( { deleted_at: daysAgo( 1 ) } ) )

    expect( await listGmailSources( userId ) ).toEqual( [] )
  } )
} )

describe( 'previewSource', () => {
  beforeEach( () => {
    vi.mocked( countMatches ).mockResolvedValue( {
      ...idsOf( 'm1', 'm2' ),
      count: 2,
      capped: false,
    } )
  } )

  it( 'needs Gmail to be connected', async () => {
    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    await expect( previewSource( userId, queryMatch ) ).rejects.toBeInstanceOf( ConflictError )
  } )

  it( 'returns the count and the newest message', async () => {
    serve( { m1: {
      subject: 'Newest',
      from: '"Upwork" <u@upwork.com>',
      receivedAt: daysAgo( 1 ),
    } } )

    expect( await previewSource( userId, queryMatch ) ).toEqual( {
      count: 2,
      count_capped: false,
      newest: { subject: 'Newest', from: 'Upwork', received_at: daysAgo( 1 ) },
      overlaps: [],
    } )
    expect( getMessage ).toHaveBeenCalledWith( userId, 'm1', 'metadata' )
  } )

  it( 'picks the newest of the heads of several labels', async () => {
    vi.mocked( countMatches ).mockResolvedValue( {
      ids: [ 'a', 'b' ],
      heads: [ 'a', 'b' ],
      missingLabelIds: [],
      count: 2,
      capped: false,
    } )
    serve( {
      a: { subject: 'Older', receivedAt: daysAgo( 5 ) },
      b: { subject: 'Newer', receivedAt: daysAgo( 2 ) },
    } )

    const preview = await previewSource(
      userId,
      { kind: 'labels', label_ids: [ 'Label_1', 'Label_2' ] },
    )

    expect( preview.newest?.subject ).toBe( 'Newer' )
  } )

  it( 'passes on a capped count', async () => {
    vi.mocked( countMatches ).mockResolvedValue( { ...idsOf( 'm1' ), count: 500, capped: true } )
    serve( { m1: {} } )

    expect( await previewSource( userId, queryMatch ) )
      .toMatchObject( { count: 500, count_capped: true } )
  } )

  it( 'has no newest message when nothing matches', async () => {
    vi.mocked( countMatches ).mockResolvedValue( { ...idsOf(), count: 0, capped: false } )

    expect( await previewSource( userId, queryMatch ) ).toMatchObject( { count: 0, newest: null } )
    expect( getMessage ).not.toHaveBeenCalled()
  } )

  describe( 'overlaps', () => {
    beforeEach( () => {
      serve( { m1: {} } )
    } )

    it( 'lists a source with the same query once spaces are collapsed', async () => {
      const other = buildSource( {
        name: 'Same',
        match: { kind: 'query', query: 'from:a  OR  from:b' },
      } )

      insertSource( userId, other )

      const preview = await previewSource( userId, { kind: 'query', query: '  from:a OR from:b ' } )

      expect( preview.overlaps ).toEqual( [ { id: other.id, name: 'Same' } ] )
    } )

    it( 'lists a source that shares a label id', async () => {
      const other = buildSource( {
        name: 'Shares',
        match: { kind: 'labels', label_ids: [ 'Label_2', 'Label_1' ] },
      } )

      insertSource( userId, other )
      insertSource( userId, buildSource( {
        name: 'Other',
        match: { kind: 'labels', label_ids: [ 'Label_3' ] },
      } ) )

      const preview = await previewSource( userId, { kind: 'labels', label_ids: [ 'Label_1' ] } )

      expect( preview.overlaps ).toEqual( [ { id: other.id, name: 'Shares' } ] )
    } )

    it( 'counts a turned-off source but not a deleted one', async () => {
      const off = buildSource( { name: 'Off', enabled: false } )

      insertSource( userId, off )
      insertSource( userId, buildSource( { name: 'Gone', deleted_at: daysAgo( 1 ) } ) )

      const { overlaps } = await previewSource( userId, queryMatch )

      expect( overlaps ).toEqual( [ { id: off.id, name: 'Off' } ] )
    } )

    it( 'never compares a label match with a search', async () => {
      insertSource( userId, buildSource( { match: { kind: 'query', query: 'Label_1' } } ) )

      expect( ( await previewSource( userId, labelMatch ) ).overlaps ).toEqual( [] )
    } )

    it( 'leaves out the source being edited', async () => {
      const own = buildSource()

      insertSource( userId, own )

      expect( ( await previewSource( userId, queryMatch, own.id ) ).overlaps ).toEqual( [] )
    } )
  } )
} )

describe( 'createSource: newsletter', () => {
  const body = (
    overrides: Partial< CreateGmailSourceBody > = {},
  ): CreateGmailSourceBody => ( {
    name: 'Substack',
    match: labelMatch,
    destination: 'newsletter',
    ...overrides,
  } )

  it( 'needs Gmail to be connected', async () => {
    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    await expect( createSource( userId, body() ) ).rejects.toBeInstanceOf( ConflictError )
    expect( await listGmailSources( userId ) ).toEqual( [] )
  } )

  it( 'refuses an unknown profile and stores nothing', async () => {
    await expect( createSource( userId, body( { profile_id: crypto.randomUUID() } ) ) )
      .rejects.toBeInstanceOf( ValidationError )
    expect( await listGmailSources( userId ) ).toEqual( [] )
  } )

  it( 'stores the source starting now, with the given profile and auto-summarize', async () => {
    const profile = listProfiles( userId )[ 1 ]?.id ?? ''

    const source = await createSource(
      userId,
      body( { profile_id: profile, auto_summarize: true } ),
    )

    expect( source ).toMatchObject( {
      name: 'Substack',
      match: labelMatch,
      label_names: [ 'Upwork' ],
      destination: 'newsletter',
      profile_id: profile,
      auto_summarize: true,
      enabled: true,
      sync_from: NOW.toISOString(),
      created_at: NOW.toISOString(),
      last_error: null,
      last_skipped_count: 0,
    } )
    expect( findSourceById( userId, source.id ) ).toBeDefined()
  } )

  describe( 'automatic summaries', () => {
    const readable = `<p>${ 'Words worth reading, one after another. '.repeat( 12 ) }</p>`

    it( 'queues the newest email of an automatic source that has no backfill', async () => {
      vi.mocked( listMatchingIds ).mockImplementation( ( _userId, _match, { after } ) => {
        return Promise.resolve( after === undefined ? idsOf( 'new' ) : idsOf( 'new' ) )
      } )
      serve( { new: { html: readable } } )

      const source = await createSource(
        userId,
        body( { auto_summarize: true, backfill: 'none' } ),
      )

      expect( storedFor( source.id ) ).toEqual( [ { message_id: 'new', status: 'queued' } ] )
      expect( source.inbox_count ).toBe( 0 )
      expect( listJobs( userId ) ).toHaveLength( 1 )
    } )

    it( 'never queues a backfill, even for an automatic source', async () => {
      vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'a', 'b' ) )
      serve( { a: { html: readable }, b: { html: readable } } )

      const source = await createSource( userId, body( { auto_summarize: true, backfill: '30d' } ) )

      expect( source.inbox_count ).toBe( 2 )
      expect( listJobs( userId ) ).toEqual( [] )
    } )
  } )

  describe( 'with no backfill', () => {
    it( 'puts only the newest email in the inbox, with its body', async () => {
      vi.mocked( listMatchingIds ).mockImplementation( ( _userId, _match, { after } ) => {
        return Promise.resolve( after === undefined ? idsOf( 'new' ) : idsOf( 'new', 'old' ) )
      } )
      serve( {
        new: { subject: 'Newest', html: '<p>Body</p>', receivedAt: daysAgo( 1 ) },
        old: { subject: 'Older', receivedAt: daysAgo( 1.5 ) },
      } )

      const source = await createSource( userId, body() )
      const rows = storedFor( source.id )

      expect( rows ).toEqual( [
        { message_id: 'new', status: 'inbox' },
        { message_id: 'old', status: 'skipped' },
      ] )
      expect( source.inbox_count ).toBe( 1 )

      const [ inbox ] = listNewsletterInbox( userId )

      expect( inbox ).toMatchObject( {
        subject: 'Newest',
        backfilled: false,
        body_html: '<p>Body</p>',
        sender: 'Ada',
        sender_address: 'ada@example.com',
        received_at: daysAgo( 1 ),
      } )
    } )

    it( 'asks for the newest email with no date limit, then the 2-day margin', async () => {
      await createSource( userId, body() )

      expect( listMatchingIds ).toHaveBeenCalledWith( userId, labelMatch, { max: 1 } )
      expect( listMatchingIds ).toHaveBeenCalledWith(
        userId,
        labelMatch,
        { after: new Date( NOW.getTime() - 2 * DAY ), max: 100 },
      )
    } )

    it( 'takes the newest among the heads of several labels', async () => {
      vi.mocked( listMatchingIds ).mockImplementation( ( _userId, _match, { after } ) => {
        return Promise.resolve( after === undefined
          ? { ids: [ 'a', 'b' ], heads: [ 'a', 'b' ], missingLabelIds: [] }
          : idsOf() )
      } )
      serve( {
        a: { receivedAt: daysAgo( 9 ) },
        b: { receivedAt: daysAgo( 4 ) },
      } )

      const source = await createSource( userId, body( { match: twoLabels } ) )

      expect( storedFor( source.id ) ).toEqual( [ expect.objectContaining( {
        message_id: 'b',
        status: 'inbox',
      } ) ] )
    } )

    it( 'stores nothing for a match with no emails', async () => {
      const source = await createSource( userId, body() )

      expect( storedFor( source.id ) ).toEqual( [] )
    } )

    it( 'does not fetch the bodies of the skipped emails', async () => {
      vi.mocked( listMatchingIds ).mockImplementation( ( _userId, _match, { after } ) => {
        return Promise.resolve( after === undefined ? idsOf( 'new' ) : idsOf( 'new', 'old' ) )
      } )
      serve( { new: {}, old: {} } )

      await createSource( userId, body() )

      expect( getMessage ).toHaveBeenCalledWith( userId, 'old', 'metadata' )
      expect( getMessage ).not.toHaveBeenCalledWith( userId, 'old', 'full' )
      expect( getMessage ).not.toHaveBeenCalledWith( userId, 'old' )
    } )
  } )

  describe.each( [
    [ '30d', 30 ],
    [ '90d', 90 ],
  ] as const )( 'with a %s backfill', ( backfill, days ) => {
    it( 'puts every email in the window in the inbox as backfilled, newest first', async () => {
      vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'b', 'a' ) )
      serve( {
        a: { subject: 'A', receivedAt: daysAgo( 9 ) },
        b: { subject: 'B', receivedAt: daysAgo( 3 ) },
      } )

      const source = await createSource( userId, body( { backfill } ) )

      expect( listMatchingIds ).toHaveBeenCalledWith(
        userId,
        labelMatch,
        { after: new Date( NOW.getTime() - days * DAY ), max: 200 },
      )
      expect( listNewsletterInbox( userId ).map( ( row ) => [ row.subject, row.backfilled ] ) )
        .toEqual( [ [ 'B', true ], [ 'A', true ] ] )
      expect( source.inbox_count ).toBe( 2 )
    } )
  } )

  it( 'backfills with no date limit for all, capped at 200', async () => {
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1' ) )
    serve( { m1: {} } )

    await createSource( userId, body( { backfill: 'all' } ) )

    expect( listMatchingIds ).toHaveBeenCalledWith( userId, labelMatch, { max: 200 } )
  } )

  it( 'keeps only the first 200 emails when several labels return more', async () => {
    const ids = Array.from( { length: 250 }, ( _, index ) => `m${ index }` )

    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( ...ids ) )
    vi.mocked( getMessage )
      .mockImplementation( ( _userId, id ) => Promise.resolve( buildMessage( id ) ) )

    const source = await createSource( userId, body( { backfill: 'all' } ) )

    expect( source.inbox_count ).toBe( 200 )
  } )

  it( 'stores an email once even when two labels returned it', async () => {
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'dup', 'dup', 'other' ) )
    serve( { dup: {}, other: {} } )

    const source = await createSource( userId, body( { backfill: '30d' } ) )

    expect( source.inbox_count ).toBe( 2 )
  } )

  it( 'stores nothing, not even the source, when Gmail refuses halfway', async () => {
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'a', 'b' ) )
    vi.mocked( getMessage )
      .mockResolvedValueOnce( buildMessage( 'a' ) )
      .mockRejectedValueOnce( new GmailAuthError( 'revoked' ) )

    await expect( createSource( userId, body( { backfill: '30d' } ) ) )
      .rejects.toBeInstanceOf( ConflictError )

    expect( await listGmailSources( userId ) ).toEqual( [] )
    expect( countRows() ).toBe( 0 )
  } )
} )

describe( 'createSource: jobs', () => {
  const body: CreateGmailSourceBody = {
    name: 'Upwork alerts',
    match: queryMatch,
    destination: 'jobs',
  }

  it( 'is refused as not available yet, storing nothing', async () => {
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'x' ) )
    serve( { x: {} } )

    await expect( createSource( userId, body ) )
      .rejects.toThrow( new ValidationError( 'Freelance jobs sources aren\'t available yet' ) )
    expect( listMatchingIds ).not.toHaveBeenCalled()
    expect( await listGmailSources( userId ) ).toEqual( [] )
    expect( countRows() ).toBe( 0 )
  } )

  it( 'is refused as invalid even while Gmail is not connected', async () => {
    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    await expect( createSource( userId, body ) ).rejects.toBeInstanceOf( ValidationError )
  } )
} )

describe( 'updateSource', () => {
  it( 'changes the given fields only', async () => {
    const source = buildSource( { destination: 'newsletter' } )

    insertSource( userId, source )

    const updated = await updateSource( userId, source.id, {
      name: 'Renamed',
      enabled: false,
      auto_summarize: true,
      match: labelMatch,
    } )

    expect( updated ).toMatchObject( {
      name: 'Renamed',
      enabled: false,
      auto_summarize: true,
      match: labelMatch,
      destination: 'newsletter',
      sync_from: source.sync_from,
    } )
  } )

  it( 'sets and clears the profile of a newsletter source', async () => {
    const source = buildSource( { destination: 'newsletter' } )
    const profile = listProfiles( userId )[ 1 ]?.id ?? ''

    insertSource( userId, source )

    const set = await updateSource( userId, source.id, { profile_id: profile } )

    expect( set.profile_id ).toBe( profile )
    expect( ( await updateSource( userId, source.id, { profile_id: null } ) ).profile_id )
      .toBeNull()
  } )

  it( 'refuses an unknown profile', async () => {
    const source = buildSource( { destination: 'newsletter' } )

    insertSource( userId, source )

    await expect( updateSource( userId, source.id, { profile_id: crypto.randomUUID() } ) )
      .rejects.toBeInstanceOf( ValidationError )
  } )

  it( 'refuses newsletter-only fields on a jobs source', async () => {
    const source = buildSource()

    insertSource( userId, source )

    await expect( updateSource( userId, source.id, { auto_summarize: true } ) )
      .rejects.toBeInstanceOf( ValidationError )
    await expect( updateSource(
      userId,
      source.id,
      { profile_id: listProfiles( userId )[ 1 ]?.id },
    ) )
      .rejects.toBeInstanceOf( ValidationError )
    expect( findSourceById( userId, source.id )?.auto_summarize ).toBe( false )
  } )

  it( 'can rename and turn off a jobs source', async () => {
    const source = buildSource()

    insertSource( userId, source )

    expect( await updateSource( userId, source.id, { name: 'New', enabled: false } ) )
      .toMatchObject( { name: 'New', enabled: false } )
  } )

  it( 'does not find an unknown or deleted source', async () => {
    const gone = buildSource( { deleted_at: daysAgo( 1 ) } )

    insertSource( userId, gone )

    await expect( updateSource( userId, crypto.randomUUID(), { name: 'x' } ) )
      .rejects.toBeInstanceOf( NotFoundError )
    await expect( updateSource( userId, gone.id, { name: 'x' } ) )
      .rejects.toBeInstanceOf( NotFoundError )
  } )
} )

describe( 'deleteSource', () => {
  const withInboxItem = async (): Promise< { id: string } > => {
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1' ) )
    serve( { m1: {} } )

    return createSource( userId, { name: 'News', match: labelMatch, destination: 'newsletter' } )
  }

  it( 'soft-deletes the source and leaves its inbox items', async () => {
    const { id } = await withInboxItem()

    deleteSource( userId, id, { removeInboxItems: false } )

    expect( findSourceById( userId, id )?.deleted_at ).toBe( NOW.toISOString() )
    expect( storedFor( id ).map( ( row ) => row.status ) ).toEqual( [ 'inbox' ] )
    expect( await listGmailSources( userId ) ).toEqual( [] )
  } )

  it( 'dismisses the inbox items when asked', async () => {
    const { id } = await withInboxItem()

    deleteSource( userId, id, { removeInboxItems: true } )

    expect( storedFor( id ).map( ( row ) => row.status ) ).toEqual( [ 'dismissed' ] )
  } )

  it( 'does not find an unknown or already deleted source', () => {
    const gone = buildSource( { deleted_at: daysAgo( 1 ) } )

    insertSource( userId, gone )

    expect( () => deleteSource( userId, crypto.randomUUID(), { removeInboxItems: false } ) )
      .toThrow( NotFoundError )
    expect( () => deleteSource( userId, gone.id, { removeInboxItems: false } ) )
      .toThrow( NotFoundError )
  } )

  it( 'works while Gmail is not connected', () => {
    const source = buildSource()

    insertSource( userId, source )
    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    expect( () => deleteSource( userId, source.id, { removeInboxItems: false } ) ).not.toThrow()
  } )
} )
