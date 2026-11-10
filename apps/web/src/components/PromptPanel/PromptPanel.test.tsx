// React
import type { ReactElement } from 'react'
// Packages
import { Link } from 'react-router'
// Testing Library
import { fireEvent, screen, waitFor } from '@testing-library/react'
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
import { useMeleteProfiles } from '#src/hooks/useMeleteProfiles'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { usePromptVersions } from '#src/hooks/usePromptVersions'
import { useSettings } from '#src/hooks/useSettings'
import {
  meleteProfilesState,
  profilesState,
  settingsState,
} from '#src/test-support/hookStates'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  BUSINESS_ID,
  CODING_ID,
  LINKER_ID,
  MELETE_GRADING_ID,
  MELETE_MAP_ID,
  MELETE_QUESTIONS_ID,
  MELETE_SUGGEST_ID,
  MELETE_SYLLABUS_ID,
  profileFixture,
  profilesFixture,
  settingsFixture,
  versionFixture,
} from '#src/features/jobs/fixtures/summarizer.fixture'
import { PromptPanel } from './PromptPanel'

vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/usePromptProfiles' )
vi.mock( '#src/hooks/useMeleteProfiles' )
vi.mock( '#src/hooks/usePromptVersions' )
vi.mock( '../PromptHistory', () => ( {
  PromptHistory: ( props: {
    profileId: string
    currentVersionId: number
    onRestore: ( versionId: number ) => void
  } ) => (
    <div>
      <p>{ `history of ${ props.profileId } at ${ props.currentVersionId }` }</p>
      <button onClick={ () => props.onRestore( 7 ) }>restore version 7</button>
    </div>
  ),
} ) )
vi.mock( '../LockedInstructions', () => ( {
  LockedInstructions: ( { title, text }: { title?: string, text: string } ) => (
    <p>{ `${ title ?? 'locked' }: ${ text }` }</p>
  ),
} ) )

type Options = { onSuccess?: ( ...args: unknown[] ) => void }

// A mutation that succeeds at once, like a server that answered.
const succeeding = ( data?: unknown ): { stub: never, mutate: ReturnType< typeof vi.fn > } => {
  const mutate = vi.fn( ( variables: unknown, options?: Options ) => {
    options?.onSuccess?.( data, variables, undefined )
  } )

  return { stub: mutationStub< never >( { mutate } ), mutate }
}

const linkerVersion = versionFixture( {
  id: 12,
  profile_id: LINKER_ID,
  version: 2,
  source: 'edit',
  guidance: 'Link only strong matches.',
} )

const versionsState = ( overrides = {} ) => ( {
  versions: [ linkerVersion ],
  isLoading: false,
  error: null,
  ...overrides,
} )

const field = (): HTMLElement => screen.getByRole( 'textbox', { name: 'Guidance' } )

beforeEach( () => {
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
  vi.mocked( useMeleteProfiles ).mockReturnValue( meleteProfilesState() )
  vi.mocked( usePromptVersions ).mockReturnValue( versionsState() )
} )

