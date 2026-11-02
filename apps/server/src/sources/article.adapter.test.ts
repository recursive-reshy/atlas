// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Shared
import { Job } from '@atlas/shared'
import type { ArticleSource } from '@atlas/shared'
// Sources
import { articleAdapter } from './article.adapter.js'
import { fetchArticle } from './extractArticle.js'

vi.mock( './extractArticle.js' )

const fetchMock = vi.mocked( fetchArticle )

const article: ArticleSource = {
  kind: 'article',
  meta: {
    title: 'A post',
    source: 'https://example.com/post',
    author: null,
    site: 'Example',
    published: null,
    fetched_at: '2026-10-18T10:00:00.000Z',
    origin: 'fetched',
  },
  markdown: 'Some text.',
}

const context = ( markStatus = vi.fn() ): Parameters< typeof articleAdapter.acquire >[ 0 ] => {
  return {
    job: Job.parse( {
      id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
      url: 'https://example.com/post',
      status: 'queued',
      error: null,
      created_at: '2026-10-18T10:00:00.000Z',
      updated_at: '2026-10-18T10:00:00.000Z',
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
      source_type: 'article',
      feed_id: null,
      feed_name: null,
      gmail_source_id: null,
      gmail_source_name: null,
    } ),
    workDir: '/work/job',
    markStatus,
  }
}

beforeEach( () => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue( article )
} )

describe( 'articleAdapter.acquire', () => {
  it( 'marks fetching, then fetches the job URL and returns the article', async () => {
    const order: string[] = []
    const markStatus = vi.fn( ( status: string ) => {
      order.push( status )
    } )
    fetchMock.mockImplementation( () => {
      order.push( 'fetch' )

      return Promise.resolve( article )
    } )

    const document = await articleAdapter.acquire( context( markStatus ) )

    expect( order ).toEqual( [ 'fetching', 'fetch' ] )
    expect( fetchMock ).toHaveBeenCalledExactlyOnceWith( 'https://example.com/post' )
    expect( document ).toEqual( article )
  } )

  it( 'lets a fetch error through with its message', async () => {
    fetchMock.mockRejectedValue( new Error( 'The page needs a login or is paywalled' ) )

    await expect( articleAdapter.acquire( context() ) )
      .rejects.toThrow( 'The page needs a login or is paywalled' )
  } )

  it( 'fetches nothing when the status change is refused', async () => {
    const markStatus = vi.fn( () => {
      throw new Error( 'conflict' )
    } )

    await expect( articleAdapter.acquire( context( markStatus ) ) ).rejects.toThrow( 'conflict' )
    expect( fetchMock ).not.toHaveBeenCalled()
  } )
} )
