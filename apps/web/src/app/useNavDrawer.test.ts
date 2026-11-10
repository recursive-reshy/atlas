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
import { useNavDrawer } from './useNavDrawer'

const KEY = 'atlas:nav-drawer'

beforeEach( () => {
  window.localStorage.clear()
} )

afterEach( () => {
  vi.restoreAllMocks()
} )

describe( 'useNavDrawer', () => {
  it( 'starts expanded', () => {
    const { result } = renderHook( () => useNavDrawer() )

    expect( result.current.isExpanded ).toBe( true )
  } )

  it( 'toggles and remembers the choice', () => {
    const { result } = renderHook( () => useNavDrawer() )

    act( () => result.current.toggle() )

    expect( result.current.isExpanded ).toBe( false )
    expect( window.localStorage.getItem( KEY ) ).toBe( 'collapsed' )

    act( () => result.current.toggle() )

    expect( result.current.isExpanded ).toBe( true )
    expect( window.localStorage.getItem( KEY ) ).toBe( 'expanded' )
  } )

  it( 'reads a stored choice on mount', () => {
    window.localStorage.setItem( KEY, 'collapsed' )

    const { result } = renderHook( () => useNavDrawer() )

    expect( result.current.isExpanded ).toBe( false )
  } )

  it( 'falls back to expanded for an unknown stored value', () => {
    window.localStorage.setItem( KEY, 'sideways' )

    const { result } = renderHook( () => useNavDrawer() )

    expect( result.current.isExpanded ).toBe( true )
  } )

  it( 'falls back to expanded when reading storage throws', () => {
    vi.spyOn( Storage.prototype, 'getItem' ).mockImplementation( () => {
      throw new Error( 'blocked' )
    } )

    const { result } = renderHook( () => useNavDrawer() )

    expect( result.current.isExpanded ).toBe( true )
  } )

  it( 'still toggles when writing storage throws', () => {
    vi.spyOn( Storage.prototype, 'setItem' ).mockImplementation( () => {
      throw new Error( 'blocked' )
    } )
    const { result } = renderHook( () => useNavDrawer() )

    act( () => result.current.toggle() )

    expect( result.current.isExpanded ).toBe( false )
  } )
} )
