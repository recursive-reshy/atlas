// Testing Library
import { screen, within } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { jobFixture } from '#src/test-support/job.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { JobList } from './JobList'

const now = Date.parse( '2026-10-15T12:00:00.000Z' )
const other = '9b1f6a2e-0c7d-4f3a-8b5e-2d4c6e8f0a1b'

describe( 'JobList', () => {
  it( 'renders nothing for an empty list', () => {
    renderWithClient( <JobList jobs={ [] } now={ now } /> )

    expect( screen.queryByRole( 'list', { name: 'Jobs' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows a video or article icon with an accessible name on each row', () => {
    renderWithClient(
      <JobList
        now={ now }
        jobs={ [
          jobFixture( { title: 'A talk' } ),
          jobFixture( { id: other, title: 'A post', source_type: 'article' } ),
        ] }
      />,
    )

    const items = within( screen.getByRole( 'list', { name: 'Jobs' } ) ).getAllByRole( 'listitem' )

    expect( within( items[ 0 ] ).getByRole( 'img', { name: 'Video' } ) ).toBeInTheDocument()
    expect( within( items[ 1 ] ).getByRole( 'img', { name: 'Article' } ) ).toBeInTheDocument()
  } )

  it( 'shows the feed name on a feed job and nothing on the others', () => {
    renderWithClient(
      <JobList
        now={ now }
        jobs={ [
          jobFixture( { title: 'A post', feed_id: other, feed_name: 'Example Blog' } ),
          jobFixture( { id: other, title: 'A talk' } ),
        ] }
      />,
    )

    const items = within( screen.getByRole( 'list', { name: 'Jobs' } ) ).getAllByRole( 'listitem' )

    expect( within( items[ 0 ] ).getByText( 'Example Blog' ) ).toBeInTheDocument()
    expect( within( items[ 1 ] ).queryByTestId( 'RssFeedIcon' ) ).not.toBeInTheDocument()
  } )

  it( 'shows the Gmail source name and a mail icon on a newsletter job only', () => {
    renderWithClient(
      <JobList
        now={ now }
        jobs={ [
          jobFixture( {
            title: 'An email',
            source_type: 'article',
            gmail_source_id: other,
            gmail_source_name: 'Substacks',
          } ),
          jobFixture( { id: other, title: 'A talk' } ),
        ] }
      />,
    )

    const items = within( screen.getByRole( 'list', { name: 'Jobs' } ) ).getAllByRole( 'listitem' )

    expect( within( items[ 0 ] ).getByText( 'Substacks' ) ).toBeInTheDocument()
    expect( within( items[ 0 ] ).getByTestId( 'MailOutlinedIcon' ) ).toBeInTheDocument()
    expect( within( items[ 0 ] ).queryByTestId( 'RssFeedIcon' ) ).not.toBeInTheDocument()
    expect( within( items[ 1 ] ).queryByTestId( 'MailOutlinedIcon' ) ).not.toBeInTheDocument()
  } )

  it( 'lists each job with its title, status and a link to the job', () => {
    renderWithClient(
      <JobList
        now={ now }
        jobs={ [
          jobFixture( { title: 'How Rust Works', status: 'ready_for_review' } ),
          jobFixture( { id: other, title: null, url: 'https://example.com/v', status: 'queued' } ),
        ] }
      />,
    )

    const items = within( screen.getByRole( 'list', { name: 'Jobs' } ) ).getAllByRole( 'listitem' )

    expect( items ).toHaveLength( 2 )
    expect( within( items[ 0 ] ).getByRole( 'link', { name: 'How Rust Works' } ) )
      .toHaveAttribute( 'href', `/jobs/${ jobFixture().id }` )
    expect( items[ 0 ] ).toHaveTextContent( 'Ready for review' )
    expect( within( items[ 1 ] ).getByRole( 'link', { name: 'https://example.com/v' } ) )
      .toHaveAttribute( 'href', `/jobs/${ other }` )
    expect( items[ 1 ] ).toHaveTextContent( 'Queued' )
  } )

  it.each( [
    [ 'queued', 'Queued' ],
    [ 'fetching', 'Fetching' ],
    [ 'transcribing', 'Transcribing' ],
    [ 'summarizing', 'Summarizing' ],
    [ 'ready_for_review', 'Ready for review' ],
    [ 'summary_failed', 'Summary failed' ],
  ] as const )( 'labels %s as "%s"', ( status, label ) => {
    renderWithClient( <JobList jobs={ [ jobFixture( { status } ) ] } now={ now } /> )

    expect( screen.getByRole( 'listitem' ) ).toHaveTextContent( label )
  } )

  it( 'shows the time left on review and failed-summary jobs only', () => {
    const expiresAt = new Date( now + 5 * 3_600_000 ).toISOString()

    renderWithClient(
      <JobList
        now={ now }
        jobs={ [
          jobFixture( { status: 'ready_for_review', expires_at: expiresAt } ),
          jobFixture( { id: other, status: 'transcribing', expires_at: null } ),
        ] }
      />,
    )

    const items = screen.getAllByRole( 'listitem' )

    expect( items[ 0 ] ).toHaveTextContent( 'expires in 5h' )
    expect( items[ 1 ] ).not.toHaveTextContent( 'expires' )
  } )
} )
