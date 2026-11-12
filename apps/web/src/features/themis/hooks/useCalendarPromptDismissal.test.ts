// Testing Library
import { act, renderHook } from '@testing-library/react'
// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useCalendarPromptDismissal } from './useCalendarPromptDismissal'

beforeEach( () => {
  window.localStorage.clear()
} )

afterEach( () => {
  vi.restoreAllMocks()
} )

describe( 'useCalendarPromptDismissal', () => {
  it( 'starts undismissed', () => {
    const { result } = renderHook( () => useCalendarPromptDismissal() )

    expect( result.current.isDismissed ).toBe( false )
  } )

  it( 'remembers a dismissal across renders', () => {
    const first = renderHook( () => useCalendarPromptDismissal() )

    act( () => first.result.current.dismiss() )
    expect( first.result.current.isDismissed ).toBe( true )

    const second = renderHook( () => useCalendarPromptDismissal() )

    expect( second.result.current.isDismissed ).toBe( true )
  } )

  it( 'works without storage: reading and writing throw, dismissing still hides it', () => {
    vi.spyOn( Storage.prototype, 'getItem' ).mockImplementation( () => {
      throw new Error( 'blocked' )
    } )
    vi.spyOn( Storage.prototype, 'setItem' ).mockImplementation( () => {
      throw new Error( 'blocked' )
    } )
    const { result } = renderHook( () => useCalendarPromptDismissal() )

    expect( result.current.isDismissed ).toBe( false )
    act( () => result.current.dismiss() )
    expect( result.current.isDismissed ).toBe( true )
  } )
} )
