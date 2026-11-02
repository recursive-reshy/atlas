// Packages
import { describe, it, expect } from 'vitest'
// Api
import {
  CreateJobBody,
  CreateJobResponse,
  DownloadFormat,
  FolderNode,
  GetJobResponse,
  GetSourceResponse,
  ListFoldersResponse,
  ListJobsResponse,
  SaveJobResponse,
  SubmitPastedTextBody,
  UpdateDraftBody,
  UpdateDraftResponse,
} from './api.js'

const jobId = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'

describe( 'CreateJobBody', () => {
  it.each( [ 'http://example.com/v', 'https://www.youtube.com/watch?v=abc' ] )(
    'accepts %s',
    ( url ) => {
      expect( CreateJobBody.safeParse( { url } ).success ).toBe( true )
    },
  )

  it.each( [ 'ftp://example.com/v', 'javascript:alert(1)', 'not a url' ] )(
    'rejects %s',
    ( url ) => {
      expect( CreateJobBody.safeParse( { url } ).success ).toBe( false )
    },
  )

  it( 'rejects a missing url', () => {
    expect( CreateJobBody.safeParse( {} ).success ).toBe( false )
  } )

  it( 'accepts an optional model and profile_id', () => {
    const body = {
      url: 'https://example.com/v',
      model: 'claude-sonnet-5-5',
      profile_id: jobId,
    }

    expect( CreateJobBody.safeParse( body ).success ).toBe( true )
  } )

  it( 'rejects an empty model and a profile_id that is not a uuid', () => {
    const url = 'https://example.com/v'

    expect( CreateJobBody.safeParse( { url, model: '' } ).success ).toBe( false )
    expect( CreateJobBody.safeParse( { url, profile_id: 'x' } ).success ).toBe( false )
  } )
} )

describe( 'CreateJobBody with articles', () => {
  const article = 'https://example.com/post'
  const text = 'x'.repeat( 200 )

  it( 'accepts an explicit source_type', () => {
    expect( CreateJobBody.safeParse( { url: article, source_type: 'article' } ).success )
      .toBe( true )
    expect( CreateJobBody.safeParse( { url: article, source_type: 'video' } ).success )
      .toBe( true )
  } )

  it( 'rejects an unknown source_type', () => {
    expect( CreateJobBody.safeParse( { url: article, source_type: 'email' } ).success )
      .toBe( false )
  } )

  it( 'accepts text and a title for an article', () => {
    expect( CreateJobBody.safeParse( { url: article, text, title: 'T' } ).success ).toBe( true )
  } )

  it( 'accepts text for a video-looking URL when source_type is article', () => {
    const url = 'https://www.youtube.com/watch?v=abc'

    expect( CreateJobBody.safeParse( { url, source_type: 'article', text } ).success )
      .toBe( true )
  } )

  it( 'rejects text or a title with a detected video', () => {
    const url = 'https://www.youtube.com/watch?v=abc'

    expect( CreateJobBody.safeParse( { url, text } ).success ).toBe( false )
    expect( CreateJobBody.safeParse( { url, title: 'T' } ).success ).toBe( false )
  } )

  it( 'rejects text or a title with an explicit video', () => {
    expect( CreateJobBody.safeParse( { url: article, source_type: 'video', text } ).success )
      .toBe( false )
    expect( CreateJobBody.safeParse( { url: article, source_type: 'video', title: 'T' } ).success )
      .toBe( false )
  } )

  it( 'trims the text and applies the length limits after trimming', () => {
    const padded = CreateJobBody.parse( { url: article, text: `  ${ text }  ` } )

    expect( padded.text ).toBe( text )
    expect( CreateJobBody.safeParse( { url: article, text: 'x'.repeat( 199 ) } ).success )
      .toBe( false )
    expect( CreateJobBody.safeParse( { url: article, text: 'x'.repeat( 300_001 ) } ).success )
      .toBe( false )
    expect( CreateJobBody.safeParse( { url: article, text: 'x'.repeat( 300_000 ) } ).success )
      .toBe( true )
  } )

  it( 'trims the title and limits it to 1 to 300 characters', () => {
    expect( CreateJobBody.parse( { url: article, text, title: '  T  ' } ).title ).toBe( 'T' )
    expect( CreateJobBody.safeParse( { url: article, text, title: '   ' } ).success )
      .toBe( false )
    expect( CreateJobBody.safeParse( { url: article, text, title: 'x'.repeat( 301 ) } ).success )
      .toBe( false )
  } )
} )

