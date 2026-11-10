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
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { settingsState } from '#src/test-support/hookStates'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { settingsFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { NumberSettingField } from './NumberSettingField'

vi.mock( '#src/features/settings/hooks/useSettings' )

const mutate = vi.fn()

const show = ( min = 1, max = 30 ): void => {
  renderWithClient( <NumberSettingField
    settingKey="melete_session_gap_minutes"
    label="Gap"
    min={ min }
    max={ max }
  /> )
}

const field = (): HTMLElement => screen.getByRole( 'spinbutton', { name: 'Gap' } )

beforeEach( () => {
  mutate.mockReset()
  vi.mocked( useSettings ).mockReturnValue(
    settingsState( { updateSettings: mutationStub( { mutate } ) } ),
  )
} )

describe( 'NumberSettingField', () => {
  it( 'shows the saved number and the range', () => {
    show()

    expect( field() ).toHaveValue( 5 )
    expect( screen.getByText( '1 to 30' ) ).toBeInTheDocument()
    expect( field() ).toHaveAttribute( 'min', '1' )
    expect( field() ).toHaveAttribute( 'max', '30' )
  } )

  it( 'is disabled until the settings are loaded', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( { settings: null } ) )
    show()

    expect( field() ).toBeDisabled()
  } )

  it( 'saves a new number when the field loses focus', async () => {
    const user = userEvent.setup()

    show()
    await user.clear( field() )
    await user.type( field(), '12' )
    await user.tab()

    expect( mutate ).toHaveBeenCalledWith( { melete_session_gap_minutes: 12 } )
  } )

  it.each( [ '0', '31', '', '2.5' ] )( 'does not save "%s", and restores it', async ( text ) => {
    const user = userEvent.setup()

    show()
    await user.clear( field() )

    if( text !== '' ) {
      await user.type( field(), text )
    }

    await user.tab()

    expect( mutate ).not.toHaveBeenCalled()
    expect( field() ).toHaveValue( 5 )
  } )

  it( 'accepts a minimum of zero when the range starts there', async () => {
    const user = userEvent.setup()

    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      settings: { ...settingsFixture().settings, melete_session_gap_minutes: 4 },
      updateSettings: mutationStub( { mutate } ),
    } ) )
    show( 0, 30 )
    await user.clear( field() )
    await user.type( field(), '0' )
    await user.tab()

    expect( mutate ).toHaveBeenCalledWith( { melete_session_gap_minutes: 0 } )
  } )

  it( 'does not save an unchanged number', async () => {
    const user = userEvent.setup()

    show()
    await user.click( field() )
    await user.tab()

    expect( mutate ).not.toHaveBeenCalled()
  } )
} )
