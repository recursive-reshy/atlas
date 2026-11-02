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
// App
import { useMeleteToday } from '#src/hooks/useMeleteToday'
import { meleteSubjectFixture, meleteTodayFixture } from '#src/test-support/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { MeleteToday } from './MeleteToday'

vi.mock( '#src/hooks/useMeleteToday' )
vi.mock( '../LearningRootSetup', () => ( {
  LearningRootSetup: ( { currentRoot }: { currentRoot: string | null } ) => (
    <div role="dialog" aria-label="Learning root setup">{ `root: ${ currentRoot }` }</div>
  ),
} ) )

const mockedUseMeleteToday = vi.mocked( useMeleteToday )

const show = ( today: ReturnType< typeof meleteTodayFixture > | null, overrides = {} ): void => {
  mockedUseMeleteToday.mockReturnValue( { today, isLoading: false, error: null, ...overrides } )
}

beforeEach( () => {
  mockedUseMeleteToday.mockReset()
} )

describe( 'MeleteToday without a learning root', () => {
  beforeEach( () => {
    show( meleteTodayFixture( { learning_root: null, subjects: [] } ) )
  } )

  it( 'explains the learning root and offers to choose it', async () => {
    const user = userEvent.setup()
    renderWithClient( <MeleteToday /> )

    expect( screen.getByText( /Choose a learning root/ ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Choose learning root' } ) )

    expect( screen.getByRole( 'dialog' ) ).toHaveTextContent( 'root: null' )
  } )

  it( 'has no review button', () => {
    renderWithClient( <MeleteToday /> )

    expect( screen.queryByRole( 'link', { name: 'Start review' } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'MeleteToday with a learning root', () => {
  it( 'shows the totals and starts a review of everything', () => {
    show( meleteTodayFixture() )
    renderWithClient( <MeleteToday /> )

    expect( screen.getByText( '4 due · 5 new' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Start review' } ) )
      .toHaveAttribute( 'href', '/melete/review' )
  } )

  it( 'lists the subjects', () => {
    show( meleteTodayFixture( {
      subjects: [
        meleteSubjectFixture(),
        meleteSubjectFixture( { id: '6f2a9c1d-8e3b-4d5f-a7c0-9b8a7c6d5e4f', name: 'Rust' } ),
      ],
    } ) )
    renderWithClient( <MeleteToday /> )

    expect( screen.getByRole( 'link', { name: 'TypeScript' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Rust' } ) ).toBeInTheDocument()
  } )

  it( 'disables Start review when nothing is due or new', () => {
    show( meleteTodayFixture( { totals: { due: 0, new_remaining: 0, learning_soon: 0 } } ) )
    renderWithClient( <MeleteToday /> )

    expect( screen.getByRole( 'link', { name: 'Start review' } ) )
      .toHaveAttribute( 'aria-disabled', 'true' )
  } )

  it( 'warns about the paths the last scan could not read', () => {
    show( meleteTodayFixture( { skipped_paths: [ 'Learning/Locked' ] } ) )
    renderWithClient( <MeleteToday /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Learning/Locked' )
  } )

  it( 'has no warning when nothing was skipped', () => {
    show( meleteTodayFixture() )
    renderWithClient( <MeleteToday /> )

    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
  } )

  it( 'says how to add subjects when the learning root has none', () => {
    show( meleteTodayFixture( { subjects: [] } ) )
    renderWithClient( <MeleteToday /> )

    expect( screen.getByText( /Make a folder in Learning/ ) ).toBeInTheDocument()
  } )

  it( 'reopens the learning root dialog from the settings action', async () => {
    const user = userEvent.setup()
    show( meleteTodayFixture() )
    renderWithClient( <MeleteToday /> )

    await user.click( screen.getByRole( 'button', { name: 'Change learning root' } ) )

    expect( screen.getByRole( 'dialog' ) ).toHaveTextContent( 'root: Learning' )
  } )
} )

describe( 'MeleteToday loading and errors', () => {
  it( 'shows a status while loading', () => {
    show( null, { isLoading: true } )
    renderWithClient( <MeleteToday /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading' )
  } )

  it( 'shows an error', () => {
    show( null, { error: 'Could not reach the server' } )
    renderWithClient( <MeleteToday /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )
} )