describe( 'SubmitPastedTextBody', () => {
  const text = 'x'.repeat( 200 )

  it( 'accepts text alone and text with a title', () => {
    expect( SubmitPastedTextBody.safeParse( { text } ).success ).toBe( true )
    expect( SubmitPastedTextBody.safeParse( { text, title: 'T' } ).success ).toBe( true )
  } )

  it( 'applies the same text and title rules', () => {
    expect( SubmitPastedTextBody.safeParse( { text: 'short' } ).success ).toBe( false )
    expect( SubmitPastedTextBody.safeParse( { text: 'x'.repeat( 300_001 ) } ).success )
      .toBe( false )
    expect( SubmitPastedTextBody.safeParse( { text, title: '' } ).success ).toBe( false )
    expect( SubmitPastedTextBody.parse( { text: `  ${ text } ` } ).text ).toBe( text )
  } )

  it( 'rejects a missing text', () => {
    expect( SubmitPastedTextBody.safeParse( {} ).success ).toBe( false )
  } )
} )

describe( 'CreateJobResponse', () => {
  it( 'accepts a UUID job_id', () => {
    expect( CreateJobResponse.safeParse( { job_id: jobId } ).success ).toBe( true )
  } )

  it( 'rejects a non-UUID job_id', () => {
    expect( CreateJobResponse.safeParse( { job_id: '1' } ).success ).toBe( false )
  } )
} )

describe( 'GetJobResponse', () => {
  const job = {
    id: jobId,
    url: 'https://example.com/v',
    status: 'ready_for_review',
    error: null,
    created_at: '2026-10-14T10:00:00.000Z',
    updated_at: '2026-10-14T10:00:00.000Z',
    title: null,
    note_markdown: null,
    target_folder: null,
    default_folder: 'Inbox',
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
  }

  it( 'accepts a job', () => {
    expect( GetJobResponse.safeParse( { job } ).success ).toBe( true )
  } )

  it( 'rejects an invalid job', () => {
    expect( GetJobResponse.safeParse( { job: { ...job, id: 'x' } } ).success ).toBe( false )
  } )
} )

describe( 'DownloadFormat', () => {
  it.each( [ 'md', 'txt' ] )( 'accepts %s', ( format ) => {
    expect( DownloadFormat.safeParse( format ).success ).toBe( true )
  } )

  it( 'rejects srt', () => {
    expect( DownloadFormat.safeParse( 'srt' ).success ).toBe( false )
  } )

  it( 'rejects pdf', () => {
    expect( DownloadFormat.safeParse( 'pdf' ).success ).toBe( false )
  } )
} )

const jobFields = {
  url: 'https://www.youtube.com/watch?v=abc',
  status: 'ready_for_review',
  error: null,
  created_at: '2026-10-14T10:00:00.000Z',
  updated_at: '2026-10-14T10:00:00.000Z',
  title: 'A talk',
  note_markdown: null,
  target_folder: null,
  default_folder: 'Inbox',
  expires_at: '2026-10-15T10:00:00.000Z',
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
}

const transcript = {
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Some Channel',
    duration_seconds: 60,
    transcribed_at: '2026-10-14T10:04:00.000Z',
    model: 'large-v3',
  },
  text: 'Hello',
}

describe( 'ListJobsResponse', () => {
  it( 'accepts a list of jobs, including an empty one', () => {
    expect( ListJobsResponse.safeParse( { jobs: [] } ).success ).toBe( true )
    expect(
      ListJobsResponse.safeParse( { jobs: [ { id: jobId, ...jobFields } ] } ).success,
    ).toBe( true )
  } )

  it( 'rejects an invalid job in the list', () => {
    expect(
      ListJobsResponse.safeParse( { jobs: [ { id: 'x', ...jobFields } ] } ).success,
    ).toBe( false )
  } )

  it( 'rejects a missing jobs field', () => {
    expect( ListJobsResponse.safeParse( {} ).success ).toBe( false )
  } )
} )

