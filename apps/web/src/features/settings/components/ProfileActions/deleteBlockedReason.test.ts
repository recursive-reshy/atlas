// Vitest
import { describe, expect, it } from 'vitest'
// App
import { deleteBlockedReason } from './deleteBlockedReason'

describe( 'deleteBlockedReason', () => {
  it( 'is null for an ordinary profile', () => {
    expect( deleteBlockedReason( 'a', 'b', 3 ) ).toBeNull()
  } )

  it( 'explains that the default profile cannot be deleted', () => {
    expect( deleteBlockedReason( 'a', 'a', 3 ) ).toMatch( /default profile/ )
  } )

  it( 'explains that the last remaining profile cannot be deleted', () => {
    expect( deleteBlockedReason( 'a', 'b', 1 ) ).toMatch( /last remaining profile/ )
  } )

  it( 'prefers the default-profile reason when both apply', () => {
    expect( deleteBlockedReason( 'a', 'a', 1 ) ).toMatch( /default profile/ )
  } )
} )
