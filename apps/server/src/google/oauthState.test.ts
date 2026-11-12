import {
  afterEach, describe, expect, it, vi, 
} from 'vitest'
import { createOAuthStateStore } from './oauthState.js'

describe( 'createOAuthStateStore', () => {
  afterEach( () => {
    vi.useRealTimers()
  } )

  it( 'gives each call its own 64-hex state', () => {
    const store = createOAuthStateStore()
    const first = store.create( 'user-1', 'http://localhost' )

    expect( first ).toMatch( /^[0-9a-f]{64}$/ )
    expect( store.create( 'user-1', 'http://localhost' ) ).not.toBe( first )
  } )

  it( 'returns the origin for the user who asked', () => {
    const store = createOAuthStateStore()
    const state = store.create( 'user-1', 'https://atlas.example' )

    expect( store.consume( 'user-1', state ) ).toEqual( { origin: 'https://atlas.example' } )
  } )

  it( 'refuses an unknown state', () => {
    expect( createOAuthStateStore().consume( 'user-1', 'f'.repeat( 64 ) ) ).toBeUndefined()
  } )

  it( 'refuses another user\'s state, and spends it', () => {
    const store = createOAuthStateStore()
    const state = store.create( 'user-1', 'http://localhost' )

    expect( store.consume( 'user-2', state ) ).toBeUndefined()
    expect( store.consume( 'user-1', state ) ).toBeUndefined()
  } )

  it( 'is single use', () => {
    const store = createOAuthStateStore()
    const state = store.create( 'user-1', 'http://localhost' )

    expect( store.consume( 'user-1', state ) ).toBeDefined()
    expect( store.consume( 'user-1', state ) ).toBeUndefined()
  } )

  it( 'refuses a state after ten minutes and accepts one just inside', () => {
    vi.useFakeTimers()

    const store = createOAuthStateStore()
    const late = store.create( 'user-1', 'http://localhost' )
    const inside = store.create( 'user-1', 'http://localhost' )

    vi.advanceTimersByTime( 10 * 60 * 1000 - 1 )
    expect( store.consume( 'user-1', inside ) ).toBeDefined()
    vi.advanceTimersByTime( 2 )
    expect( store.consume( 'user-1', late ) ).toBeUndefined()
  } )

  it( 'drops the oldest state beyond twenty outstanding', () => {
    const store = createOAuthStateStore()
    const oldest = store.create( 'user-1', 'http://localhost' )

    for( let i = 0; i < 20; i++ ) {
      store.create( 'user-1', 'http://localhost' )
    }

    expect( store.consume( 'user-1', oldest ) ).toBeUndefined()
  } )

  it( 'keeps stores apart', () => {
    const one = createOAuthStateStore()
    const two = createOAuthStateStore()
    const state = one.create( 'user-1', 'http://localhost' )

    expect( two.consume( 'user-1', state ) ).toBeUndefined()
  } )
} )
