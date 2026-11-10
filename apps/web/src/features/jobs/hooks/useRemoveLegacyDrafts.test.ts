// Testing Library
import { renderHook } from '@testing-library/react'
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
import { useRemoveLegacyDrafts } from './useRemoveLegacyDrafts'

beforeEach( () => {
  window.localStorage.clear()
} )

afterEach( () => {
  vi.restoreAllMocks()
} )

describe( 'useRemoveLegacyDrafts', () => {
  it( 'removes the 0.2.0 draft keys and leaves everything else', () => {
    window.localStorage.setItem( 'mnemosyne:draft:a', '{}' )
    window.localStorage.setItem( 'mnemosyne:draft:b', '{}' )
    window.localStorage.setItem( 'theme', 'dark' )

    renderHook( () => useRemoveLegacyDrafts() )

    expect( window.localStorage.getItem( 'mnemosyne:draft:a' ) ).toBeNull()
    expect( window.localStorage.getItem( 'mnemosyne:draft:b' ) ).toBeNull()
    expect( window.localStorage.getItem( 'theme' ) ).toBe( 'dark' )
  } )

  it( 'does nothing and does not throw when storage is blocked', () => {
    vi.spyOn( Storage.prototype, 'key' ).mockImplementation( () => {
      throw new Error( 'blocked' )
    } )
    window.localStorage.setItem( 'mnemosyne:draft:a', '{}' )

    expect( () => renderHook( () => useRemoveLegacyDrafts() ) ).not.toThrow()
  } )
} )
