// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Shared
import type { PostingDetails } from '@atlas/shared'
// Repositories
import { insertMessageIfNew } from './gmailMessages.repository.js'
import { insertSource } from './gmailSources.repository.js'
import {
  countPostingsForSource,
  listPlatforms,
  listPostings,
  listSightings,
  upsertPosting,
} from './postings.repository.js'
import type { PostingRow } from './postings.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const emptyDetails: PostingDetails = {
  budget: null,
  skills: [],
  description: null,
  experience_level: null,
  duration: null,
  proposals: null,
  client: null,
  extra: [],
}

const addSource = (): string => {
  const id = crypto.randomUUID()

  insertSource( userId, {
    id,
    name: 'Alerts',
    match: { kind: 'labels', label_ids: [ 'L1' ] },
    destination: 'jobs',
    profile_id: null,
    enabled: true,
    auto_summarize: false,
    sync_from: '2026-10-19T10:00:00.000Z',
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: '2026-10-19T10:00:00.000Z',
    deleted_at: null,
  } )

  return id
}

const addEmail = ( sourceId: string, overrides: { received_at?: string } = {} ): string => {
  const id = crypto.randomUUID()

  insertMessageIfNew( userId, {
    id,
    source_id: sourceId,
    message_id: crypto.randomUUID(),
    subject: 'New jobs',
    sender: 'Upwork',
    sender_address: 'donotreply@upwork.com',
    received_at: overrides.received_at ?? '2026-10-19T09:00:00.000Z',
    body_html: '<p>x</p>',
    body_text: 'x',
    status: 'extracted',
    backfilled: false,
    attempts: 1,
    error: null,
    job_id: null,
    added_at: '2026-10-19T10:00:00.000Z',
  } )

  return id
}

const buildPosting = ( overrides: Partial< PostingRow > = {} ): PostingRow => {
  const id = overrides.id ?? crypto.randomUUID()

  return {
    id,
    platform: 'upwork',
    platform_job_id: null,
    dedupe_key: `upwork:${ id }`,
    title: 'Node.js developer',
    url: `https://www.upwork.com/jobs/${ id }`,
    posted_at: null,
    details: emptyDetails,
    ...overrides,
  }
}

describe( 'upsertPosting', () => {
  it( 'inserts a posting seen for the first time', () => {
    const source = addSource()
    const email = addEmail( source )
    const posting = buildPosting( {
      platform_job_id: '~01abc',
      posted_at: '2026-10-19T08:00:00.000Z',
      details: { ...emptyDetails, skills: [ 'TypeScript' ] },
    } )

    const id = upsertPosting( userId, posting, email, '2026-10-19T09:00:00.000Z' )

    expect( id ).toBe( posting.id )
    expect( listPostings( userId, { limit: 50, offset: 0 } ).rows ).toEqual( [ {
      ...posting,
      first_seen_at: '2026-10-19T09:00:00.000Z',
      last_seen_at: '2026-10-19T09:00:00.000Z',
      sightings: 1,
    } ] )
  } )

  it( 'updates the existing posting on the same key and keeps its id and first sight', () => {
    const source = addSource()
    const first = addEmail( source )
    const second = addEmail( source )
    const original = buildPosting( { dedupe_key: 'upwork:~01abc' } )

    upsertPosting( userId, original, first, '2026-10-19T09:00:00.000Z' )

    const id = upsertPosting(
      userId,
      buildPosting( {
        dedupe_key: 'upwork:~01abc',
        title: 'Node.js developer (updated)',
        url: 'https://www.upwork.com/jobs/new',
        posted_at: '2026-10-19T08:30:00.000Z',
        details: { ...emptyDetails, description: 'More detail' },
      } ),
      second,
      '2026-10-20T09:00:00.000Z',
    )

    expect( id ).toBe( original.id )
    expect( listPostings( userId, { limit: 50, offset: 0 } ).rows ).toEqual( [ {
      ...original,
      title: 'Node.js developer (updated)',
      url: 'https://www.upwork.com/jobs/new',
      posted_at: '2026-10-19T08:30:00.000Z',
      details: { ...emptyDetails, description: 'More detail' },
      first_seen_at: '2026-10-19T09:00:00.000Z',
      last_seen_at: '2026-10-20T09:00:00.000Z',
      sightings: 2,
    } ] )
  } )

  it( 'does not move last_seen_at back when an older email is processed later', () => {
    const source = addSource()
    const newer = addEmail( source )
    const older = addEmail( source )
    const posting = buildPosting()

    upsertPosting( userId, posting, newer, '2026-10-20T09:00:00.000Z' )
    upsertPosting(
      userId,
      { ...posting, id: crypto.randomUUID() },
      older,
      '2026-10-18T09:00:00.000Z',
    )

    expect( listPostings( userId, { limit: 50, offset: 0 } ).rows[ 0 ]?.last_seen_at )
      .toBe( '2026-10-20T09:00:00.000Z' )
  } )

  it( 'records one sighting per email even when the same posting is upserted twice', () => {
    const source = addSource()
    const email = addEmail( source )
    const posting = buildPosting()

    upsertPosting( userId, posting, email, '2026-10-19T09:00:00.000Z' )
    upsertPosting( userId, posting, email, '2026-10-19T09:00:00.000Z' )

    expect( listPostings( userId, { limit: 50, offset: 0 } ).rows[ 0 ]?.sightings ).toBe( 1 )
  } )
} )

