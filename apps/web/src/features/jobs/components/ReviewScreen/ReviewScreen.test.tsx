// React
import type { ReactElement } from 'react'
// Packages
import { useNavigate } from 'react-router'
// Shared
import { parseNote, serializeNote } from '@atlas/shared'
// Testing Library
import { screen, within } from '@testing-library/react'
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
import {
  discardJob,
  regenerateSummary,
  retrySummary,
  saveJob,
  updateDraft,
} from '#src/features/jobs/api/jobs.api'
import { useFolders } from '#src/features/vault/hooks/useFolders'
import { useModels } from '#src/features/settings/hooks/useModels'
import { usePromptProfiles } from '#src/features/settings/hooks/usePromptProfiles'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { useSource } from '#src/features/jobs/hooks/useSource'
import { modelsState, profilesState, settingsState } from '#src/test-support/hookStates'
import { jobFixture } from '#src/features/jobs/fixtures/job.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ReviewScreen } from './ReviewScreen'

vi.mock( '#src/features/jobs/hooks/useSource' )
vi.mock( '#src/features/vault/hooks/useFolders' )
vi.mock( '#src/features/settings/hooks/useModels' )
vi.mock( '#src/features/settings/hooks/useSettings' )
vi.mock( '#src/features/settings/hooks/usePromptProfiles' )
vi.mock( '../NoteEditor', () => {
  return {
    NoteEditor: ( props: {
      value: string
      onChange: ( value: string ) => void
      onModeChange?: ( mode: 'rich-text' | 'source' ) => void
      onBlur?: () => void
    } ) => (
      <div>
        <textarea
          aria-label="Summary"
          value={ props.value }
          onChange={ ( event ) => props.onChange( event.target.value ) }
          onBlur={ props.onBlur }
        />
        <button type="button" onClick={ () => props.onModeChange?.( 'source' ) }>
          Fake source
        </button>
        <button type="button" onClick={ () => props.onModeChange?.( 'rich-text' ) }>
          Fake rich
        </button>
      </div>
    ),
  }
} )
vi.mock( '#src/features/jobs/api/jobs.api' )

const mockedSaveJob = vi.mocked( saveJob )
const mockedUpdateDraft = vi.mocked( updateDraft )
const mockedDiscardJob = vi.mocked( discardJob )
const mockedRetrySummary = vi.mocked( retrySummary )

const mockedUseSource = vi.mocked( useSource )
const mockedUseFolders = vi.mocked( useFolders )

const folderTree = [
  {
    name: 'Learning',
    path: 'Learning',
    children: [ { name: 'Rust', path: 'Learning/Rust', children: [] } ],
  },
  { name: 'Mnemosyne', path: 'Mnemosyne', children: [] },
]

