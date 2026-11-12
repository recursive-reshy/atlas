// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useMe } from '#src/app/useMe'
import { meFixture } from '#src/test-support/me.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SourcesTab } from './SourcesTab'

vi.mock( '#src/features/feeds/components/FeedSettings', () => (
  { FeedSettings: () => <p>feeds</p> }
) )
vi.mock( '#src/features/gmail/components/GmailSettings', () => (
  { GmailSettings: () => <p>gmail</p> }
) )
vi.mock( '#src/app/useMe' )
vi.mock( '../CalendarSettings', () => (
  { CalendarSettings: () => <p>calendar</p> }
) )
vi.mock( '#src/features/status/components/StatusPanel', () => (
  { StatusPanel: () => <p>status</p> }
) )

describe( 'SourcesTab', () => {
  beforeEach( () => signedInWith( { modules: [ 'transcriber' ] } ) )

  it( 'has the feeds and the Gmail sections', () => {
    renderWithClient( <SourcesTab /> )

    expect( screen.getByText( 'feeds' ) ).toBeInTheDocument()
    expect( screen.getByText( 'gmail' ) ).toBeInTheDocument()
  } )

  it( 'starts with the Status panel, before the feeds and Gmail sections', () => {
    renderWithClient( <SourcesTab /> )

    const order = [ 'status', 'feeds', 'gmail' ].map( ( text ) => screen.getByText( text ) )

    expect( order[ 0 ]?.compareDocumentPosition( order[ 1 ] as Node ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
    expect( order[ 1 ]?.compareDocumentPosition( order[ 2 ] as Node ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
  } )
} )

const signedInWith = ( modules: Parameters< typeof meFixture >[ 0 ] ): void => {
  vi.mocked( useMe ).mockReturnValue( { me: meFixture( modules ), isLoading: false, error: null } )
}

describe( 'SourcesTab, Calendar', () => {
  it( 'has the Calendar section after Gmail for a user with Themis', () => {
    signedInWith( { modules: [ 'transcriber', 'themis' ] } )
    renderWithClient( <SourcesTab /> )

    expect( screen.getByText( 'gmail' ).compareDocumentPosition( screen.getByText( 'calendar' ) ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
  } )

  it( 'leaves it out for a user without Themis', () => {
    signedInWith( { modules: [ 'transcriber' ] } )
    renderWithClient( <SourcesTab /> )

    expect( screen.queryByText( 'calendar' ) ).not.toBeInTheDocument()
  } )
} )