describe( 'listPostings', () => {
  const seed = (): void => {
    const source = addSource()

    const add = ( posting: PostingRow, seenAt: string ): void => {
      upsertPosting( userId, posting, addEmail( source ), seenAt )
    }

    add(
      buildPosting( {
        title: 'Senior TypeScript engineer',
        details: { ...emptyDetails, skills: [ 'TypeScript', 'Node.js' ] },
      } ),
      '2026-10-17T09:00:00.000Z',
    )
    add(
      buildPosting( {
        platform: 'freelancer',
        title: 'Logo design',
        details: { ...emptyDetails, description: 'We need a 100% original logo' },
      } ),
      '2026-10-18T09:00:00.000Z',
    )
    add(
      buildPosting( {
        title: 'Data pipeline',
        details: { ...emptyDetails, description: 'Python and Airflow', skills: [ 'Python' ] },
      } ),
      '2026-10-19T09:00:00.000Z',
    )
  }

  const titles = ( query: Parameters< typeof listPostings >[ 1 ] ): string[] => {
    return listPostings( userId, query ).rows.map( ( { title } ) => title )
  }

  it( 'lists newest first seen first, with total and filtered counts', () => {
    seed()

    const result = listPostings( userId, { limit: 50, offset: 0 } )

    expect( result.rows.map( ( { title } ) => title ) )
      .toEqual( [ 'Data pipeline', 'Logo design', 'Senior TypeScript engineer' ] )
    expect( result.total ).toBe( 3 )
    expect( result.filtered ).toBe( 3 )
  } )

  it( 'finds text in the title, ignoring case', () => {
    seed()

    expect( titles( { q: 'TYPESCRIPT', limit: 50, offset: 0 } ) )
      .toEqual( [ 'Senior TypeScript engineer' ] )
  } )

  it( 'finds text in the description', () => {
    seed()

    expect( titles( { q: 'airflow', limit: 50, offset: 0 } ) ).toEqual( [ 'Data pipeline' ] )
  } )

  it( 'finds text in the skills', () => {
    seed()

    expect( titles( { q: 'node.js', limit: 50, offset: 0 } ) )
      .toEqual( [ 'Senior TypeScript engineer' ] )
    expect( titles( { q: 'pyth', limit: 50, offset: 0 } ) ).toEqual( [ 'Data pipeline' ] )
  } )

  it( 'treats % and _ in the search as plain characters', () => {
    seed()

    expect( titles( { q: '100%', limit: 50, offset: 0 } ) ).toEqual( [ 'Logo design' ] )
    expect( titles( { q: '%', limit: 50, offset: 0 } ) ).toEqual( [ 'Logo design' ] )
    expect( titles( { q: 'Data_pipeline', limit: 50, offset: 0 } ) ).toEqual( [] )
    expect( titles( { q: '_', limit: 50, offset: 0 } ) ).toEqual( [] )
  } )

  it( 'filters by platform and reports the filtered count apart from the total', () => {
    seed()

    const result = listPostings( userId, { platform: 'freelancer', limit: 50, offset: 0 } )

    expect( result.rows.map( ( { title } ) => title ) ).toEqual( [ 'Logo design' ] )
    expect( result.total ).toBe( 3 )
    expect( result.filtered ).toBe( 1 )
  } )

  it( 'combines the search and the platform filter', () => {
    seed()

    expect( titles( { q: 'logo', platform: 'upwork', limit: 50, offset: 0 } ) ).toEqual( [] )
  } )

  it( 'pages with limit and offset while the counts stay whole', () => {
    seed()

    const result = listPostings( userId, { limit: 1, offset: 1 } )

    expect( result.rows.map( ( { title } ) => title ) ).toEqual( [ 'Logo design' ] )
    expect( result.filtered ).toBe( 3 )
  } )

  it( 'is empty with zero counts when nothing is stored', () => {
    expect( listPostings( userId, { limit: 50, offset: 0 } ) )
      .toEqual( { rows: [], total: 0, filtered: 0 } )
  } )
} )