const transcript = {
  meta: {
    title: 'How Rust Works',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 300,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  text: 'Welcome to the talk.',
}

beforeEach( () => {
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( useModels ).mockReturnValue( modelsState() )
  mockedUseFolders.mockReset()
  mockedUseFolders.mockReturnValue(
    { defaultFolder: 'Mnemosyne', folders: folderTree, error: null },
  )
  mockedUseSource.mockReset()
  mockedUseSource.mockReturnValue( { source: { kind: 'video', ...transcript }, error: null } )
  mockedSaveJob.mockReset()
  mockedUpdateDraft.mockReset()
  mockedUpdateDraft.mockImplementation( ( _id, body ) => Promise.resolve( {
    ...reviewJob,
    note_markdown: body.note_markdown ?? reviewJob.note_markdown,
  } ) )
  mockedDiscardJob.mockReset()
  mockedRetrySummary.mockReset()
} )

const noteWith = ( tags: string[], body: string, title = 'How Rust Works' ): string => {
  return serializeNote( {
    properties: {
      title,
      source: 'https://www.youtube.com/watch?v=abc',
      channel: 'Channel',
      duration: '05:00',
      created: '2026-10-15',
      tags: [ 'mnemosyne', ...tags ],
    },
    body,
  } )
}

const reviewJob = jobFixture( {
  status: 'ready_for_review',
  title: 'How Rust Works',
  note_markdown: noteWith( [ 'rust' ], '## Summary\nText.\n' ),
} )

const handlers = () => ( { onSaved: vi.fn(), onDiscarded: vi.fn() } )

const failedJob = { ...reviewJob, status: 'summary_failed' as const, error: 'x' }

describe( 'ReviewScreen feed chip', () => {
  it( 'shows the feed name for a feed job', () => {
    const feedJob = { ...reviewJob, feed_id: reviewJob.id, feed_name: 'Example Blog' }
    renderWithClient( <ReviewScreen job={ feedJob } { ...handlers() } /> )

    expect( screen.getByText( 'Example Blog' ) ).toBeInTheDocument()
  } )

  it( 'shows no chip for a job that did not come from a feed', () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    expect( screen.queryByTestId( 'RssFeedIcon' ) ).not.toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen title', () => {
  it( 'starts with the job title and shows the file name it will get', () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toHaveValue( 'How Rust Works' )
    expect( screen.getByText( 'Mnemosyne/How Rust Works.md' ) ).toBeInTheDocument()
  } )

  it( 'updates the file name as the title is edited', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()
    const field = screen.getByRole( 'textbox', { name: 'Title' } )

    await user.clear( field )
    await user.type( field, 'New: Name' )

    expect( screen.getByText( 'Mnemosyne/New Name.md' ) ).toBeInTheDocument()
  } )

  it( 'has no title field when the summary failed', () => {
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    expect( screen.queryByRole( 'textbox', { name: 'Title' } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen tags', () => {
  it( 'starts with mnemosyne and the suggested tags and lets the user edit them', async () => {
    const taggedJob = {
      ...reviewJob,
      note_markdown: noteWith( [ 'rust', 'go' ], '## Summary\nText.\n' ),
    }
    renderWithClient( <ReviewScreen job={ taggedJob } { ...handlers() } /> )
    const user = userEvent.setup()

    const names = (): string[] => {
      return within( screen.getByRole( 'list', { name: 'Tags' } ) )
        .getAllByRole( 'listitem' )
        .map( ( item ) => ( item.textContent ?? '' ).replace( '×', '' ) )
    }

    expect( names().join( ',' ) ).toBe( 'mnemosyne,rust,go' )

    await user.click( screen.getByRole( 'button', { name: 'Remove tag rust' } ) )
    await user.type( screen.getByRole( 'textbox', { name: 'Add tag' } ), 'ai{Enter}' )

    expect( names().join( ',' ) ).toBe( 'mnemosyne,go,ai' )
  } )
} )

describe( 'ReviewScreen summary and transcript', () => {
  it( 'edits the summary Markdown', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()
    const editor = screen.getByRole( 'textbox', { name: 'Summary' } )
    const note = reviewJob.note_markdown ?? ''

    expect( editor ).toHaveValue( note )

    await user.type( editor, ' More.' )

    expect( editor ).toHaveValue( `${ note } More.` )
  } )

  it( 'shows the transcript next to the summary', () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    expect( mockedUseSource ).toHaveBeenCalledWith( reviewJob.id )
    expect( screen.getByRole( 'region', { name: 'Transcript' } ) )
      .toHaveTextContent( 'Welcome to the talk.' )
  } )

  it( 'keeps the transcript, without the editor, when the summary failed', () => {
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    expect( screen.queryByRole( 'textbox', { name: 'Summary' } ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'region', { name: 'Transcript' } ) )
      .toHaveTextContent( 'Welcome to the talk.' )
  } )
} )

describe( 'ReviewScreen autosave', () => {
  it( 'shows the whole note, front-matter included, in the editor', () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    expect( screen.getByRole( 'textbox', { name: 'Summary' } ).textContent )
      .toContain( 'title: "How Rust Works"' )
  } )

  it( 'keeps the panel and the editor on the same note', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Title' } ), '!' )

    expect( screen.getByRole( 'textbox', { name: 'Summary' } ) )
      .toHaveValue( noteWith( [ 'rust' ], '## Summary\nText.\n', 'How Rust Works!' ) )
    expect( screen.getByText( 'Mnemosyne/How Rust Works!.md' ) ).toBeInTheDocument()
  } )

  it( 'saves the edited note to the server when the editor loses focus', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Summary' } ), '!' )
    await user.tab()

    await vi.waitFor( () => expect( mockedUpdateDraft ).toHaveBeenCalledExactlyOnceWith(
      reviewJob.id,
      { note_markdown: `${ reviewJob.note_markdown ?? '' }!` },
    ) )
    expect( await screen.findByText( 'Saved' ) ).toBeInTheDocument()
  } )

  it( 'announces that there are unsaved edits', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    await userEvent.setup().type( screen.getByRole( 'textbox', { name: 'Summary' } ), '!' )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Unsaved changes' )
  } )

  it( 'asks before the user leaves the page with unsaved edits', async () => {
    const user = userEvent.setup()
    const Leave = (): ReactElement => {
      const navigate = useNavigate()

      return <button onClick={ () => void navigate( '/' ) }>Leave</button>
    }
    const { location } = renderWithClient(
      <>
        <Leave />
        <ReviewScreen job={ reviewJob } { ...handlers() } />
      </>,
      { route: '/jobs/abc' },
    )

    await user.type( screen.getByRole( 'textbox', { name: 'Summary' } ), '!' )
    await user.click( screen.getByRole( 'button', { name: 'Leave' } ) )

    expect( await screen.findByRole( 'dialog', { name: 'Discard unsaved changes?' } ) )
      .toBeInTheDocument()
    expect( location().pathname ).toBe( '/jobs/abc' )
  } )

  it( 'shows why a draft was not saved and keeps the text', async () => {
    mockedUpdateDraft.mockRejectedValue( new ApiError( 'front-matter invalid: bad YAML', 400 ) )
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Summary' } ), '!' )
    await user.tab()

    expect( await screen.findByRole( 'alert' ) )
      .toHaveTextContent( 'Not saved: front-matter invalid: bad YAML' )
    expect( screen.getByRole( 'textbox', { name: 'Summary' } ) )
      .toHaveValue( `${ reviewJob.note_markdown ?? '' }!` )
  } )

  it( 'has no editor, panel or status when the summary failed', () => {
    renderWithClient( <ReviewScreen job={ failedJob } { ...handlers() } /> )

    expect( screen.queryByRole( 'textbox', { name: 'Summary' } ) ).not.toBeInTheDocument()
    expect( screen.queryByText( 'Saved' ) ).not.toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen destination', () => {
  it( 'saves a chosen folder to the server draft at once and shows the new path', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Change folder' } ) )
    screen.getByRole( 'treeitem', { name: 'Learning' } ).focus()
    await user.keyboard( '{ArrowRight}' )
    await user.click(
      within( screen.getByRole( 'treeitem', { name: 'Rust' } ) ).getByText( 'Rust' ),
    )

    await vi.waitFor( () => expect( mockedUpdateDraft ).toHaveBeenCalledExactlyOnceWith(
      reviewJob.id,
      { target_folder: 'Learning/Rust' },
    ) )
    expect( screen.getByText( 'Learning/Rust/How Rust Works.md' ) ).toBeInTheDocument()
  } )

  it( 'opens a job with a stored folder on that folder', () => {
    renderWithClient(
      <ReviewScreen job={ { ...reviewJob, target_folder: 'Learning' } } { ...handlers() } />,
    )

    expect( screen.getByText( 'Learning/How Rust Works.md' ) ).toBeInTheDocument()
  } )

  it( 'starts on the job\'s default folder', () => {
    renderWithClient(
      <ReviewScreen job={ { ...reviewJob, default_folder: 'Learning/React' } } { ...handlers() } />,
    )

    expect( screen.getByText( 'Learning/React/How Rust Works.md' ) ).toBeInTheDocument()
  } )

  it( 'tells the user when the folders cannot be loaded, and Save still works', async () => {
    mockedUseFolders.mockReturnValue(
      { defaultFolder: null, folders: [], error: 'Could not reach the server' },
    )
    mockedSaveJob.mockResolvedValue( 'Mnemosyne/How Rust Works.md' )
    const onSaved = vi.fn()
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } onSaved={ onSaved } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )

    await userEvent.setup().click( screen.getByRole( 'button', { name: /^Save/ } ) )

    await vi.waitFor( () => expect( onSaved ).toHaveBeenCalled() )
  } )

  it( 'offers no folder picker when the summary failed', () => {
    renderWithClient( <ReviewScreen job={ failedJob } { ...handlers() } /> )

    expect( screen.queryByRole( 'button', { name: 'Change folder' } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen editor modes', () => {
  it( 'shows the properties panel in rich text and hides it in source mode', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Fake source' } ) )

    expect( screen.queryByRole( 'textbox', { name: 'Title' } ) ).not.toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Fake rich' } ) )

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toBeInTheDocument()
  } )

  it( 'saves the edits to the server when the mode changes', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()
    await user.type( screen.getByRole( 'textbox', { name: 'Summary' } ), '!' )

    await user.click( screen.getByRole( 'button', { name: 'Fake source' } ) )

    await vi.waitFor( () => expect( mockedUpdateDraft ).toHaveBeenCalledExactlyOnceWith(
      reviewJob.id,
      { note_markdown: `${ reviewJob.note_markdown ?? '' }!` },
    ) )
  } )

  it( 'takes the server\'s normalized note into the editor only after blur', async () => {
    mockedUpdateDraft.mockResolvedValue(
      { ...reviewJob, note_markdown: 'normalized by the server' },
    )
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()
    const editor = screen.getByRole( 'textbox', { name: 'Summary' } )

    await user.type( editor, '!' )
    expect( editor ).toHaveValue( `${ reviewJob.note_markdown ?? '' }!` )

    await user.tab()

    await vi.waitFor( () => expect( editor ).toHaveValue( 'normalized by the server' ) )
  } )
} )

