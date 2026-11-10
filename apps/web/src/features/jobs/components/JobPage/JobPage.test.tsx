// React
import { Route, Routes } from 'react-router'
// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import { serializeNote } from '@atlas/shared'
import type { Job } from '@atlas/shared'
// App
import { ApiError } from '#src/lib/apiError'
import {
  createJob,
  saveJob,
  submitPastedText,
} from '#src/features/jobs/api/jobs.api'
import { useJob } from '#src/features/jobs/hooks/useJob'
import { useFolders } from '#src/features/vault/hooks/useFolders'
import { useSource } from '#src/features/jobs/hooks/useSource'
import type { JobState } from '#src/features/jobs/hooks/useJob'
import { jobFixture } from '#src/features/jobs/fixtures/job.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { JobPage } from './JobPage'

vi.mock( '#src/features/jobs/hooks/useJob' )
vi.mock( '#src/features/jobs/hooks/useSource' )
vi.mock( '#src/features/vault/hooks/useFolders' )
vi.mock( '#src/features/jobs/api/jobs.api', async ( importOriginal ) => ( {
  ...await importOriginal< typeof import( '#src/features/jobs/api/jobs.api' ) >(),
  createJob: vi.fn(),
  saveJob: vi.fn(),
  submitPastedText: vi.fn(),
} ) )

const mockedUseJob = vi.mocked( useJob )
const mockedCreateJob = vi.mocked( createJob )
const mockedSaveJob = vi.mocked( saveJob )
const mockedSubmitPastedText = vi.mocked( submitPastedText )
const mockedUseTranscript = vi.mocked( useSource )
vi.mocked( useFolders ).mockReturnValue(
  { defaultFolder: 'Mnemosyne', folders: [], error: null },
)
const jobId = jobFixture().id
const newJobId = '7a1d9e2c-3b4f-4c5d-8e6f-0a1b2c3d4e5f'

const showJob = ( job: Job | null, error: string | null = null ): void => {
  const state: JobState = { job, error }

  mockedUseJob.mockImplementation( ( id ) => id === null ? { job: null, error: null } : state )
}

const renderPage = ( id: string = jobId ): ReturnType< typeof renderWithClient > => {
  return renderWithClient(
    <Routes>
      <Route path="/" element={ <p>Home</p> } />
      <Route path="/jobs/:id" element={ <JobPage /> } />
    </Routes>,
    { route: `/jobs/${ id }` },
  )
}

const lastUseJobArgument = (): string | null | undefined => {
  return mockedUseJob.mock.calls.at( -1 )?.[ 0 ]
}

beforeEach( () => {
  mockedUseJob.mockReset()
  mockedCreateJob.mockReset()
  mockedSubmitPastedText.mockReset()
  mockedUseTranscript.mockReset()
  mockedUseTranscript.mockReturnValue( { source: null, error: null } )
  showJob( null )
} )

