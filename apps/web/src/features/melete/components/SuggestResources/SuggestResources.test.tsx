// Testing Library
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useSuggestResources } from '#src/features/melete/hooks/useSuggestResources'
import { NARROWING_ID, suggestionsFixture } from '#src/features/melete/fixtures/gaps.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SuggestResources } from './SuggestResources'

vi.mock( '#src/features/melete/hooks/useSuggestResources' )

const mutate = vi.fn()

const show = ( overrides = {} ): void => {
  vi.mocked( useSuggestResources ).mockReturnValue( mutationStub( { mutate, ...overrides } ) )
}

const setup = () => {
  renderWithClient( <SuggestResources conceptId={ NARROWING_ID } conceptName="Narrowing" /> )

  return userEvent.setup()
}

beforeEach( () => {
  mutate.mockReset()
  show()
} )

describe( 'SuggestResources', () => {
  it( 'asks for resources for its concept', async () => {
    const user = setup()

    await user.click( screen.getByRole( 'button', { name: 'Suggest resources for Narrowing' } ) )

    expect( mutate ).toHaveBeenCalledWith( NARROWING_ID )
  } )

  it( 'says it is asking, and keeps the button off, while waiting', () => {
    show( { isPending: true } )
    setup()

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Asking Claude' )
    expect( screen.getByRole( 'button', { name: 'Suggest resources for Narrowing' } ) )
      .toBeDisabled()
  } )

  it( 'lists each suggestion with who made it, its kind and why it fits', () => {
    show( { isSuccess: true, data: suggestionsFixture() } )
    setup()

    const items = screen.getAllByRole( 'listitem' )

    expect( items ).toHaveLength( 3 )
    expect( items[ 0 ] ).toHaveTextContent( 'Effective TypeScript' )
    expect( items[ 0 ] ).toHaveTextContent( 'Dan Vanderkam' )
    expect( items[ 0 ] ).toHaveTextContent( 'Book' )
    expect( items[ 0 ] ).toHaveTextContent( 'Short, practical items on unions and narrowing.' )
  } )

  it( 'turns each query into a search that opens in a new tab: YouTube for videos', () => {
    show( { isSuccess: true, data: suggestionsFixture() } )
    setup()

    const [ book, docs, video ] = screen.getAllByRole( 'listitem' )
      .map( ( item ) => within( item ).getByRole( 'link' ) )

    expect( book ).toHaveAttribute( 'href', 'https://www.google.com/search?q=effective%20typescript%20book' )
    expect( docs ).toHaveAttribute( 'href', expect.stringContaining( 'https://www.google.com/search?q=' ) )
    expect( video ).toHaveAttribute(
      'href',
      'https://www.youtube.com/results?search_query=matt%20pocock%20unions%20typescript',
    )

    for( const link of [ book, docs, video ] ) {
      expect( link ).toHaveAttribute( 'target', '_blank' )
      expect( link ).toHaveAttribute( 'rel', 'noopener noreferrer' )
    }
  } )

  it( 'names each search link after the suggestion', () => {
    show( { isSuccess: true, data: suggestionsFixture() } )
    setup()

    expect( screen.getByRole( 'link', { name: 'Search for Effective TypeScript' } ) )
      .toBeInTheDocument()
  } )

  it( 'shows no address of its own, only the search links', () => {
    show( { isSuccess: true, data: suggestionsFixture() } )
    setup()

    expect( screen.queryByText( /https?:\/\// ) ).not.toBeInTheDocument()
  } )

  it( 'shows the error, and lets the user ask again', async () => {
    show( { isError: true, error: new Error( 'Overloaded' ) } )

    const user = setup()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Overloaded' )

    await user.click( screen.getByRole( 'button', { name: 'Suggest resources for Narrowing' } ) )

    expect( mutate ).toHaveBeenCalledTimes( 1 )
  } )
} )
