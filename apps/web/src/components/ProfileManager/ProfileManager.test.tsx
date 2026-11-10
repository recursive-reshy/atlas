// Testing Library
import { screen, waitFor } from '@testing-library/react'
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
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { profilesState, settingsState } from '#src/test-support/hookStates'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  BUSINESS_ID,
  CODING_ID,
  profileFixture,
  profilesFixture,
} from '#src/features/jobs/fixtures/summarizer.fixture'
import { ProfileManager } from './ProfileManager'

vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/usePromptProfiles' )

type Options = { onSuccess?: ( ...args: unknown[] ) => void }

// A mutation that succeeds at once, like a server that answered.
const succeeding = ( data?: unknown ): { stub: never, mutate: ReturnType< typeof vi.fn > } => {
  const mutate = vi.fn( ( variables: unknown, options?: Options ) => {
    options?.onSuccess?.( data, variables, undefined )
  } )

  return { stub: mutationStub< never >( { mutate } ), mutate }
}

const dialogClosed = async (): Promise< void > => {
  await waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
}

beforeEach( () => {
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
} )

describe( 'ProfileManager, new', () => {
  it( 'creates a profile from the selected one and opens it', async () => {
    const user = userEvent.setup()
    const created = profileFixture( { id: 'new-id', name: 'Research' } )
    const { stub, mutate } = succeeding( created )
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( { createProfile: stub } ) )
    const { location } = renderWithClient( <ProfileManager selectedId={ BUSINESS_ID } /> )

    await user.click( screen.getByRole( 'button', { name: 'New profile' } ) )

    expect( screen.getByRole( 'textbox', { name: 'Guidance' } ) )
      .toHaveValue( 'Focus on ideas worth exploring.' )

    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'Research' )
    await user.click( screen.getByRole( 'button', { name: 'Create' } ) )
    await dialogClosed()

    expect( mutate ).toHaveBeenCalledWith(
      { name: 'Research', guidance: 'Focus on ideas worth exploring.' },
      expect.anything(),
    )
    expect( location().pathname ).toBe( '/settings/prompts/new-id' )
  } )

  it( 'keeps the dialog open and shows the message when the name is taken', async () => {
    const user = userEvent.setup()
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( {
      createProfile: mutationStub( {
        isError: true,
        error: new Error( 'A profile with that name already exists' ),
      } ),
    } ) )
    renderWithClient( <ProfileManager selectedId={ BUSINESS_ID } /> )

    await user.click( screen.getByRole( 'button', { name: 'New profile' } ) )

    expect( screen.getByRole( 'dialog', { name: 'New profile' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'A profile with that name already exists' )
  } )

  it( 'starts a profile from empty guidance when nothing is selected', async () => {
    const user = userEvent.setup()
    renderWithClient( <ProfileManager selectedId={ null } /> )

    await user.click( screen.getByRole( 'button', { name: 'New profile' } ) )

    expect( screen.getByRole( 'textbox', { name: 'Guidance' } ) ).toHaveValue( '' )
  } )
} )

describe( 'ProfileManager, rename', () => {
  it( 'renames the selected profile', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding( profileFixture( { name: 'Biz' } ) )
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( { renameProfile: stub } ) )
    renderWithClient( <ProfileManager selectedId={ BUSINESS_ID } /> )

    await user.click( screen.getByRole( 'button', { name: 'Rename' } ) )
    const name = screen.getByRole( 'textbox', { name: 'Name' } )

    expect( name ).toHaveValue( 'Business ideas' )

    await user.clear( name )
    await user.type( name, 'Biz' )
    await user.click( screen.getByRole( 'button', { name: 'Rename' } ) )
    await dialogClosed()

    expect( mutate ).toHaveBeenCalledWith( { id: BUSINESS_ID, name: 'Biz' }, expect.anything() )
  } )
} )

describe( 'ProfileManager, delete', () => {
  it( 'cannot delete the default profile', () => {
    renderWithClient( <ProfileManager selectedId={ BUSINESS_ID } /> )

    expect( screen.getByRole( 'button', { name: 'Delete' } ) ).toBeDisabled()
  } )

  it( 'cannot delete the last remaining profile', async () => {
    const user = userEvent.setup()
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { profiles: profilesFixture().slice( 1, 2 ) } ),
    )
    renderWithClient( <ProfileManager selectedId={ CODING_ID } /> )

    await user.hover( screen.getByRole( 'button', { name: 'Delete' } ) )

    expect( screen.getByRole( 'button', { name: 'Delete' } ) ).toBeDisabled()
    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( /last remaining profile/ )
  } )

  it( 'deletes another profile after confirming, and goes back to the prompts', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding()
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( { deleteProfile: stub } ) )
    const { location } = renderWithClient(
      <ProfileManager selectedId={ CODING_ID } />,
      { route: `/settings/prompts/${ CODING_ID }` },
    )

    await user.click( screen.getByRole( 'button', { name: 'Delete' } ) )

    expect( screen.getByRole( 'dialog', { name: 'Delete this profile?' } ) )
      .toHaveTextContent( 'Coding' )

    await user.click( screen.getByRole( 'button', { name: 'Delete' } ) )
    await dialogClosed()

    expect( mutate ).toHaveBeenCalledWith( CODING_ID, expect.anything() )
    expect( location().pathname ).toBe( '/settings/prompts' )
  } )

  it( 'does not delete when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding()
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( { deleteProfile: stub } ) )
    renderWithClient( <ProfileManager selectedId={ CODING_ID } /> )

    await user.click( screen.getByRole( 'button', { name: 'Delete' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )
    await dialogClosed()

    expect( mutate ).not.toHaveBeenCalled()
  } )

  it( 'shows why a delete failed', () => {
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( {
      deleteProfile: mutationStub( { isError: true, error: new Error( 'Profile is in use' ) } ),
    } ) )
    renderWithClient( <ProfileManager selectedId={ CODING_ID } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Profile is in use' )
  } )
} )

describe( 'ProfileManager, default', () => {
  it( 'sets the selected profile as the default', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    vi.mocked( useSettings ).mockReturnValue(
      settingsState( { updateSettings: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <ProfileManager selectedId={ CODING_ID } /> )

    await user.click( screen.getByRole( 'button', { name: 'Set as default' } ) )

    expect( mutate ).toHaveBeenCalledWith( { default_profile_id: CODING_ID } )
  } )

  it( 'has nothing to set when the selected profile already is the default', () => {
    renderWithClient( <ProfileManager selectedId={ BUSINESS_ID } /> )

    expect( screen.getByRole( 'button', { name: 'Set as default' } ) ).toBeDisabled()
  } )
} )

describe( 'ProfileManager, linker prompt selected', () => {
  it( 'offers only New profile, since the linker prompt is not a summary profile', () => {
    renderWithClient( <ProfileManager selectedId="linker" /> )

    expect( screen.getByRole( 'button', { name: 'New profile' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Rename' } ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Delete' } ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Set as default' } ) ).not.toBeInTheDocument()
  } )
} )
