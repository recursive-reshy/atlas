// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { homeFor } from './moduleHome'

describe( 'homeFor', () => {
  it( 'lands a user with Themis on Themis, whatever else they have', () => {
    expect( homeFor( [ 'transcriber', 'melete', 'themis' ] ) ).toBe( '/themis' )
    expect( homeFor( [ 'melete', 'themis' ] ) ).toBe( '/themis' )
    expect( homeFor( [ 'themis' ] ) ).toBe( '/themis' )
  } )

  it( 'keeps the Transcriber first for a user without Themis', () => {
    expect( homeFor( [ 'transcriber', 'melete' ] ) ).toBe( '/' )
    expect( homeFor( [ 'transcriber' ] ) ).toBe( '/' )
  } )

  it( 'lands a Melete-only user on Melete', () => {
    expect( homeFor( [ 'melete' ] ) ).toBe( '/melete' )
  } )

  it( 'falls back to / with no module', () => {
    expect( homeFor( [] ) ).toBe( '/' )
  } )
} )