describe( 'JobPage', () => {
  it( 'watches the job in the address', () => {
    showJob( jobFixture( { status: 'transcribing' } ) )
    renderPage()

    expect( lastUseJobArgument() ).toBe( jobId )
    expect( screen.queryByRole( 'form', { name: 'Add a video or article' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'redirects an invalid job id to the home page', () => {
    const { location } = renderPage( 'not-a-uuid' )

    expect( location().pathname ).toBe( '/' )
    expect( screen.getByText( 'Home' ) ).toBeInTheDocument()
    expect( lastUseJobArgument() ).toBeNull()
  } )

  it( 'shows a loading status until the job arrives', () => {
    renderPage()

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading job…' )
  } )

  it( 'shows a vanished job and starts over', async () => {
    showJob( null, 'This job no longer exists. The server may have restarted.' )
    const { location } = renderPage()
    const user = userEvent.setup()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'This job no longer exists' )

    await user.click( screen.getByRole( 'button', { name: 'Start over' } ) )

    expect( location().pathname ).toBe( '/' )
  } )

  it( 'shows progress without downloads for a running job', () => {
    showJob( jobFixture( { status: 'transcribing' } ) )
    renderPage()

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Transcribing…' )
    expect( screen.queryByRole( 'region', { name: 'Download transcript' } ) )
      .not.toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Transcribe another video' } ) )
      .toBeInTheDocument()
  } )

  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'shows the download links when the job is %s',
    ( status ) => {
      showJob( jobFixture( { status } ) )
      renderPage()

      expect( screen.getByRole( 'region', { name: 'Download transcript' } ) )
        .toBeInTheDocument()
    },
  )

  it( 'hides the download links while summarizing', () => {
    showJob( jobFixture( { status: 'summarizing' } ) )
    renderPage()

    expect( screen.queryByRole( 'region', { name: 'Download transcript' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'links to the Markdown download for a job ready for review', () => {
    showJob( jobFixture( { status: 'ready_for_review' } ) )
    renderPage()

    expect( screen.getByRole( 'link', { name: 'Markdown (.md)' } ) )
      .toHaveAttribute( 'href', `/api/jobs/${ jobId }/download?format=md` )
  } )

  describe( 'when the job is ready for review', () => {
    const reviewJob = jobFixture( {
      status: 'ready_for_review',
      title: 'How Rust Works',
      note_markdown: serializeNote( {
        properties: {
          title: 'How Rust Works',
          source: 'https://www.youtube.com/watch?v=abc',
          channel: 'Channel',
          duration: '05:00',
          created: '2026-10-15',
          tags: [ 'mnemosyne', 'rust' ],
        },
        body: '## Summary\nOwnership is central.\n',
      } ),
      expires_at: '2026-10-16T10:00:00.000Z',
    } )

    it( 'shows the title, the summary and the transcript regions', async () => {
      showJob( reviewJob )
      renderPage()

      expect( screen.getByRole( 'heading', { level: 2, name: 'How Rust Works' } ) )
        .toBeInTheDocument()
      expect( await screen.findByRole( 'heading', { level: 2, name: 'Summary' } ) )
        .toBeInTheDocument()
      expect( screen.getByRole( 'region', { name: 'Transcript' } ) ).toBeInTheDocument()
      expect( screen.getByRole( 'region', { name: 'Download transcript' } ) )
        .toBeInTheDocument()
    } )

    it( 'saves the job and goes home with the saved path', async () => {
      mockedSaveJob.mockResolvedValue( 'Mnemosyne/How Rust Works.md' )
      showJob( reviewJob )
      const { location } = renderPage()

      await userEvent.setup().click( screen.getByRole( 'button', { name: 'Save to vault' } ) )

      await vi.waitFor( () => expect( location().pathname ).toBe( '/' ) )
      expect( location().state ).toEqual( { savedPath: 'Mnemosyne/How Rust Works.md' } )
    } )

    it( 'does not show the progress stages', () => {
      showJob( reviewJob )
      renderPage()

      expect( screen.queryByRole( 'list', { name: /stages/i } ) ).not.toBeInTheDocument()
      expect( screen.queryByLabelText( 'Job progress' ) ).not.toBeInTheDocument()
    } )
  } )

  describe( 'when the summary failed', () => {
    const failedJob = jobFixture( {
      status: 'summary_failed',
      title: 'How Rust Works',
      error: 'Summary request failed: Rate limited',
    } )

    it( 'shows the reason, the downloads and no summary editor', () => {
      showJob( failedJob )
      renderPage()

      expect( screen.getByRole( 'alert' ) )
        .toHaveTextContent( 'Summary request failed: Rate limited' )
      expect( screen.getByRole( 'region', { name: 'Download transcript' } ) )
        .toBeInTheDocument()
      expect( screen.queryByRole( 'textbox', { name: 'Summary' } ) ).not.toBeInTheDocument()
    } )
  } )

  describe( 'when the job is saved', () => {
    it( 'shows where the note was saved and a way home', async () => {
      showJob( jobFixture( { status: 'saved', saved_path: 'Mnemosyne/How Rust Works.md' } ) )
      const { location } = renderPage()
      const user = userEvent.setup()

      expect( screen.getByRole( 'status' ) )
        .toHaveTextContent( 'Saved to Mnemosyne/How Rust Works.md' )
      expect( screen.queryByRole( 'region', { name: 'Download transcript' } ) )
        .not.toBeInTheDocument()

      await user.click( screen.getByRole( 'button', { name: 'Transcribe another video' } ) )

      expect( location().pathname ).toBe( '/' )
    } )
  } )

  it( 'shows a connection error next to the job', () => {
    showJob( jobFixture( { status: 'transcribing' } ), 'Could not reach the server' )
    renderPage()

    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'Could not reach the server. Retrying…' )
  } )

  it( 'retries a failed job with its URL and moves to the new job', async () => {
    mockedCreateJob.mockResolvedValue( newJobId )
    showJob( jobFixture( { status: 'failed', error: 'Video unavailable' } ) )
    const { location } = renderPage()
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Try again' } ) )

    expect( mockedCreateJob ).toHaveBeenCalledWith( { url: jobFixture().url } )
    expect( location().pathname ).toBe( `/jobs/${ newJobId }` )
  } )

  it( 'shows a failed retry and stays on the old job', async () => {
    mockedCreateJob.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    showJob( jobFixture( { status: 'failed', error: 'Video unavailable' } ) )
    const { location } = renderPage()
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Try again' } ) )

    await screen.findByText( 'Could not reach the server' )

    expect( screen.getAllByRole( 'alert' ).map( ( alert ) => alert.textContent ) )
      .toContain( 'Could not reach the server' )
    expect( location().pathname ).toBe( `/jobs/${ jobId }` )
    expect( lastUseJobArgument() ).toBe( jobId )
  } )

  it( 'starts over from a finished job', async () => {
    showJob( jobFixture( { status: 'ready_for_review' } ) )
    const { location } = renderPage()
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Transcribe another video' } ) )

    expect( location().pathname ).toBe( '/' )
  } )
} )

describe( 'JobPage, articles', () => {
  const articleUrl = 'https://example.com/post'
  const failedArticle = jobFixture( {
    status: 'failed',
    source_type: 'article',
    url: articleUrl,
    error: 'The page needs a login or is paywalled',
  } )
  const pasted = 'Pasted words go here. '.repeat( 15 )

  it( 'continues a failed article with pasted text and follows it into summarizing', async () => {
    const summarizing = { ...failedArticle, status: 'summarizing' as const, error: null }
    mockedSubmitPastedText.mockImplementation( () => {
      showJob( summarizing )

      return Promise.resolve( summarizing )
    } )
    showJob( failedArticle )
    renderPage()
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Paste text' } ) )
    await user.type( screen.getByRole( 'textbox', { name: 'Title' } ), 'Mine' )
    await user.click( screen.getByRole( 'textbox', { name: 'Article text' } ) )
    await user.paste( pasted )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( await screen.findByRole( 'status' ) ).toHaveTextContent( 'Summarizing…' )
    expect( mockedSubmitPastedText ).toHaveBeenCalledExactlyOnceWith(
      jobId,
      { text: pasted.trim(), title: 'Mine' },
    )
    expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
  } )

  it( 'shows a failed paste in the dialog and keeps the text', async () => {
    mockedSubmitPastedText.mockRejectedValue( new ApiError( 'Invalid request', 400 ) )
    showJob( failedArticle )
    renderPage()
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Paste text' } ) )
    await user.click( screen.getByRole( 'textbox', { name: 'Article text' } ) )
    await user.paste( pasted )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( await screen.findByText( 'Invalid request' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Article text' } ) ).toHaveValue( pasted )
  } )

  it( 'retries a failed article keeping its type, even for a video-looking URL', async () => {
    mockedCreateJob.mockResolvedValue( newJobId )
    const odd = { ...failedArticle, url: 'https://www.youtube.com/watch?v=abc' }
    showJob( odd )
    renderPage()
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Try again' } ) )

    expect( mockedCreateJob ).toHaveBeenCalledWith( { url: odd.url, source_type: 'article' } )
  } )

  it( 'retries a plain article URL with just the URL', async () => {
    mockedCreateJob.mockResolvedValue( newJobId )
    showJob( failedArticle )
    renderPage()
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Try again' } ) )

    expect( mockedCreateJob ).toHaveBeenCalledWith( { url: articleUrl } )
  } )
} )
