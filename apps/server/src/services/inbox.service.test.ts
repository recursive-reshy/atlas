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
import { ARTICLE_LIMITS } from '@atlas/shared'
import type { InboxItemRef } from '@atlas/shared'
// Errors
import { ConflictError, UnprocessableError, ValidationError } from '../errors.js'
// Repositories
import { clearJobs, findJobById } from '../repositories/jobStore.repository.js'
import { insertFeed } from '../repositories/feeds.repository.js'
import { findItemsByIds, insertItemIfNew } from '../repositories/feedItems.repository.js'
import { deleteAccount } from '../repositories/gmailAccount.repository.js'
import {
  findMessagesByIds,
  insertMessageIfNew,
} from '../repositories/gmailMessages.repository.js'
import type { StoredGmailMessage } from '../repositories/gmailMessages.repository.js'
import { markSourceDeleted } from '../repositories/gmailSources.repository.js'
import type { StoredGmailSource } from '../repositories/gmailSources.repository.js'
import type { StoredFeedItem } from '../repositories/feedItems.repository.js'
// Gmail
import { gmailLink } from '../gmail/links.js'
// Sources
import { emailToMarkdown } from '../sources/emailToMarkdown.js'
// Test support
import { addStoredSource, connectGmail } from '../test-support/gmailSources.fixture.js'
import { loadGmailFixture } from '../test-support/gmailFixture.js'
// Services
import {
  dismissItems,
  listInbox,
  queueNewsletterMessage,
  summarizeItems,
} from './inbox.service.js'
import { listJobs } from './jobs.service.js'
import { assertKnownModel } from './models.service.js'
import {
  createProfile,
  deleteProfile,
  listProfiles,
} from './prompts.service.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( './models.service.js' )

const assertKnownModelMock = vi.mocked( assertKnownModel )

const NOW = new Date( '2026-10-18T12:00:00.000Z' )
const feedId = crypto.randomUUID()
const longText = `# Full text\n\n${ 'Words from the feed. '.repeat( 40 ) }`

const addFeed = ( id = feedId, profileId: string | null = null, name = 'A blog' ): void => {
  insertFeed( userId, {
    id,
    url: 'https://blog.example.com',
    feed_url: `https://blog.example.com/${ id }.xml`,
    name,
    profile_id: profileId,
    enabled: true,
    auto_summarize: false,
    etag: null,
    last_modified: null,
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: NOW.toISOString(),
    deleted_at: null,
  } )
}

const addItem = ( overrides: Partial< StoredFeedItem > = {} ): StoredFeedItem => {
  const id = overrides.id ?? crypto.randomUUID()
  const item: StoredFeedItem = {
    id,
    feed_id: feedId,
    item_key: `key-${ id }`,
    title: 'A post',
    link: 'https://blog.example.com/posts/a',
    published_at: '2026-10-15T09:00:00.000Z',
    author: 'Ada',
    content_markdown: null,
    status: 'inbox',
    job_id: null,
    added_at: NOW.toISOString(),
    ...overrides,
  }

  insertItemIfNew( userId, item )

  return item
}

const feedRef = ( id: string ): InboxItemRef => ( { kind: 'feed', id } )
const feeds = ( ...ids: string[] ): InboxItemRef[] => ids.map( feedRef )

const status = ( id: string ): string | undefined => findItemsByIds( userId, [ id ] )[ 0 ]?.status

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( NOW )
  clearJobs( userId )
  assertKnownModelMock.mockReset()
  assertKnownModelMock.mockResolvedValue( undefined )
  addFeed()
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'listInbox', () => {
  it( 'lists inbox items as feed items with the feed name and a source type', () => {
    const article = addItem( { title: 'Post', added_at: '2026-10-18T11:00:00.000Z' } )
    const video = addItem( {
      title: 'Video',
      link: 'https://www.youtube.com/watch?v=abc',
      added_at: '2026-10-18T11:30:00.000Z',
    } )
    addItem( { status: 'dismissed' } )

    expect( listInbox( userId ) ).toEqual( [
      {
        kind: 'feed',
        id: video.id,
        feed_id: feedId,
        feed_name: 'A blog',
        title: 'Video',
        link: 'https://www.youtube.com/watch?v=abc',
        published_at: '2026-10-15T09:00:00.000Z',
        source_type: 'video',
        added_at: '2026-10-18T11:30:00.000Z',
      },
      expect.objectContaining( { kind: 'feed', id: article.id, source_type: 'article' } ),
    ] )
  } )
} )