describe( 'PromptPanel, a summary profile', () => {
  it( 'shows its name, guidance, history and the locked instructions', () => {
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )
    const locked = settingsFixture().locked_instructions
    const sends = 'Instructions the app always sends'

    expect( screen.getByRole( 'heading', { level: 3, name: 'Business ideas' } ) )
      .toBeInTheDocument()
    expect( field() ).toHaveValue( 'Focus on ideas worth exploring.' )
    expect( screen.getByText( `history of ${ BUSINESS_ID } at 1` ) ).toBeInTheDocument()
    expect( screen.getByText( `${ sends } for videos: ${ locked.video }` ) ).toBeInTheDocument()
    expect( screen.getByText( `${ sends } for articles: ${ locked.article }` ) )
      .toBeInTheDocument()
    expect( screen.queryByText( /when linking/ ) ).not.toBeInTheDocument()
  } )

  it( 'does not ask for the linker\'s versions', () => {
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )

    expect( usePromptVersions ).toHaveBeenCalledWith( null )
  } )

  it( 'announces loading while the profiles load', () => {
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { profiles: [], isLoading: true } ),
    )
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading the prompt…' )
  } )

  it( 'shows an error when the profiles cannot be loaded', () => {
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { profiles: [], error: 'Could not reach the server' } ),
    )
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  it( 'sends an unknown or deleted prompt back to the prompts', () => {
    const { location } = renderWithClient(
      <PromptPanel promptId="gone" />,
      { route: '/settings/prompts/gone' },
    )

    expect( location().pathname ).toBe( '/settings/prompts' )
  } )

  it( 'marks edits as unsaved and enables Save', () => {
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )

    fireEvent.change( field(), { target: { value: 'Something else' } } )

    expect( screen.getByText( 'Unsaved changes' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeEnabled()
  } )

  it( 'treats a change that only adds trailing whitespace as unchanged', () => {
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )

    fireEvent.change( field(), { target: { value: 'Focus on ideas worth exploring.  \n' } } )

    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
  } )

  it( 'saves the edit as a new version and clears the edit marker', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding( profileFixture() )
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( { saveVersion: stub } ) )
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )
    await user.type( field(), ' more' )

    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { id: BUSINESS_ID, guidance: 'Focus on ideas worth exploring. more' },
      expect.anything(),
    )
    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
  } )

  it( 'discards the edit', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )
    await user.type( field(), ' more' )

    await user.click( screen.getByRole( 'button', { name: 'Discard changes' } ) )

    expect( field() ).toHaveValue( 'Focus on ideas worth exploring.' )
    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
  } )

  it( 'resets to the shipped text after confirming, and clears the edit', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding( profileFixture() )
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( { resetProfile: stub } ) )
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )
    await user.type( field(), ' more' )

    await user.click( screen.getByRole( 'button', { name: 'Reset to default' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Reset' } ) )

    expect( mutate ).toHaveBeenCalledWith( BUSINESS_ID, expect.anything() )
    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
  } )

  it( 'does not offer Reset to default for a profile the user made', () => {
    const custom = profileFixture( { id: 'c', name: 'Mine', can_reset: false } )
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { profiles: [ ...profilesFixture(), custom ] } ),
    )
    renderWithClient( <PromptPanel promptId="c" /> )

    expect( screen.queryByRole( 'button', { name: 'Reset to default' } ) ).not.toBeInTheDocument()
  } )

  it( 'restores a version and drops any edit', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding( profileFixture() )
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( { restoreVersion: stub } ) )
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )
    await user.type( field(), ' more' )

    await user.click( screen.getByRole( 'button', { name: 'restore version 7' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { id: BUSINESS_ID, versionId: 7 },
      expect.anything(),
    )
    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
  } )

  it( 'shows the error of a failed save', () => {
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( {
      saveVersion: mutationStub( { isError: true, error: new Error( 'Guidance is too long' ) } ),
    } ) )
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Guidance is too long' )
  } )
} )

