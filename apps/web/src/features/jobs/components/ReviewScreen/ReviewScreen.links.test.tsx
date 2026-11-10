// Shared
import { insertLink, serializeNote } from '@atlas/shared'
import type { Job, StoredLinkSuggestion } from '@atlas/shared'
// Testing Library
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '#src/lib/apiError'
import { updateDraft } from '#src/features/jobs/api/jobs.api'
import {
  acceptLinkSuggestions,
  listLinkSuggestions,
  rejectLinkSuggestions,
  runLinking,
} from '#src/features/jobs/api/linkSuggestions.api'
import { useFolders } from '#src/hooks/useFolders'
import { useModels } from '#src/hooks/useModels'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { useSource } from '#src/features/jobs/hooks/useSource'
import { modelsState, profilesState, settingsState } from '#src/test-support/hookStates'
import { jobFixture } from '#src/features/jobs/fixtures/job.fixture'
import { linkSuggestionFixture } from '#src/features/jobs/fixtures/linkSuggestion.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ReviewScreen } from './ReviewScreen'

vi.mock( '#src/features/jobs/hooks/useSource' )
vi.mock( '#src/hooks/useFolders' )
vi.mock( '#src/hooks/useModels' )
vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/usePromptProfiles' )
vi.mock( '#src/features/jobs/api/jobs.api' )
vi.mock( '#src/features/jobs/api/linkSuggestions.api' )
vi.mock( '../NoteEditor', () => ( {
  NoteEditor: ( props: { value: string, onChange: ( value: string ) => void } ) => (
    <textarea
      aria-label="Summary"
      value={ props.value }
      onChange={ ( event ) => props.onChange( event.target.value ) }
    />
  ),
} ) )

const mockedList = vi.mocked( listLinkSuggestions )
const mockedAccept = vi.mocked( acceptLinkSuggestions )
const mockedReject = vi.mocked( rejectLinkSuggestions )
const mockedRun = vi.mocked( runLinking )

const ID_B = '5a1e0b7c-2d4f-4a6e-8b9c-0d1e2f3a4b02'
const ID_C = '5a1e0b7c-2d4f-4a6e-8b9c-0d1e2f3a4b03'

const note = serializeNote( {
  properties: {
    title: 'How Pricing Works',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration: '05:00',
    created: '2026-10-15',
    tags: [ 'mnemosyne' ],
  },
  body: 'The pricing strategy matters for startups.\n',
} )

const linkedJob = jobFixture( {
  status: 'ready_for_review',
  link_state: 'linked',
  title: 'How Pricing Works',
  note_markdown: note,
} )

const anchored = linkSuggestionFixture()
const related = linkSuggestionFixture( {
  id: ID_B,
  position: 1,
  target: 'Customer Discovery',
  kind: 'new_concept',
  anchor: null,
} )

const sourceTab = (): HTMLElement => screen.getByRole( 'tab', { name: 'Source' } )

const editor = (): HTMLTextAreaElement => screen.getByRole( 'textbox', { name: 'Summary' } )

const render = ( job: Job = linkedJob, suggestions: StoredLinkSuggestion[] = [ anchored ] ) => {
  mockedList.mockResolvedValue( suggestions )
  renderWithClient( <ReviewScreen job={ job } onSaved={ vi.fn() } onDiscarded={ vi.fn() } /> )

  return userEvent.setup()
}

const acceptedResponse = ( suggestions: StoredLinkSuggestion[] ) => ( {
  job: linkedJob,
  suggestions: suggestions.map( ( suggestion ) => {
    return { ...suggestion, status: 'accepted' as const }
  } ),
} )

beforeEach( () => {
  mockedList.mockReset()
  mockedAccept.mockReset()
  mockedReject.mockReset()
  mockedRun.mockReset()
  mockedRun.mockResolvedValue( jobFixture( { status: 'linking', link_state: 'pending' } ) )
  vi.mocked( updateDraft ).mockReset()
  vi.mocked( updateDraft ).mockResolvedValue( linkedJob )
  vi.mocked( useSource ).mockReturnValue( {
    source: {
      kind: 'video',
      meta: {
        title: 'How Pricing Works',
        source: 'https://www.youtube.com/watch?v=abc',
        channel: 'Channel',
        duration_seconds: 300,
        transcribed_at: '2026-10-15T10:00:00.000Z',
        model: 'large-v3-turbo',
      },
      text: 'Welcome to the talk.',
    },
    error: null,
  } )
  vi.mocked( useFolders ).mockReturnValue(
    { defaultFolder: 'Mnemosyne', folders: [], error: null },
  )
  vi.mocked( useModels ).mockReturnValue( modelsState() )
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
} )

