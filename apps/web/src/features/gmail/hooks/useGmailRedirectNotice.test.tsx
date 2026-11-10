// React
import type { ReactElement, ReactNode } from 'react'
// Packages
import { MemoryRouter, useLocation } from 'react-router'
// Testing Library
import { act, renderHook } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { useGmailRedirectNotice } from './useGmailRedirectNotice'

const setup = ( route: string ) => {
  const wrapper = ( { children }: { children: ReactNode } ): ReactElement => (
    <MemoryRouter initialEntries={ [ route ] }>{ children }</MemoryRouter>
  )

  return renderHook(
    () => ( { ...useGmailRedirectNotice(), location: useLocation() } ),
    { wrapper },
  )
}

describe( 'useGmailRedirectNotice', () => {
  it( 'has no notice without a gmail query', () => {
    const { result } = setup( '/settings' )

    expect( result.current.notice ).toBeNull()
    expect( result.current.location.search ).toBe( '' )
  } )

  it( 'shows a success notice for ?gmail=connected and removes the query', () => {
    const { result } = setup( '/settings?gmail=connected' )

    expect( result.current.notice ).toEqual( { severity: 'success', message: 'Gmail connected' } )
    expect( result.current.location.pathname ).toBe( '/settings' )
    expect( result.current.location.search ).toBe( '' )
  } )

  it.each( [
    [ 'denied', 'Google didn\'t grant access' ],
    [ 'state', 'The connection request expired' ],
    [ 'no_refresh_token', 'Google didn\'t return a long-lived access' ],
    [ 'scope', 'Read-only Gmail access wasn\'t granted' ],
    [ 'failed', 'Connecting Gmail failed' ],
    [ 'something_new', 'Connecting Gmail failed' ],
  ] )( 'shows an error notice for reason %s', ( reason, text ) => {
    const { result } = setup( `/settings?gmail=error&reason=${ reason }` )

    expect( result.current.notice?.severity ).toBe( 'error' )
    expect( result.current.notice?.message ).toContain( text )
    expect( result.current.location.search ).toBe( '' )
  } )

  it( 'shows a generic error when the reason is missing', () => {
    const { result } = setup( '/settings?gmail=error' )

    expect( result.current.notice?.message ).toContain( 'Connecting Gmail failed' )
  } )

  it( 'keeps other query parameters', () => {
    const { result } = setup( '/settings?tab=feeds&gmail=connected&reason=x' )

    expect( result.current.location.search ).toBe( '?tab=feeds' )
  } )

  it( 'ignores an unknown outcome but still removes it', () => {
    const { result } = setup( '/settings?gmail=what' )

    expect( result.current.notice ).toBeNull()
    expect( result.current.location.search ).toBe( '' )
  } )

  it( 'clears the notice', () => {
    const { result } = setup( '/settings?gmail=connected' )

    act( () => result.current.clear() )

    expect( result.current.notice ).toBeNull()
  } )
} )