describe( 'PromptPanel, the linker prompt', () => {
  it( 'asks for the linker profile\'s versions and shows the newest as the guidance', () => {
    renderWithClient( <PromptPanel promptId="linker" /> )

    expect( usePromptVersions ).toHaveBeenCalledWith( LINKER_ID )
    expect( screen.getByRole( 'heading', { level: 3, name: 'Linker prompt' } ) )
      .toBeInTheDocument()
    expect( field() ).toHaveValue( 'Link only strong matches.' )
    expect( screen.getByText( `history of ${ LINKER_ID } at 12` ) ).toBeInTheDocument()
  } )

  it( 'saves an edit as a new version of the linker profile', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { saveVersion: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <PromptPanel promptId="linker" /> )

    await user.clear( field() )
    await user.type( field(), 'Link everything.' )
    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { id: LINKER_ID, guidance: 'Link everything.' },
      expect.anything(),
    )
  } )

  it( 'resets to the shipped prompt after a confirm', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { resetProfile: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <PromptPanel promptId="linker" /> )

    await user.click( screen.getByRole( 'button', { name: 'Reset to default' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Reset' } ) )

    expect( mutate ).toHaveBeenCalledWith( LINKER_ID, expect.anything() )
  } )

  it( 'shows the linker\'s locked instructions, and not the summary ones', () => {
    renderWithClient( <PromptPanel promptId="linker" /> )

    expect( screen.getByText(
      'Instructions the app always sends when linking: You propose links.',
    ) ).toBeInTheDocument()
    expect( screen.queryByText( /for videos/ ) ).not.toBeInTheDocument()
  } )

  it( 'says the locked instructions are unavailable while the agent service is down', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      agentStatus: 'unavailable',
      linkerLockedInstructions: null,
    } ) )
    renderWithClient( <PromptPanel promptId="linker" /> )

    expect( screen.getByText( 'Unavailable while the agent service is down.' ) )
      .toBeInTheDocument()
  } )

  it( 'announces loading', () => {
    vi.mocked( usePromptVersions ).mockReturnValue(
      versionsState( { versions: [], isLoading: true } ),
    )
    renderWithClient( <PromptPanel promptId="linker" /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading the prompt…' )
    expect( screen.queryByRole( 'textbox', { name: 'Guidance' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows an error when the versions cannot be loaded', () => {
    vi.mocked( usePromptVersions ).mockReturnValue(
      versionsState( { versions: [], error: 'Could not reach the server' } ),
    )
    renderWithClient( <PromptPanel promptId="linker" /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )
} )

describe( 'PromptPanel, the Melete prompts', () => {
  it( 'shows the question prompt with its guidance, history and locked instructions', () => {
    renderWithClient( <PromptPanel promptId={ MELETE_QUESTIONS_ID } /> )
    const sends = 'Instructions the app always sends for question generation'

    expect( screen.getByRole( 'heading', { level: 3, name: 'Melete questions' } ) )
      .toBeInTheDocument()
    expect( field() ).toHaveValue( 'Ask me to explain.' )
    expect( screen.getByText( `history of ${ MELETE_QUESTIONS_ID } at 20` ) ).toBeInTheDocument()
    expect( screen.getByText( `${ sends }: You write questions.` ) ).toBeInTheDocument()
    expect( screen.queryByText( /for videos/ ) ).not.toBeInTheDocument()
    expect( usePromptVersions ).not.toHaveBeenCalledWith( MELETE_QUESTIONS_ID )
  } )

  it( 'shows the grading prompt with its own locked instructions', () => {
    renderWithClient( <PromptPanel promptId={ MELETE_GRADING_ID } /> )

    expect( field() ).toHaveValue( 'Be strict about the core idea.' )
    expect( screen.getByText(
      'Instructions the app always sends for grading: You grade answers.',
    ) ).toBeInTheDocument()
    expect( screen.queryByText( /question generation/ ) ).not.toBeInTheDocument()
  } )

  it.each( [
    [ MELETE_SYLLABUS_ID, 'Put the foundations first.', 'syllabus drafting', 'a syllabus' ],
    [ MELETE_MAP_ID, 'Prefer one or two concepts.', 'mapping notes', 'a note' ],
    [ MELETE_SUGGEST_ID, 'Prefer free resources.', 'resource suggestions', 'resources' ],
  ] )( 'shows the concept-layer prompt %s with its own locked instructions', (
    id,
    guidance,
    what,
    verb,
  ) => {
    renderWithClient( <PromptPanel promptId={ id } /> )

    expect( field() ).toHaveValue( guidance )
    expect( screen.getByText(
      new RegExp( `^Instructions the app always sends for ${ what }: You .* ${ verb }\\.$` ),
    ) ).toBeInTheDocument()
    expect( screen.queryByText( /question generation/ ) ).not.toBeInTheDocument()
  } )

  it( 'saves an edit as a new version of that profile', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { saveVersion: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <PromptPanel promptId={ MELETE_GRADING_ID } /> )

    await user.clear( field() )
    await user.type( field(), 'Be kind.' )
    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { id: MELETE_GRADING_ID, guidance: 'Be kind.' },
      expect.anything(),
    )
  } )

  it( 'resets to the shipped prompt after a confirm', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { resetProfile: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <PromptPanel promptId={ MELETE_QUESTIONS_ID } /> )

    await user.click( screen.getByRole( 'button', { name: 'Reset to default' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Reset' } ) )

    expect( mutate ).toHaveBeenCalledWith( MELETE_QUESTIONS_ID, expect.anything() )
  } )

  it( 'announces loading while the Melete prompts load', () => {
    vi.mocked( useMeleteProfiles ).mockReturnValue(
      meleteProfilesState( { profiles: [], isLoading: true } ),
    )
    renderWithClient( <PromptPanel promptId={ MELETE_QUESTIONS_ID } /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading the prompt…' )
  } )

  it( 'shows an error when the Melete prompts cannot be loaded', () => {
    vi.mocked( useMeleteProfiles ).mockReturnValue(
      meleteProfilesState( { profiles: [], error: 'Could not reach the server' } ),
    )
    renderWithClient( <PromptPanel promptId={ MELETE_QUESTIONS_ID } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  it( 'does not wait for the Melete prompts to show a summary profile', () => {
    vi.mocked( useMeleteProfiles ).mockReturnValue(
      meleteProfilesState( { profiles: [], isLoading: true } ),
    )
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )

    expect( field() ).toHaveValue( 'Focus on ideas worth exploring.' )
  } )
} )

describe( 'PromptPanel, unsaved changes', () => {
  const Harness = ( { promptId }: { promptId: string } ): ReactElement => (
    <>
      <Link to="/settings/models">Models tab</Link>
      <Link to={ `/settings/prompts/${ promptId }?x=1` }>Same prompt</Link>
      <PromptPanel promptId={ promptId } />
    </>
  )
  const route = `/settings/prompts/${ BUSINESS_ID }`

  it( 'asks before leaving for another tab, and leaves on Discard', async () => {
    const user = userEvent.setup()
    const { location } = renderWithClient( <Harness promptId={ BUSINESS_ID } />, { route } )
    await user.type( field(), ' more' )

    await user.click( screen.getByRole( 'link', { name: 'Models tab' } ) )

    expect( await screen.findByRole( 'dialog', { name: 'Discard unsaved changes?' } ) )
      .toBeInTheDocument()
    expect( location().pathname ).toBe( route )

    await user.click( screen.getByRole( 'button', { name: 'Discard' } ) )

    expect( location().pathname ).toBe( '/settings/models' )
  } )

  it( 'stays and keeps the edit when the user keeps editing', async () => {
    const user = userEvent.setup()
    const { location } = renderWithClient( <Harness promptId={ BUSINESS_ID } />, { route } )
    await user.type( field(), ' more' )

    await user.click( screen.getByRole( 'link', { name: 'Models tab' } ) )
    await user.click( await screen.findByRole( 'button', { name: 'Cancel' } ) )
    await waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )

    expect( location().pathname ).toBe( route )
    expect( field() ).toHaveValue( 'Focus on ideas worth exploring. more' )
  } )

  it( 'moves on without asking when nothing was edited', async () => {
    const user = userEvent.setup()
    const { location } = renderWithClient( <Harness promptId={ BUSINESS_ID } />, { route } )

    await user.click( screen.getByRole( 'link', { name: 'Models tab' } ) )

    expect( location().pathname ).toBe( '/settings/models' )
    expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
  } )

  it( 'does not block selecting the prompt that is already open', async () => {
    const user = userEvent.setup()
    const { location } = renderWithClient( <Harness promptId={ BUSINESS_ID } />, { route } )
    await user.type( field(), ' more' )

    await user.click( screen.getByRole( 'link', { name: 'Same prompt' } ) )

    expect( location().search ).toBe( '?x=1' )
    expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
  } )

  it( 'does not carry an edit over to another prompt', async () => {
    const user = userEvent.setup()
    const { rerender } = renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )
    await user.type( field(), ' more' )

    rerender( <PromptPanel promptId={ CODING_ID } /> )

    expect( field() ).toHaveValue( 'Focus on techniques.' )
    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
  } )

  it( 'warns the browser while there is an edit, and not otherwise', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptPanel promptId={ BUSINESS_ID } /> )
    const clean = new Event( 'beforeunload', { cancelable: true } )
    window.dispatchEvent( clean )

    await user.type( field(), ' more' )
    const dirty = new Event( 'beforeunload', { cancelable: true } )
    window.dispatchEvent( dirty )

    expect( clean.defaultPrevented ).toBe( false )
    expect( dirty.defaultPrevented ).toBe( true )
  } )
} )
