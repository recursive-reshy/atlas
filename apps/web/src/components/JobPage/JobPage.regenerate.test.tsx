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
// App
import { ApiError } from '#src/api/apiError'
import {
  getJob,
  regenerateSummary,
  updateDraft,
} from '#src/api/jobs.api'
import { useFolders } from '#src/hooks/useFolders'
import { useModels } from '#src/hooks/useModels'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { useSource } from '#src/hooks/useSource'
import { modelsState, profilesState, settingsState } from '#src/test-support/hookStates'
import { jobFixture } from '#src/test-support/job.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { JobPage } from './JobPage'

// The real useJob runs here, so the page follows the cache the way it does in the app.
vi.mock( '#src/api/jobs.api' )
vi.mock( '#src/hooks/useSource' )
vi.mock( '#src/hooks/useFolders' )
vi.mock( '#src/hooks/useModels' )
vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/usePromptProfiles' )
vi.mock( '../NoteEditor', () => ( {
  NoteEditor: ( props: {
    value: string
    onChange: ( value: string ) => void
    onBlur?: () => void
  } ) => (
    <textarea
      aria-label="Summary"
      value={ props.value }
      onChange={ ( event ) => props.onChange( event.target.value ) }
      onBlur={ props.onBlur }
    />
  ),
} ) )

const note = serializeNote( {
  properties: {
    title: 'How Rust Works',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration: '05:00',
    created: '2026-10-15',
    tags: [ 'mnemosyne', 'rust' ],
  },
  body: '## Summary\nText.\n',
} )

const reviewing = jobFixture( {
  status: 'ready_for_review',
  title: 'How Rust Works',
  note_markdown: note,
  expires_at: '2026-10-16T10:00:00.000Z',
} )
const summarizing = { ...reviewing, status: 'summarizing' as const, expires_at: null }
const regenerated = { ...reviewing, note_markdown: note.replace( 'Text.', 'A new take.' ) }

const renderPage = (): ReturnType< typeof renderWithClient > => renderWithClient(
  <Routes><Route path="/jobs/:id" element={ <JobPage /> } /></Routes>,
  { route: `/jobs/${ reviewing.id }` },
)

beforeEach( () => {
  vi.mocked( getJob ).mockReset()
  vi.mocked( getJob ).mockResolvedValue( reviewing )
  vi.mocked( updateDraft ).mockReset()
  vi.mocked( regenerateSummary ).mockReset()
  vi.mocked( regenerateSummary ).mockResolvedValue( summarizing )
  vi.mocked( useSource ).mockReturnValue( { source: null, error: null } )
  vi.mocked( useFolders ).mockReturnValue(
    { defaultFolder: 'Mnemosyne', folders: [], error: null },
  )
  vi.mocked( useModels ).mockReturnValue( modelsState() )
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
} )

const regenerate = async ( user: ReturnType< typeof userEvent.setup > ): Promise< void > => {
  await user.click( await screen.findByRole( 'button', { name: 'Regenerate summary' } ) )
  await user.click( screen.getByRole( 'button', { name: 'Regenerate' } ) )
}

describe( 'JobPage, regenerating a summary', () => {
  it( 'moves from the review screen to the progress view', async () => {
    const user = userEvent.setup()
    renderPage()

    await regenerate( user )

    expect( await screen.findByRole( 'status' ) ).toHaveTextContent( 'Summarizing' )
    expect( screen.queryByRole( 'textbox', { name: 'Summary' } ) ).not.toBeInTheDocument()
  } )

  it( 'comes back to review with the new note once the summary is done', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderPage()
    await regenerate( user )
    await screen.findByRole( 'status' )

    // What the next poll would find.
    vi.mocked( getJob ).mockResolvedValue( regenerated )
    await queryClient.invalidateQueries( { queryKey: [ 'jobs' ] } )

    expect( await screen.findByRole( 'textbox', { name: 'Summary' } ) )
      .toHaveValue( regenerated.note_markdown )
  } )

  it( 'does not try to save the note once the job is summarizing', async () => {
    vi.mocked( updateDraft ).mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const user = userEvent.setup()
    renderPage()
    await user.type( await screen.findByRole( 'textbox', { name: 'Summary' } ), '!' )

    await regenerate( user )
    await screen.findByRole( 'status' )

    // One attempt came from leaving the editor; none from the page closing or the timer.
    expect( vi.mocked( updateDraft ) ).toHaveBeenCalledTimes( 1 )
  } )
} )