describe( 'listPlatforms', () => {
  it( 'lists each platform once, by name', () => {
    const source = addSource()
    const email = addEmail( source )

    for( const platform of [ 'upwork', 'freelancer', 'upwork' ] ) {
      upsertPosting( userId, buildPosting( { platform } ), email, '2026-10-19T09:00:00.000Z' )
    }

    expect( listPlatforms( userId ) ).toEqual( [ 'freelancer', 'upwork' ] )
  } )

  it( 'is empty when there are no postings', () => {
    expect( listPlatforms( userId ) ).toEqual( [] )
  } )
} )

describe( 'listSightings', () => {
  it( 'returns the emails a posting appeared in, newest received first, with counts', () => {
    const source = addSource()
    const older = addEmail( source, { received_at: '2026-10-18T09:00:00.000Z' } )
    const newer = addEmail( source, { received_at: '2026-10-19T09:00:00.000Z' } )
    const other = addEmail( source )
    const posting = buildPosting()

    upsertPosting( userId, posting, older, '2026-10-18T09:00:00.000Z' )
    upsertPosting( userId, posting, newer, '2026-10-19T09:00:00.000Z' )
    upsertPosting( userId, buildPosting(), other, '2026-10-19T09:00:00.000Z' )
    upsertPosting( userId, buildPosting(), newer, '2026-10-19T09:00:00.000Z' )

    const emails = listSightings( userId, posting.id )

    expect( emails.map( ( { id } ) => id ) ).toEqual( [ newer, older ] )
    expect( emails[ 0 ] ).toMatchObject( {
      source_name: 'Alerts',
      subject: 'New jobs',
      status: 'extracted',
      postings_count: 2,
    } )
  } )

  it( 'is empty for an unknown posting', () => {
    expect( listSightings( userId, crypto.randomUUID() ) ).toEqual( [] )
  } )
} )

describe( 'countPostingsForSource', () => {
  it( 'counts the distinct postings seen in emails of that source', () => {
    const source = addSource()
    const other = addSource()
    const first = addEmail( source )
    const second = addEmail( source )
    const shared = buildPosting()

    upsertPosting( userId, shared, first, '2026-10-19T09:00:00.000Z' )
    upsertPosting( userId, shared, second, '2026-10-19T09:00:00.000Z' )
    upsertPosting( userId, buildPosting(), second, '2026-10-19T09:00:00.000Z' )
    upsertPosting( userId, buildPosting(), addEmail( other ), '2026-10-19T09:00:00.000Z' )

    expect( countPostingsForSource( userId, source ) ).toBe( 2 )
    expect( countPostingsForSource( userId, other ) ).toBe( 1 )
    expect( countPostingsForSource( userId, crypto.randomUUID() ) ).toBe( 0 )
  } )
} )

describe( 'ownership', () => {
  it( 'lets two users hold the same posting, each with their own sightings', () => {
    const other = createTestUser().id
    const otherSource = crypto.randomUUID()

    insertSource( other, {
      id: otherSource,
      name: 'Theirs',
      match: { kind: 'labels', label_ids: [ 'L1' ] },
      destination: 'jobs',
      profile_id: null,
      enabled: true,
      auto_summarize: false,
      sync_from: '2026-10-19T10:00:00.000Z',
      last_checked_at: null,
      last_error: null,
      last_skipped_count: 0,
      created_at: '2026-10-19T10:00:00.000Z',
      deleted_at: null,
    } )

    const mine = addEmail( addSource() )
    const theirs = crypto.randomUUID()
    const shared = buildPosting( { dedupe_key: 'upwork:shared' } )

    insertMessageIfNew( other, {
      id: theirs,
      source_id: otherSource,
      message_id: crypto.randomUUID(),
      subject: 'New jobs',
      sender: 'Upwork',
      sender_address: 'donotreply@upwork.com',
      received_at: '2026-10-19T09:00:00.000Z',
      body_html: null,
      body_text: null,
      status: 'extracted',
      backfilled: false,
      attempts: 1,
      error: null,
      job_id: null,
      added_at: '2026-10-19T10:00:00.000Z',
    } )

    const first = upsertPosting( userId, shared, mine, '2026-10-19T09:00:00.000Z' )
    const second = upsertPosting(
      other,
      { ...shared, id: crypto.randomUUID() },
      theirs,
      '2026-10-19T09:30:00.000Z',
    )

    expect( second ).not.toBe( first )
    expect( listPostings( userId, { limit: 10, offset: 0 } ).total ).toBe( 1 )
    expect( listPostings( other, { limit: 10, offset: 0 } ).total ).toBe( 1 )
    expect( listSightings( userId, first ).map( ( { id } ) => id ) ).toEqual( [ mine ] )
    expect( listSightings( other, first ) ).toEqual( [] )
    expect( listPlatforms( other ) ).toEqual( [ 'upwork' ] )
    expect( countPostingsForSource( other, otherSource ) ).toBe( 1 )
    expect( countPostingsForSource( userId, otherSource ) ).toBe( 0 )
  } )
} )