describe( 'summarizeItems', () => {
  it( 'queues an article item for fetching and marks it queued with its job', async () => {
    const item = addItem()

    const [ job ] = ( await summarizeItems( userId, { items: feeds( item.id ) } ) ).jobs

    expect( job ).toMatchObject( {
      url: item.link,
      status: 'queued',
      source_type: 'article',
      feed_id: feedId,
      feed_name: 'A blog',
      prompt_profile_id: null,
      summary_model: null,
    } )
    expect( findItemsByIds( userId, [ item.id ] )[ 0 ] ).toMatchObject( {
      status: 'queued',
      job_id: job?.id,
    } )
  } )

  it( 'queues a video item for download', async () => {
    const item = addItem( { link: 'https://www.youtube.com/watch?v=abc' } )

    const { jobs } = await summarizeItems( userId, { items: feeds( item.id ) } )

    expect( jobs[ 0 ] ).toMatchObject( { status: 'queued', source_type: 'video' } )
  } )

  it( 'turns an item with full text into a job that is already summarizing', async () => {
    const item = addItem( { content_markdown: longText, title: 'Full post', author: 'Ada' } )

    const { jobs } = await summarizeItems( userId, { items: feeds( item.id ) } )

    expect( jobs[ 0 ] ).toMatchObject( { status: 'summarizing', title: 'Full post' } )
    expect( findJobById( userId, jobs[ 0 ]?.id ?? '' )?.source_document ).toEqual( {
      kind: 'article',
      meta: {
        title: 'Full post',
        source: item.link,
        author: 'Ada',
        site: 'A blog',
        published: '2026-10-15',
        fetched_at: NOW.toISOString(),
        origin: 'feed',
      },
      markdown: longText.trim(),
    } )
    expect( findItemsByIds( userId, [ item.id ] )[ 0 ]?.content_markdown ).toBeNull()
  } )

  it( 'handles several items at once, in the order given', async () => {
    const one = addItem( { title: 'One' } )
    const two = addItem( { title: 'Two', link: 'https://www.youtube.com/watch?v=b' } )

    const { jobs } = await summarizeItems( userId, { items: feeds( two.id, one.id ) } )

    expect( jobs.map( ( { url } ) => url ) ).toEqual( [ two.link, one.link ] )
    expect( [ status( one.id ), status( two.id ) ] ).toEqual( [ 'queued', 'queued' ] )
  } )

  describe( 'profile and model', () => {
    const profiles = () => {
      const other = createProfile( userId, { name: 'Feed profile', guidance: 'Be brief.' } )

      return { feedProfile: other.id, bodyProfile: listProfiles( userId )[ 0 ]?.id ?? '' }
    }

    it( 'uses the profile in the body first', async () => {
      const { feedProfile, bodyProfile } = profiles()
      const feed = crypto.randomUUID()
      addFeed( feed, feedProfile, 'Other' )
      const item = addItem( { feed_id: feed } )

      const { jobs } = await summarizeItems(
        userId,
        { items: feeds( item.id ), profile_id: bodyProfile },
      )

      expect( jobs[ 0 ]?.prompt_profile_id ).toBe( bodyProfile )
    } )

    it( 'then the profile of the feed', async () => {
      const { feedProfile } = profiles()
      const feed = crypto.randomUUID()
      addFeed( feed, feedProfile, 'Other' )
      const item = addItem( { feed_id: feed } )

      const { jobs } = await summarizeItems( userId, { items: feeds( item.id ) } )

      expect( jobs[ 0 ]?.prompt_profile_id ).toBe( feedProfile )
    } )

    it( 'then none, which means the default', async () => {
      const item = addItem()

      expect( ( await summarizeItems(
        userId,
        { items: feeds( item.id ) },
      ) ).jobs[ 0 ]?.prompt_profile_id )
        .toBeNull()
    } )

    it( 'falls back to the default when the feed profile was deleted', async () => {
      const { feedProfile } = profiles()
      const feed = crypto.randomUUID()
      addFeed( feed, feedProfile, 'Other' )
      deleteProfile( userId, feedProfile )
      const item = addItem( { feed_id: feed } )

      const { jobs } = await summarizeItems( userId, { items: feeds( item.id ) } )

      expect( jobs[ 0 ]?.prompt_profile_id ).toBeNull()
    } )

    it( 'uses the model in the body and none otherwise', async () => {
      const one = addItem()
      const two = addItem()

      const { jobs } = await summarizeItems(
        userId,
        { items: feeds( one.id ), model: 'claude-opus-5-5' },
      )

      expect( jobs[ 0 ]?.summary_model ).toBe( 'claude-opus-5-5' )
      const second = await summarizeItems( userId, { items: feeds( two.id ) } )

      expect( second.jobs[ 0 ]?.summary_model ).toBeNull()
    } )
  } )

  describe( 'all or nothing', () => {
    it( 'refuses ids that are not in the inbox, naming them, and queues nothing', async () => {
      const good = addItem()
      const dismissed = addItem( { status: 'dismissed' } )
      const unknown = crypto.randomUUID()

      const failure = summarizeItems( userId, { items: feeds( good.id, dismissed.id, unknown ) } )

      await expect( failure ).rejects.toThrow( ConflictError )
      await expect( failure ).rejects.toThrow( dismissed.id )
      await expect( failure ).rejects.toThrow( unknown )
      expect( listJobs( userId ) ).toEqual( [] )
      expect( status( good.id ) ).toBe( 'inbox' )
    } )

    it( 'refuses an unknown model before queueing anything', async () => {
      const one = addItem()
      const two = addItem()
      assertKnownModelMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

      await expect( summarizeItems( userId, { items: feeds( one.id, two.id ), model: 'nope' } ) )
        .rejects.toThrow( ValidationError )

      expect( listJobs( userId ) ).toEqual( [] )
      expect( [ status( one.id ), status( two.id ) ] ).toEqual( [ 'inbox', 'inbox' ] )
    } )

    it( 'refuses an unknown profile before queueing anything', async () => {
      const one = addItem()

      await expect( summarizeItems(
        userId,
        { items: feeds( one.id ), profile_id: crypto.randomUUID() },
      ) )
        .rejects.toThrow( ValidationError )

      expect( listJobs( userId ) ).toEqual( [] )
      expect( status( one.id ) ).toBe( 'inbox' )
    } )

    it( 'does not queue an item twice when the same id is sent twice', async () => {
      const one = addItem()

      const { jobs } = await summarizeItems( userId, { items: feeds( one.id, one.id ) } )

      expect( jobs ).toHaveLength( 1 )
    } )
  } )
} )