describe( 'GetSourceResponse', () => {
  it( 'accepts a video source', () => {
    expect( GetSourceResponse.safeParse( { source: { kind: 'video', ...transcript } } ).success )
      .toBe( true )
  } )

  it( 'accepts an article source', () => {
    const source = {
      kind: 'article',
      meta: {
        title: 'A post',
        source: 'https://example.com/post',
        author: null,
        site: null,
        published: null,
        fetched_at: '2026-10-18T10:00:00.000Z',
        origin: 'pasted',
      },
      markdown: 'Text',
    }

    expect( GetSourceResponse.safeParse( { source } ).success ).toBe( true )
  } )

  it( 'rejects a source without a kind', () => {
    expect( GetSourceResponse.safeParse( { source: transcript } ).success ).toBe( false )
  } )

  it( 'rejects a video without text', () => {
    const { meta } = transcript

    expect( GetSourceResponse.safeParse( { source: { kind: 'video', meta } } ).success )
      .toBe( false )
  } )

  it( 'no longer accepts the 0.4.0 transcript key', () => {
    expect( GetSourceResponse.safeParse( { transcript } ).success ).toBe( false )
  } )
} )

describe( 'the 0.2.0 save body', () => {
  it( 'is gone: saving takes no body', async () => {
    const api = await import( './api.js' )

    expect( api ).not.toHaveProperty( 'SaveJobBody' )
  } )
} )

describe( 'SaveJobResponse', () => {
  it( 'accepts a saved path', () => {
    expect( SaveJobResponse.safeParse( { saved_path: 'Mnemosyne/A talk.md' } ).success ).toBe(
      true,
    )
  } )

  it( 'rejects an empty or missing saved path', () => {
    expect( SaveJobResponse.safeParse( { saved_path: '' } ).success ).toBe( false )
    expect( SaveJobResponse.safeParse( {} ).success ).toBe( false )
  } )
} )

describe( 'FolderNode and ListFoldersResponse', () => {
  const tree = {
    name: 'Learning',
    path: 'Learning',
    children: [ { name: 'AI', path: 'Learning/AI', children: [] } ],
  }

  it( 'accepts a nested tree', () => {
    expect( FolderNode.safeParse( tree ).success ).toBe( true )
    expect( ListFoldersResponse.safeParse( {
      default_folder: 'Mnemosyne',
      folders: [ tree ],
    } ).success ).toBe( true )
  } )

  it( 'accepts an empty vault', () => {
    expect( ListFoldersResponse.safeParse( { default_folder: 'Mnemosyne', folders: [] } ).success )
      .toBe( true )
  } )

  it( 'rejects a node without a path, at any depth', () => {
    const broken = { ...tree, children: [ { name: 'AI', children: [] } ] }

    expect( FolderNode.safeParse( broken ).success ).toBe( false )
  } )

  it( 'rejects a missing default_folder', () => {
    expect( ListFoldersResponse.safeParse( { folders: [] } ).success ).toBe( false )
  } )
} )

describe( 'UpdateDraftBody', () => {
  it.each( [
    { note_markdown: '---\n---\n' },
    { target_folder: 'Learning/AI' },
    { target_folder: null },
    { note_markdown: 'x', target_folder: null },
  ] )( 'accepts %j', ( body ) => {
    expect( UpdateDraftBody.safeParse( body ).success ).toBe( true )
  } )

  it.each( [ {}, { note_markdown: 5 }, { target_folder: 5 }, { note_markdown: undefined } ] )(
    'rejects %j',
    ( body ) => {
      expect( UpdateDraftBody.safeParse( body ).success ).toBe( false )
    },
  )
} )

describe( 'UpdateDraftResponse', () => {
  it( 'requires a job', () => {
    expect( UpdateDraftResponse.safeParse( {} ).success ).toBe( false )
  } )
} )
