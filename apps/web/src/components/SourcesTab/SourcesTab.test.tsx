// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SourcesTab } from './SourcesTab'

vi.mock( '#src/features/feeds/components/FeedSettings', () => (
  { FeedSettings: () => <p>feeds</p> }
) )
vi.mock( '../GmailSettings', () => ( { GmailSettings: () => <p>gmail</p> } ) )
vi.mock( '../StatusPanel', () => ( { StatusPanel: () => <p>status</p> } ) )

describe( 'SourcesTab', () => {
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
