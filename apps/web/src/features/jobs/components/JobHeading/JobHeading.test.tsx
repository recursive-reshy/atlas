// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { JobHeading } from './JobHeading'

describe( 'JobHeading', () => {
  it( 'shows the title as a heading', () => {
    renderWithClient( <JobHeading title="A post" feedName={ null } gmailSourceName={ null } /> )

    expect( screen.getByRole( 'heading', { level: 2, name: 'A post' } ) ).toBeInTheDocument()
    expect( screen.queryByTestId( 'RssFeedIcon' ) ).not.toBeInTheDocument()
  } )

  it( 'adds the feed name beside it for a feed job, outside the heading', () => {
    renderWithClient(
      <JobHeading title="A post" feedName="Example Blog" gmailSourceName={ null } />,
    )

    expect( screen.getByRole( 'heading', { name: 'A post' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'Example Blog' ) ).toBeInTheDocument()
    expect( screen.queryByTestId( 'MailOutlinedIcon' ) ).not.toBeInTheDocument()
  } )

  it( 'adds the Gmail source name beside it for a newsletter job', () => {
    renderWithClient(
      <JobHeading title="An email" feedName={ null } gmailSourceName="Substacks" />,
    )

    expect( screen.getByRole( 'heading', { name: 'An email' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'Substacks' ) ).toBeInTheDocument()
    expect( screen.getByTestId( 'MailOutlinedIcon' ) ).toBeInTheDocument()
    expect( screen.queryByTestId( 'RssFeedIcon' ) ).not.toBeInTheDocument()
  } )
} )