describe( 'ReviewScreen save', () => {
  const saveButton = (): HTMLElement => screen.getByRole( 'button', { name: /^Save/ } )

  it( 'flushes the edits, then saves with no body, and reports the saved path', async () => {
    mockedSaveJob.mockResolvedValue( 'Mnemosyne/My Title.md' )
    const onSaved = vi.fn()
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } onSaved={ onSaved } /> )
    const user = userEvent.setup()

    const title = screen.getByRole( 'textbox', { name: 'Title' } )
    await user.clear( title )
    await user.type( title, 'My Title' )
    await user.click( saveButton() )

    await vi.waitFor( () => expect( onSaved ).toHaveBeenCalledWith( 'Mnemosyne/My Title.md' ) )
    const sent = mockedUpdateDraft.mock.calls.at( -1 )?.[ 1 ].note_markdown ?? ''
    expect( parseNote( sent ).properties.title ).toBe( 'My Title' )
    expect( mockedSaveJob ).toHaveBeenCalledExactlyOnceWith( reviewJob.id )
    expect( mockedUpdateDraft.mock.invocationCallOrder[ 0 ] )
      .toBeLessThan( mockedSaveJob.mock.invocationCallOrder[ 0 ] ?? 0 )
  } )

  it( 'does not save when the draft could not be stored', async () => {
    mockedUpdateDraft.mockRejectedValue( new ApiError( 'front-matter invalid: x', 400 ) )
    const onSaved = vi.fn()
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } onSaved={ onSaved } /> )
    const user = userEvent.setup()
    await user.type( screen.getByRole( 'textbox', { name: 'Summary' } ), '!' )

    await user.click( saveButton() )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'front-matter invalid: x' )
    expect( mockedSaveJob ).not.toHaveBeenCalled()
    expect( onSaved ).not.toHaveBeenCalled()
  } )

  it( 'waits for the server: the button is busy and disabled meanwhile', async () => {
    let resolve: ( path: string ) => void = () => undefined
    mockedSaveJob.mockReturnValue( new Promise< string >( ( resolver ) => {
      resolve = resolver
    } ) )
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()

    await user.click( saveButton() )

    expect( await screen.findByRole( 'button', { name: 'Saving…' } ) ).toBeDisabled()

    resolve( 'Mnemosyne/How Rust Works.md' )
    await vi.waitFor( () => expect( screen.getByRole( 'button', { name: 'Save to vault' } ) ) )
  } )

  it( 'refreshes the job list after saving', async () => {
    mockedSaveJob.mockResolvedValue( 'Mnemosyne/How Rust Works.md' )
    const { queryClient } = renderWithClient(
      <ReviewScreen job={ reviewJob } { ...handlers() } />,
    )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    await userEvent.setup().click( saveButton() )

    await vi.waitFor( () => {
      expect( invalidate ).toHaveBeenCalledWith( { queryKey: [ 'jobs' ] } )
    } )
  } )

  it( 'shows the server message on failure', async () => {
    mockedSaveJob.mockRejectedValue( new ApiError( 'Cannot move job from saved to saved', 409 ) )
    const onSaved = vi.fn()
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } onSaved={ onSaved } /> )

    await userEvent.setup().click( saveButton() )

    expect( await screen.findByRole( 'alert' ) )
      .toHaveTextContent( 'Cannot move job from saved to saved' )
    expect( onSaved ).not.toHaveBeenCalled()
    expect( saveButton() ).toBeEnabled()
  } )

  it( 'disables Save while the title is blank', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    await userEvent.setup().clear( screen.getByRole( 'textbox', { name: 'Title' } ) )

    expect( saveButton() ).toBeDisabled()
  } )

  it( 'disables Save while the front-matter is invalid', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const editor = screen.getByRole( 'textbox', { name: 'Summary' } )

    await userEvent.setup().type( editor, '{Control>}a{/Control}broken' )

    expect( screen.getByText( 'front-matter invalid' ) ).toBeInTheDocument()
    expect( saveButton() ).toBeDisabled()
  } )

  it( 'has no Save button when the summary failed', () => {
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    expect( screen.queryByRole( 'button', { name: /^Save/ } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen discard', () => {
  const discardButton = (): HTMLElement => screen.getByRole( 'button', { name: 'Discard' } )

  it( 'discards the job and reports it', async () => {
    mockedDiscardJob.mockResolvedValue( undefined )
    const onDiscarded = vi.fn()
    renderWithClient(
      <ReviewScreen job={ reviewJob } onSaved={ vi.fn() } onDiscarded={ onDiscarded } />,
    )

    await userEvent.setup().click( discardButton() )

    expect( mockedDiscardJob ).toHaveBeenCalledExactlyOnceWith( reviewJob.id )
    await vi.waitFor( () => expect( onDiscarded ).toHaveBeenCalledTimes( 1 ) )
  } )

  it( 'leaves without asking again when the job is discarded with unsaved edits', async () => {
    mockedDiscardJob.mockResolvedValue( undefined )
    const user = userEvent.setup()
    const Screen = (): ReactElement => {
      const navigate = useNavigate()

      return (
        <ReviewScreen
          job={ reviewJob }
          onSaved={ vi.fn() }
          onDiscarded={ () => void navigate( '/' ) }
        />
      )
    }
    const { location } = renderWithClient( <Screen />, { route: '/jobs/abc' } )

    await user.type( screen.getByRole( 'textbox', { name: 'Summary' } ), '!' )
    await user.click( discardButton() )

    await vi.waitFor( () => expect( location().pathname ).toBe( '/' ) )
    expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
  } )

  it( 'shows the server message when the discard fails and stays', async () => {
    mockedDiscardJob.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const onDiscarded = vi.fn()
    renderWithClient(
      <ReviewScreen job={ reviewJob } onSaved={ vi.fn() } onDiscarded={ onDiscarded } />,
    )

    await userEvent.setup().click( discardButton() )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
    expect( onDiscarded ).not.toHaveBeenCalled()
  } )

  it( 'is available when the summary failed too', () => {
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    expect( discardButton() ).toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen retry', () => {
  it( 'is only offered when the summary failed', () => {
    renderWithClient(
      <ReviewScreen job={ reviewJob } { ...handlers() } />,
    )

    expect( screen.queryByRole( 'button', { name: 'Retry summary' } ) ).not.toBeInTheDocument()
  } )

  it( 'retries the summary of a failed job', async () => {
    mockedRetrySummary.mockResolvedValue( { ...failedJob, status: 'summarizing', error: null } )
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Retry summary' } ) )

    expect( mockedRetrySummary ).toHaveBeenCalledExactlyOnceWith( failedJob.id )
  } )

  it( 'shows the message when the retry fails', async () => {
    mockedRetrySummary.mockRejectedValue( new ApiError( 'Cannot move job from queued', 409 ) )
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Retry summary' } ) )

    const alerts = await screen.findAllByRole( 'alert' )

    const messages = alerts.map( ( alert ) => alert.textContent )

    expect( messages ).toContain( 'Cannot move job from queued' )
  } )
} )

describe( 'ReviewScreen summary info', () => {
  const usage = {
    last_run: {
      model: 'claude-sonnet-5-5',
      profile_id: '0b7c1c3e-5d4a-4e6f-9a7b-1c2d3e4f5a01',
      profile_name: 'Business ideas',
      prompt_version: 2,
      input_tokens: 31_200,
      output_tokens: 1_400,
      cost_usd: 0.12,
      outcome: 'succeeded' as const,
      created_at: '2026-10-17T10:00:00.000Z',
    },
    run_count: 1,
    total_input_tokens: 31_200,
    total_output_tokens: 1_400,
    total_cost_usd: 0.12,
  }

  beforeEach( () => {
    vi.mocked( useModels ).mockReturnValue( modelsState() )
  } )

  it( 'shows how the summary was made under the note', () => {
    const job = { ...reviewJob, summary_usage: usage }
    renderWithClient( <ReviewScreen job={ job } { ...handlers() } /> )

    expect( screen.getByText(
      'Claude Sonnet 5.5 · Business ideas v2 · 31.2k in / 1.4k out · ~US$0.12',
    ) ).toBeInTheDocument()
  } )

  it( 'shows nothing for a job without runs', () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    expect( screen.queryByText( /Business ideas v/ ) ).not.toBeInTheDocument()
  } )

  it( 'also shows it after a failed summary, where the tokens were still billed', () => {
    const failed = { ...failedJob, summary_usage: {
      ...usage,
      last_run: { ...usage.last_run, outcome: 'failed' as const },
    } }
    renderWithClient( <ReviewScreen job={ failed } { ...handlers() } /> )

    expect( screen.getByText( /^Last attempt failed · Claude Sonnet 5.5/ ) ).toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen regenerate', () => {
  const mockedRegenerate = vi.mocked( regenerateSummary )

  beforeEach( () => {
    mockedRegenerate.mockReset()
    mockedRegenerate.mockResolvedValue( { ...reviewJob, status: 'summarizing' } )
    vi.mocked( useModels ).mockReturnValue( modelsState() )
    vi.mocked( useSettings ).mockReturnValue( settingsState() )
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
  } )

  it( 'is offered for a note in review and opens the dialog', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Regenerate summary' } ) )

    expect( screen.getByRole( 'dialog', { name: 'Regenerate summary' } ) ).toBeInTheDocument()
    expect( mockedRegenerate ).not.toHaveBeenCalled()
  } )

  it( 'is not offered after a failed summary', () => {
    renderWithClient( <ReviewScreen job={ failedJob } { ...handlers() } /> )

    expect( screen.queryByRole( 'button', { name: 'Regenerate summary' } ) ).not.toBeInTheDocument()
  } )

  it( 'regenerates with the chosen model and keeps nothing else', async () => {
    const user = userEvent.setup()
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    await user.click( screen.getByRole( 'button', { name: 'Regenerate summary' } ) )
    await user.click( screen.getByRole( 'combobox', { name: 'Model' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Claude Opus 5.5' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Regenerate' } ) )

    expect( mockedRegenerate ).toHaveBeenCalledExactlyOnceWith(
      reviewJob.id,
      { model: 'claude-opus-5-5' },
    )
  } )

  it( 'puts the summarizing job in the cache', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    await user.click( screen.getByRole( 'button', { name: 'Regenerate summary' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Regenerate' } ) )

    await vi.waitFor( () => {
      expect( queryClient.getQueryData( [ 'jobs', reviewJob.id ] ) )
        .toMatchObject( { status: 'summarizing' } )
    } )
  } )

  it( 'shows the server message and keeps the dialog open when it fails', async () => {
    mockedRegenerate.mockRejectedValue( new ApiError( 'Unknown model: x', 400 ) )
    const user = userEvent.setup()
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    await user.click( screen.getByRole( 'button', { name: 'Regenerate summary' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Regenerate' } ) )

    const dialog = await screen.findByRole( 'dialog', { name: 'Regenerate summary' } )
    expect( await within( dialog ).findByRole( 'alert' ) ).toHaveTextContent( 'Unknown model: x' )
  } )

  it( 'closes the dialog with Cancel and sends nothing', async () => {
    const user = userEvent.setup()
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    await user.click( screen.getByRole( 'button', { name: 'Regenerate summary' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    await vi.waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
    expect( mockedRegenerate ).not.toHaveBeenCalled()
  } )
} )

describe( 'ReviewScreen for an article', () => {
  const articleSource = {
    kind: 'article' as const,
    meta: {
      title: 'A post about habits',
      source: 'https://example.com/habits',
      author: 'Ada',
      site: 'Example',
      published: '2026-10-01',
      fetched_at: '2026-10-18T10:00:00.000Z',
      origin: 'fetched' as const,
    },
    markdown: 'Small things compound over time.',
  }

  const articleNote = serializeNote( {
    properties: {
      title: 'A post about habits',
      source: 'https://example.com/habits',
      author: 'Ada',
      site: 'Example',
      published: '2026-10-01',
      created: '2026-10-18',
      tags: [ 'mnemosyne' ],
    },
    body: '## Summary\nText with a time 10:30 in it.\n',
  } )

  const articleJob = {
    ...reviewJob,
    source_type: 'article' as const,
    title: 'A post about habits',
    note_markdown: articleNote,
  }

  beforeEach( () => {
    mockedUseSource.mockReturnValue( { source: articleSource, error: null } )
  } )

  it( 'shows the article next to the note, not a transcript', () => {
    renderWithClient( <ReviewScreen job={ articleJob } { ...handlers() } /> )

    expect( mockedUseSource ).toHaveBeenCalledWith( articleJob.id )
    expect( screen.getByRole( 'region', { name: 'Article' } ) )
      .toHaveTextContent( 'Small things compound over time.' )
    expect( screen.queryByRole( 'region', { name: 'Transcript' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows the article properties and Markdown-only downloads', () => {
    renderWithClient( <ReviewScreen job={ articleJob } { ...handlers() } /> )

    expect( screen.getByText( 'Author' ) ).toBeInTheDocument()
    expect( screen.queryByText( 'Channel' ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'region', { name: 'Download article' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'link', { name: 'Subtitles (.srt)' } ) ).not.toBeInTheDocument()
  } )
} )
