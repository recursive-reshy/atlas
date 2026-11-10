// Testing Library
import { render, screen, within } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { DownloadLinks } from './DownloadLinks'

const jobId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'

describe( 'DownloadLinks', () => {
  it( 'lists the two formats in order', () => {
    render( <DownloadLinks jobId={ jobId } /> )

    const region = screen.getByRole( 'region', { name: 'Download transcript' } )
    const links = within( region ).getAllByRole( 'link' )

    expect( links.map( ( link ) => link.textContent ) ).toEqual( [
      'Markdown (.md)',
      'Plain text (.txt)',
    ] )
  } )

  it.each( [
    [ 'Markdown (.md)', 'md' ],
    [ 'Plain text (.txt)', 'txt' ],
  ] )( 'links %s to the %s download', ( label, format ) => {
    render( <DownloadLinks jobId={ jobId } /> )

    const link = screen.getByRole( 'link', { name: label } )

    expect( link ).toHaveAttribute( 'href', `/api/jobs/${ jobId }/download?format=${ format }` )
    expect( link ).toHaveAttribute( 'download' )
  } )

  it( 'encodes the job id', () => {
    render( <DownloadLinks jobId="a/b" /> )

    expect( screen.getByRole( 'link', { name: 'Markdown (.md)' } ) )
      .toHaveAttribute( 'href', '/api/jobs/a%2Fb/download?format=md' )
  } )
} )

describe( 'DownloadLinks for an article', () => {
  it( 'offers Markdown only, in a region named for the article', () => {
    render( <DownloadLinks jobId={ jobId } sourceType="article" /> )

    const region = screen.getByRole( 'region', { name: 'Download article' } )
    const links = within( region ).getAllByRole( 'link' )

    expect( links.map( ( link ) => link.textContent ) ).toEqual( [ 'Markdown (.md)' ] )
    expect( links[ 0 ] ).toHaveAttribute( 'href', `/api/jobs/${ jobId }/download?format=md` )
  } )

  it( 'still offers both formats for a video', () => {
    render( <DownloadLinks jobId={ jobId } sourceType="video" /> )

    expect( screen.getAllByRole( 'link' ) ).toHaveLength( 2 )
  } )
} )
