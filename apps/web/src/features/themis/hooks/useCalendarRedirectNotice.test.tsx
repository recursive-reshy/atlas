// React
import type { ReactElement, ReactNode } from 'react'
// Packages
import { MemoryRouter, useLocation } from 'react-router'
// Testing Library
import { act, renderHook } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { useCalendarRedirectNotice } from './useCalendarRedirectNotice'

const setup = ( route: string ) => {
  const wrapper = ( { children }: { children: ReactNode } ): ReactElement => (
    <MemoryRouter initialEntries={ [ route ] }>{ children }</MemoryRouter>
  )

  return renderHook(
    () => ( { ...useCalendarRedirectNotice(), location: useLocation() } ),
    { wrapper },
  )
}

describe( 'useCalendarRedirectNotice', () => {
  it( 'has no notice without a calendar query', () => {
    const { result } = setup( '/settings/sources' )

    expect( result.current.notice ).toBeNull()
  } )

  it( 'asks to choose a calendar after consent and removes the query', () => {
    const { result } = setup( '/settings/sources?calendar=choose' )

    expect( result.current.notice?.severity ).toBe( 'success' )
    expect( result.current.notice?.message ).toContain( 'Choose a calendar' )
    expect( result.current.location.pathname ).toBe( '/settings/sources' )
    expect( result.current.location.search ).toBe( '' )
  } )

  it.each( [
    [ 'denied', 'Google didn\'t grant access' ],
    [ 'state', 'The connection request expired' ],
    [ 'no_refresh_token', 'Google didn\'t return a long-lived access' ],
    [ 'scope', 'Calendar access wasn\'t granted' ],
    [ 'failed', 'Connecting Google Calendar failed' ],
    [ 'something_new', 'Connecting Google Calendar failed' ],
  ] )( 'shows an error for reason %s', ( reason, text ) => {
    const { result } = setup( `/settings/sources?calendar=error&reason=${ reason }` )

    expect( result.current.notice?.severity ).toBe( 'error' )
    expect( result.current.notice?.message ).toContain( text )
    expect( result.current.location.search ).toBe( '' )
  } )

  it( 'keeps other query parameters', () => {
    const { result } = setup( '/settings/sources?calendar=choose&x=1' )

    expect( result.current.location.search ).toBe( '?x=1' )
  } )

  it( 'clears the notice', () => {
    const { result } = setup( '/settings/sources?calendar=choose' )

    act( () => result.current.clear() )
    expect( result.current.notice ).toBeNull()
  } )
} )