describe( 'ReviewScreen tabs', () => {
  it( 'opens on Suggested links when suggestions are pending', async () => {
    render( linkedJob, [ anchored, related ] )

    const tab = await screen.findByRole( 'tab', { name: 'Suggested links (2 pending)' } )

    expect( tab ).toHaveAttribute( 'aria-selected', 'true' )
    expect( screen.getByRole( 'region', { name: 'Suggested links' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'region', { name: 'Transcript' } ) ).not.toBeInTheDocument()
  } )

  it( 'opens on Source when nothing is pending', async () => {
    render( linkedJob, [] )

    await vi.waitFor( () => expect( mockedList ).toHaveBeenCalled() )

    expect( sourceTab() ).toHaveAttribute( 'aria-selected', 'true' )
    expect( screen.getByRole( 'region', { name: 'Transcript' } ) ).toBeInTheDocument()
  } )

  it( 'opens on Source for a job that was not linked, without asking for suggestions', () => {
    render( jobFixture( { ...linkedJob, link_state: 'off' } ) )

    expect( sourceTab() ).toHaveAttribute( 'aria-selected', 'true' )
    expect( mockedList ).not.toHaveBeenCalled()
  } )

  it( 'switches between the tabs', async () => {
    const user = render()
    await screen.findByRole( 'tab', { name: 'Suggested links (1 pending)' } )

    await user.click( screen.getByRole( 'tab', { name: 'Source' } ) )

    expect( screen.getByRole( 'region', { name: 'Transcript' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'region', { name: 'Suggested links' } ) ).not.toBeInTheDocument()
  } )

  it( 'has no tabs when the summary failed', () => {
    render( jobFixture( { ...linkedJob, status: 'summary_failed', error: 'x' } ) )

    expect( screen.queryByRole( 'tab' ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'region', { name: 'Transcript' } ) ).toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen accepting links', () => {
  it( 'puts an anchored link in the note and sends it with the id', async () => {
    const user = render()
    mockedAccept.mockResolvedValue( acceptedResponse( [ anchored ] ) )
    const expected = insertLink( note, anchored )

    await user.click( await screen.findByRole( 'button', { name: 'Accept' } ) )

    expect( editor() ).toHaveValue( expected )
    expect( expected ).toContain( '[[Pricing Strategy|pricing strategy]]' )
    expect( mockedAccept ).toHaveBeenCalledWith( linkedJob.id, {
      ids: [ anchored.id ],
      note_markdown: expected,
    } )
    expect( await screen.findByText( 'Accepted' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Saved' ) ).toBeInTheDocument()
  } )

  it( 'adds an unanchored link under Related', async () => {
    const user = render( linkedJob, [ related ] )
    mockedAccept.mockResolvedValue( acceptedResponse( [ related ] ) )

    await user.click( await screen.findByRole( 'button', { name: 'Add to Related' } ) )

    expect( editor().value ).toContain( '## Related\n\n- [[Customer Discovery]]' )
  } )

  it( 'adds a stale link under Related once the anchor is edited away', async () => {
    const user = render()
    mockedAccept.mockResolvedValue( acceptedResponse( [ anchored ] ) )
    await screen.findByRole( 'button', { name: 'Accept' } )

    const edited = note.replace( 'pricing strategy', 'costs' )

    fireEvent.change( editor(), { target: { value: edited } } )
    await user.click( await screen.findByRole( 'button', { name: 'Add to Related' } ) )

    expect( editor().value ).toContain( '- [[Pricing Strategy]]' )
    expect( editor().value ).not.toContain( '[[Pricing Strategy|' )
  } )

  it( 'accepts every pending suggestion in order with one request', async () => {
    const user = render( linkedJob, [ related, anchored ] )
    mockedAccept.mockResolvedValue( acceptedResponse( [ anchored, related ] ) )
    const expected = insertLink( insertLink( note, anchored ), related )

    await user.click( await screen.findByRole( 'button', { name: 'Accept all' } ) )

    expect( editor() ).toHaveValue( expected )
    expect( mockedAccept ).toHaveBeenCalledOnce()
    expect( mockedAccept ).toHaveBeenCalledWith( linkedJob.id, {
      ids: [ anchored.id, related.id ],
      note_markdown: expected,
    } )
  } )

  it( 'keeps the text and the pending suggestion when accepting fails', async () => {
    const user = render()
    mockedAccept.mockRejectedValue( new ApiError( 'Link suggestion x is not pending', 409 ) )

    await user.click( await screen.findByRole( 'button', { name: 'Accept' } ) )

    expect( await screen.findByRole( 'alert' ) )
      .toHaveTextContent( 'Link suggestion x is not pending' )
    expect( editor() ).toHaveValue( insertLink( note, anchored ) )
    expect( screen.getByRole( 'button', { name: 'Accept' } ) ).toBeEnabled()
  } )
} )

describe( 'ReviewScreen rejecting links', () => {
  it( 'sends the id and leaves the note alone', async () => {
    const user = render( linkedJob, [ anchored, related ] )
    mockedReject.mockResolvedValue( {
      job: linkedJob,
      suggestions: [ { ...anchored, status: 'rejected' }, related ],
    } )

    await user.click( ( await screen.findAllByRole( 'button', { name: 'Reject' } ) )[ 0 ] )

    expect( mockedReject ).toHaveBeenCalledWith( linkedJob.id, { ids: [ anchored.id ] } )
    expect( editor() ).toHaveValue( note )
    expect( await screen.findByText( 'Rejected' ) ).toBeInTheDocument()
  } )

  it( 'rejects every pending suggestion with one request', async () => {
    const user = render( linkedJob, [ anchored, { ...related, id: ID_C } ] )
    mockedReject.mockResolvedValue( { job: linkedJob, suggestions: [] } )

    await user.click( await screen.findByRole( 'button', { name: 'Reject all' } ) )

    expect( mockedReject ).toHaveBeenCalledOnce()
    expect( mockedReject ).toHaveBeenCalledWith( linkedJob.id, { ids: [ anchored.id, ID_C ] } )
    expect( editor() ).toHaveValue( note )
  } )
} )

describe( 'ReviewScreen linking runs', () => {
  const failedLinking = jobFixture( {
    ...linkedJob,
    link_state: 'failed',
    link_error: 'Agent service unreachable',
  } )

  it( 'shows why linking failed and retries with the text in the editor', async () => {
    const user = render( failedLinking, [] )
    const edited = note.replace( 'startups', 'founders' )
    fireEvent.change( editor(), { target: { value: edited } } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Agent service unreachable' )

    await user.click( screen.getByRole( 'button', { name: 'Retry linking' } ) )

    expect( mockedRun ).toHaveBeenCalledWith( linkedJob.id, { note_markdown: edited } )
    expect( mockedList ).not.toHaveBeenCalled()
  } )

  it( 'offers Run linking when linking was off and the agent is set up', async () => {
    const user = render( jobFixture( { ...linkedJob, link_state: 'off' } ) )

    await user.click( screen.getByRole( 'button', { name: 'Run linking' } ) )

    expect( mockedRun ).toHaveBeenCalledWith( linkedJob.id, { note_markdown: note } )
  } )

  it( 'points to Settings when the agent is not configured', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( { agentStatus: 'not_configured' } ) )
    render( jobFixture( { ...linkedJob, link_state: 'off' } ) )

    expect( screen.getByRole( 'link', { name: 'Settings' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Run linking' } ) ).not.toBeInTheDocument()
  } )

  it( 'asks before re-running while suggestions are pending', async () => {
    const user = render( linkedJob, [ anchored ] )

    await user.click( await screen.findByRole( 'button', { name: 'Re-run linking' } ) )

    expect( mockedRun ).not.toHaveBeenCalled()

    await user.click( screen.getByRole( 'button', { name: 'Re-run' } ) )

    expect( mockedRun ).toHaveBeenCalledWith( linkedJob.id, { note_markdown: note } )
  } )

  it( 'keeps the pending suggestions when the re-run is cancelled', async () => {
    const user = render( linkedJob, [ anchored ] )

    await user.click( await screen.findByRole( 'button', { name: 'Re-run linking' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( mockedRun ).not.toHaveBeenCalled()
    expect( await screen.findByRole( 'button', { name: 'Accept' } ) ).toBeInTheDocument()
  } )

  it( 're-runs at once when nothing is pending', async () => {
    const user = render( linkedJob, [ { ...anchored, status: 'accepted' } ] )

    await user.click( await screen.findByRole( 'button', { name: 'Re-run linking' } ) )

    expect( mockedRun ).toHaveBeenCalledWith( linkedJob.id, { note_markdown: note } )
  } )

  it( 'shows the error when starting the run fails', async () => {
    mockedRun.mockRejectedValue( new ApiError( 'Linking isn\'t configured', 409 ) )
    const user = render( failedLinking, [] )

    await user.click( screen.getByRole( 'button', { name: 'Retry linking' } ) )

    expect( await screen.findAllByRole( 'alert' ) ).toHaveLength( 2 )
    expect( screen.getByText( 'Linking isn\'t configured' ) ).toBeInTheDocument()
  } )

  it( 'shows the linking usage under the summary', async () => {
    render( jobFixture( {
      ...linkedJob,
      link_usage: {
        last_run: {
          model: 'claude-haiku-5-5',
          prompt_version: 1,
          input_tokens: 5_000,
          output_tokens: 300,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          tool_calls: 4,
          cost_usd: null,
          outcome: 'succeeded',
          created_at: '2026-10-17T10:00:00.000Z',
        },
        run_count: 1,
        total_input_tokens: 5_000,
        total_output_tokens: 300,
        total_cost_usd: null,
      },
    } ), [] )

    expect( await screen.findByText( /^Linking · claude-haiku-5-5 · prompt v1 · 4 tool calls/ ) )
      .toBeInTheDocument()
  } )
} )