describe( 'dismissItems', () => {
  it( 'dismisses inbox items and drops their full text', () => {
    const one = addItem( { content_markdown: longText } )

    dismissItems( userId, [ feedRef( one.id ) ] )

    expect( findItemsByIds( userId, [ one.id ] )[ 0 ] ).toMatchObject( {
      status: 'dismissed',
      content_markdown: null,
    } )
  } )

  it( 'ignores ids that are not in the inbox', () => {
    const queued = addItem( { status: 'queued' } )
    const baseline = addItem( { status: 'baseline' } )

    const ids = [ queued.id, baseline.id, crypto.randomUUID() ]

    expect( () => dismissItems( userId, feeds( ...ids ) ) ).not.toThrow()
    expect( [ status( queued.id ), status( baseline.id ) ] ).toEqual( [ 'queued', 'baseline' ] )
  } )
} )

describe( 'newsletters in the inbox', () => {
  const newsletter = loadGmailFixture( 'Ideabrowser' )
  const sourceName = 'Idea digest'

  const addSource = ( overrides: Partial< StoredGmailSource > = {} ): StoredGmailSource => {
    return addStoredSource( userId, { name: sourceName, destination: 'newsletter', ...overrides } )
  }

  const addMessage = (
    sourceId: string,
    overrides: Partial< StoredGmailMessage > = {},
  ): StoredGmailMessage => {
    const message: StoredGmailMessage = {
      id: crypto.randomUUID(),
      source_id: sourceId,
      message_id: `gmail-${ crypto.randomUUID().slice( 0, 8 ) }`,
      subject: newsletter.subject,
      sender: 'Ideabrowser',
      sender_address: 'notifications@mail.ideabrowser.com',
      received_at: '2026-10-17T08:00:00.000Z',
      body_html: newsletter.html,
      body_text: newsletter.text,
      status: 'inbox',
      backfilled: false,
      attempts: 0,
      error: null,
      job_id: null,
      added_at: NOW.toISOString(),
      ...overrides,
    }

    insertMessageIfNew( userId, message )

    return message
  }

  const gmail = ( id: string ): InboxItemRef => ( { kind: 'gmail', id } )
  const messageStatus = ( id: string ): string | undefined => {
    return findMessagesByIds( userId, [ id ] )[ 0 ]?.status
  }
  const tiny = { body_html: '<p>Hi.</p>', body_text: 'Hi.' }

  beforeEach( () => {
    connectGmail( userId )
  } )

  describe( 'listInbox', () => {
    it( 'lists a newsletter email with its subject, sender, source and Gmail link', () => {
      const source = addSource()
      const message = addMessage( source.id, { added_at: '2026-10-18T11:00:00.000Z' } )

      expect( listInbox( userId ) ).toEqual( [ {
        kind: 'gmail',
        id: message.id,
        source_id: source.id,
        source_name: sourceName,
        title: newsletter.subject,
        sender: 'Ideabrowser',
        link: gmailLink( { email: 'naresh@example.com', messageId: message.message_id } ),
        published_at: '2026-10-17T08:00:00.000Z',
        source_type: 'article',
        added_at: '2026-10-18T11:00:00.000Z',
      } ] )
    } )

    it( 'lists feed items and newsletter emails together, newest added first', () => {
      const source = addSource()
      const old = addItem( { added_at: '2026-10-18T09:00:00.000Z' } )
      const mail = addMessage( source.id, { added_at: '2026-10-18T10:00:00.000Z' } )
      const recent = addItem( { added_at: '2026-10-18T11:00:00.000Z' } )

      expect( listInbox( userId ).map( ( { kind, id } ) => `${ kind }:${ id }` ) ).toEqual( [
        `feed:${ recent.id }`,
        `gmail:${ mail.id }`,
        `feed:${ old.id }`,
      ] )
    } )

    it( 'leaves out emails that are dismissed, queued or skipped, and job alerts', () => {
      const source = addSource()
      const jobs = addStoredSource( userId, { destination: 'jobs' } )

      addMessage( source.id, { status: 'dismissed' } )
      addMessage( source.id, { status: 'queued' } )
      addMessage( source.id, { status: 'skipped' } )
      addMessage( jobs.id, { status: 'pending' } )

      expect( listInbox( userId ) ).toEqual( [] )
    } )

    it( 'still lists the emails of a source that was deleted', () => {
      const source = addSource()

      addMessage( source.id )
      markSourceDeleted( userId, source.id, NOW.toISOString() )

      expect( listInbox( userId ) ).toHaveLength( 1 )
    } )

    it( 'links to the first signed-in account once Gmail has been disconnected', () => {
      const source = addSource()
      const message = addMessage( source.id )

      deleteAccount( userId )

      expect( listInbox( userId )[ 0 ] ).toMatchObject( {
        link: gmailLink( { email: null, messageId: message.message_id } ),
      } )
    } )
  } )

  describe( 'summarizing', () => {
    it( 'turns an email into an article job that is already summarizing', async () => {
      const source = addSource()
      const message = addMessage( source.id )

      const { jobs } = await summarizeItems( userId, { items: [ gmail( message.id ) ] } )
      const link = gmailLink( { email: 'naresh@example.com', messageId: message.message_id } )

      expect( jobs[ 0 ] ).toMatchObject( {
        url: link,
        status: 'summarizing',
        source_type: 'article',
        title: newsletter.subject,
        gmail_source_id: source.id,
        gmail_source_name: sourceName,
        feed_id: null,
        prompt_profile_id: null,
        summary_model: null,
      } )
      expect( findJobById( userId, jobs[ 0 ]?.id ?? '' )?.source_document ).toEqual( {
        kind: 'article',
        meta: {
          title: newsletter.subject,
          source: link,
          author: 'Ideabrowser',
          site: sourceName,
          published: '2026-10-17',
          fetched_at: NOW.toISOString(),
          origin: 'email',
        },
        markdown: emailToMarkdown( { html: newsletter.html, text: newsletter.text } ),
      } )
    } )

    it( 'marks the email queued with its job and drops its bodies', async () => {
      const source = addSource()
      const message = addMessage( source.id )

      const { jobs } = await summarizeItems( userId, { items: [ gmail( message.id ) ] } )

      expect( findMessagesByIds( userId, [ message.id ] )[ 0 ] ).toMatchObject( {
        status: 'queued',
        job_id: jobs[ 0 ]?.id,
        body_html: null,
        body_text: null,
      } )
    } )

    it( 'uses the source\'s profile, then the body\'s, and the default if deleted', async () => {
      const sourceProfile = createProfile(
        userId,
        { name: 'Source profile', guidance: 'Be brief.' },
      ).id
      const bodyProfile = listProfiles( userId )[ 0 ]?.id ?? ''
      const source = addSource( { profile_id: sourceProfile } )
      const first = addMessage( source.id )
      const second = addMessage( source.id )
      const third = addMessage( source.id )

      expect( ( await summarizeItems( userId, { items: [ gmail( first.id ) ] } ) ).jobs[ 0 ] )
        .toMatchObject( { prompt_profile_id: sourceProfile } )
      expect( ( await summarizeItems( userId, {
        items: [ gmail( second.id ) ],
        profile_id: bodyProfile,
      } ) ).jobs[ 0 ] ).toMatchObject( { prompt_profile_id: bodyProfile } )

      deleteProfile( userId, sourceProfile )

      expect( ( await summarizeItems( userId, { items: [ gmail( third.id ) ] } ) ).jobs[ 0 ] )
        .toMatchObject( { prompt_profile_id: null } )
    } )

    it( 'uses the model in the body', async () => {
      const message = addMessage( addSource().id )

      const { jobs } = await summarizeItems( userId, {
        items: [ gmail( message.id ) ],
        model: 'claude-opus-5-5',
      } )

      expect( jobs[ 0 ]?.summary_model ).toBe( 'claude-opus-5-5' )
    } )

    it( 'handles feed items and emails together, in the order given', async () => {
      const mail = addMessage( addSource().id )
      const post = addItem( { title: 'A post' } )

      const { jobs } = await summarizeItems(
        userId,
        { items: [ gmail( mail.id ), feedRef( post.id ) ] },
      )

      expect( jobs.map( ( job ) => job.url ) ).toEqual( [
        gmailLink( { email: 'naresh@example.com', messageId: mail.message_id } ),
        post.link,
      ] )
    } )

    it( 'refuses an email that is not in the inbox, naming it, and queues nothing', async () => {
      const source = addSource()
      const good = addMessage( source.id )
      const dismissed = addMessage( source.id, { status: 'dismissed' } )

      const failure = summarizeItems(
        userId,
        { items: [ gmail( good.id ), gmail( dismissed.id ) ] },
      )

      await expect( failure ).rejects.toThrow( ConflictError )
      await expect( failure ).rejects.toThrow( dismissed.id )
      expect( listJobs( userId ) ).toEqual( [] )
      expect( messageStatus( good.id ) ).toBe( 'inbox' )
    } )

    it( 'does not mix kinds up: a feed ref with an email id is not in the inbox', async () => {
      const message = addMessage( addSource().id )

      await expect( summarizeItems( userId, { items: feeds( message.id ) } ) )
        .rejects.toThrow( ConflictError )
    } )

    it( 'queues an email once when it is sent twice', async () => {
      const message = addMessage( addSource().id )

      const { jobs } = await summarizeItems( userId, {
        items: [ gmail( message.id ), gmail( message.id ) ],
      } )

      expect( jobs ).toHaveLength( 1 )
    } )

    describe( 'when an item cannot be summarized', () => {
      it( 'fails an email with too little text, and leaves it in the inbox', async () => {
        const message = addMessage( addSource().id, tiny )

        const failure = summarizeItems( userId, { items: [ gmail( message.id ) ] } )

        await expect( failure ).rejects.toThrow( UnprocessableError )
        await expect( failure ).rejects.toThrow( newsletter.subject )
        await expect( failure ).rejects.toThrow( 'too little text to summarize' )
        expect( messageStatus( message.id ) ).toBe( 'inbox' )
        expect( listJobs( userId ) ).toEqual( [] )
      } )

      it( 'fails an email that is too long', async () => {
        const huge = 'word '.repeat( ARTICLE_LIMITS.maxChars / 4 )
        const message = addMessage( addSource().id, { body_html: null, body_text: huge } )

        await expect( summarizeItems( userId, { items: [ gmail( message.id ) ] } ) )
          .rejects.toThrow( 'too long to summarize' )
        expect( messageStatus( message.id ) ).toBe( 'inbox' )
      } )

      it( 'returns the jobs that worked when only some items failed', async () => {
        const source = addSource()
        const good = addMessage( source.id )
        const bad = addMessage( source.id, { ...tiny, subject: 'Too short' } )
        const post = addItem()

        const { jobs } = await summarizeItems( userId, {
          items: [ gmail( good.id ), gmail( bad.id ), feedRef( post.id ) ],
        } )

        expect( jobs ).toHaveLength( 2 )
        expect( [ messageStatus( good.id ), messageStatus( bad.id ), status( post.id ) ] )
          .toEqual( [ 'queued', 'inbox', 'queued' ] )
      } )

      it( 'names every failed title when every item failed', async () => {
        const source = addSource()
        const one = addMessage( source.id, { ...tiny, subject: 'First short one' } )
        const two = addMessage( source.id, { ...tiny, subject: 'Second short one' } )

        const failure = summarizeItems( userId, { items: [ gmail( one.id ), gmail( two.id ) ] } )

        await expect( failure ).rejects.toThrow( UnprocessableError )
        await expect( failure ).rejects.toThrow( 'First short one' )
        await expect( failure ).rejects.toThrow( 'Second short one' )
      } )
    } )
  } )

  describe( 'queueNewsletterMessage', () => {
    it( 'queues the email with the source and returns the job', async () => {
      const source = addSource()
      const message = addMessage( source.id )

      const job = await queueNewsletterMessage( userId, source, message )

      expect( job ).toMatchObject( { status: 'summarizing', gmail_source_id: source.id } )
      expect( messageStatus( message.id ) ).toBe( 'queued' )
    } )

    it( 'lets explicit choices win over the source\'s', async () => {
      const sourceProfile = createProfile(
        userId,
        { name: 'Source profile', guidance: 'Be brief.' },
      ).id
      const bodyProfile = listProfiles( userId )[ 0 ]?.id ?? ''
      const source = addSource( { profile_id: sourceProfile } )
      const message = addMessage( source.id )

      const job = await queueNewsletterMessage( userId, source, message, {
        profile_id: bodyProfile,
        model: 'claude-opus-5-5',
      } )

      expect( job ).toMatchObject( {
        prompt_profile_id: bodyProfile,
        summary_model: 'claude-opus-5-5',
      } )
    } )

    it( 'throws for an email with too little text and changes nothing', async () => {
      const source = addSource()
      const message = addMessage( source.id, tiny )

      await expect( queueNewsletterMessage( userId, source, message ) )
        .rejects.toThrow( new ValidationError( 'This email has too little text to summarize' ) )
      expect( messageStatus( message.id ) ).toBe( 'inbox' )
    } )
  } )

  describe( 'dismissing', () => {
    it( 'dismisses emails and drops their bodies', () => {
      const message = addMessage( addSource().id )

      dismissItems( userId, [ gmail( message.id ) ] )

      expect( findMessagesByIds( userId, [ message.id ] )[ 0 ] ).toMatchObject( {
        status: 'dismissed',
        body_html: null,
        body_text: null,
      } )
    } )

    it( 'dismisses both kinds in one call', () => {
      const message = addMessage( addSource().id )
      const post = addItem()

      dismissItems( userId, [ gmail( message.id ), feedRef( post.id ) ] )

      expect( [ messageStatus( message.id ), status( post.id ) ] ).toEqual( [
        'dismissed',
        'dismissed',
      ] )
    } )

    it( 'ignores emails that are not in the inbox, and unknown ids', () => {
      const queued = addMessage( addSource().id, { status: 'queued' } )

      expect( () => dismissItems( userId, [ gmail( queued.id ), gmail( crypto.randomUUID() ) ] ) )
        .not.toThrow()
      expect( messageStatus( queued.id ) ).toBe( 'queued' )
    } )

    it( 'does not touch an email through a feed ref', () => {
      const message = addMessage( addSource().id )

      dismissItems( userId, [ feedRef( message.id ) ] )

      expect( messageStatus( message.id ) ).toBe( 'inbox' )
    } )
  } )
} )
