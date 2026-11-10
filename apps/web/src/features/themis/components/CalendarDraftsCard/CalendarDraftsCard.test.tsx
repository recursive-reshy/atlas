// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CalendarDraftsCard } from './CalendarDraftsCard'

describe( 'CalendarDraftsCard', () => {
  it( 'says how many drafts wait and links to the review page', () => {
    renderWithClient( <CalendarDraftsCard drafts={ 3 } status="connected" /> )

    expect( screen.getByRole( 'link', { name: '3 calendar drafts to review' } ) )
      .toHaveAttribute( 'href', '/themis/calendar' )
  } )

  it( 'uses the singular for one draft', () => {
    renderWithClient( <CalendarDraftsCard drafts={ 1 } status="connected" /> )

    expect( screen.getByRole( 'link', { name: '1 calendar draft to review' } ) )
      .toBeInTheDocument()
  } )

  it( 'still shows drafts when the connection is broken, because they can be reviewed', () => {
    renderWithClient( <CalendarDraftsCard drafts={ 2 } status="broken" /> )

    expect( screen.getByRole( 'link', { name: '2 calendar drafts to review' } ) )
      .toBeInTheDocument()
  } )

  it( 'is hidden at zero', () => {
    renderWithClient( <CalendarDraftsCard drafts={ 0 } status="connected" /> )

    expect( screen.queryByRole( 'link' ) ).not.toBeInTheDocument()
  } )

  it.each( [ 'not_configured', 'not_connected' ] as const )( 'is hidden when %s', ( status ) => {
    renderWithClient( <CalendarDraftsCard drafts={ 4 } status={ status } /> )

    expect( screen.queryByRole( 'link' ) ).not.toBeInTheDocument()
  } )
} )
