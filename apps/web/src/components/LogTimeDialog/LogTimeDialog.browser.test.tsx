// Packages
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
// Testing Library
import { render, screen, within } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { page, userEvent } from 'vitest/browser'
// App
import { LogTimeButton } from '#src/components/LogTimeButton'
import { useLogTime } from '#src/hooks/useLogTime'
import { useMe } from '#src/app/useMe'
import { useMeleteToday } from '#src/hooks/useMeleteToday'
import { useThemisOverview } from '#src/hooks/useThemisOverview'
import { meFixture } from '#src/test-support/me.fixture'
import { meleteSubjectFixture, meleteTodayFixture } from '#src/test-support/melete.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { overviewFixture } from '#src/test-support/themis.fixture'
import { theme } from '#src/theme'

vi.mock( '#src/hooks/useLogTime' )
vi.mock( '#src/app/useMe' )
vi.mock( '#src/hooks/useMeleteToday' )
vi.mock( '#src/hooks/useThemisOverview' )

const MIN_TAP_SIZE = 44
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const
const MODES = [ 'light', 'dark' ] as const

const mutate = vi.fn()

const renderButton = ( mode: ( typeof MODES )[ number ] ): void => {
  render(
    <ThemeProvider theme={ theme } defaultMode={ mode } storageManager={ null } noSsr>
      <CssBaseline />
      <LogTimeButton isFloating />
    </ThemeProvider>,
  )
}

const scrollbarFree = (): boolean => {
  const { scrollWidth, clientWidth } = document.documentElement

  return scrollWidth <= clientWidth
}

beforeEach( () => {
  mutate.mockReset()
  vi.mocked( useLogTime ).mockReturnValue(
    mutationStub< ReturnType< typeof useLogTime > >( { mutate } ),
  )
  vi.mocked( useMe ).mockReturnValue( {
    me: meFixture( { modules: [ 'melete', 'themis' ] } ),
    isLoading: false,
    error: null,
  } )
  vi.mocked( useMeleteToday ).mockReturnValue( {
    today: meleteTodayFixture( { subjects: [ meleteSubjectFixture() ] } ),
    isLoading: false,
    error: null,
  } )
  vi.mocked( useThemisOverview ).mockReturnValue( {
    overview: overviewFixture(),
    isLoading: false,
    error: null,
  } )
} )

describe.each( SIZES )( 'LogTimeDialog at $name size', ( { width, height } ) => {
  it.each( MODES )( 'logs minutes with real input, %s', async ( mode ) => {
    await page.viewport( width, height )
    renderButton( mode )

    expect( screen.getByRole( 'button', { name: 'Log time' } ).getBoundingClientRect().height )
      .toBeGreaterThanOrEqual( MIN_TAP_SIZE )

    await userEvent.click( screen.getByRole( 'button', { name: 'Log time' } ) )
    await expect.poll( () => screen.getByRole( 'dialog', { name: 'Log time' } ) ).toBeVisible()

    await userEvent.selectOptions(
      screen.getByRole( 'combobox', { name: 'Subject or goal' } ),
      'TypeScript',
    )
    await userEvent.click( screen.getByRole( 'button', { name: '45 min' } ) )

    await expect.poll( () => screen.getByRole( 'spinbutton', { name: 'Minutes' } ) )
      .toHaveValue( 45 )

    for( const button of screen.getByRole( 'dialog' ).querySelectorAll( 'button' ) ) {
      expect( button.getBoundingClientRect().height ).toBeGreaterThanOrEqual( MIN_TAP_SIZE )
    }

    await userEvent.click( within( screen.getByRole( 'dialog' ) )
      .getByRole( 'button', { name: 'Log time' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      expect.objectContaining( { minutes: 45 } ),
      expect.anything(),
    )
  } )

  it.each( MODES )( 'fits the window with no sideways scroll, %s', async ( mode ) => {
    await page.viewport( width, height )
    renderButton( mode )
    await userEvent.click( screen.getByRole( 'button', { name: 'Log time' } ) )
    await expect.poll( () => screen.getByRole( 'dialog', { name: 'Log time' } ) ).toBeVisible()

    const { left, right, bottom } = screen.getByRole( 'dialog' ).getBoundingClientRect()

    expect( left ).toBeGreaterThanOrEqual( 0 )
    expect( right ).toBeLessThanOrEqual( window.innerWidth )
    expect( bottom ).toBeLessThanOrEqual( window.innerHeight )
    expect( scrollbarFree() ).toBe( true )
  } )
} )
