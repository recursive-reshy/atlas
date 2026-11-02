// Testing Library
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type { StoredLinkSuggestion } from '@atlas/shared'
// App
import { linkSuggestionFixture } from '#src/test-support/linkSuggestion.fixture'
import { LinkSuggestionsPanel } from './LinkSuggestionsPanel'

const NOTE = '---\ntitle: Pricing\n---\n\nThe pricing strategy matters most for startups.\n'

const ID_B = '5a1e0b7c-2d4f-4a6e-8b9c-0d1e2f3a4b02'
const ID_C = '5a1e0b7c-2d4f-4a6e-8b9c-0d1e2f3a4b03'

interface SetupOptions {
  suggestions?: StoredLinkSuggestion[]
  note?: string
  isBusy?: boolean
  error?: string | null
}

const setup = ( {
  suggestions = [ linkSuggestionFixture() ],
  note = NOTE,
  isBusy = false,
  error = null,
}: SetupOptions = {} ) => {
  const onAccept = vi.fn()
  const onReject = vi.fn()
  const onAcceptAll = vi.fn()
  const onRejectAll = vi.fn()

  render(
    <LinkSuggestionsPanel
      suggestions={ suggestions }
      note={ note }
      isBusy={ isBusy }
      error={ error }
      onAccept={ onAccept }
      onReject={ onReject }
      onAcceptAll={ onAcceptAll }
      onRejectAll={ onRejectAll }
    />,
  )

  return {
    onAccept,
    onReject,
    onAcceptAll,
    onRejectAll,
    user: userEvent.setup(),
  }
}

describe( 'LinkSuggestionsPanel', () => {
  it( 'shows the target, kind, anchor placement and reason of a suggestion', () => {
    setup()

    expect( screen.getByText( '[[Pricing Strategy]]' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Existing note' ) ).toBeInTheDocument()
    expect( screen.getByText( 'at "pricing strategy"' ) ).toBeInTheDocument()
    expect( screen.getByText( 'The note is about how to price a product.' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Accept' } ) ).toBeEnabled()
    expect( screen.getByRole( 'button', { name: 'Reject' } ) ).toBeEnabled()
  } )

  it.each( [
    [ 'existing_note', 'Existing note' ],
    [ 'existing_concept', 'Existing concept' ],
    [ 'new_concept', 'New concept' ],
  ] as const )( 'labels the %s kind', ( kind, label ) => {
    setup( { suggestions: [ linkSuggestionFixture( { kind } ) ] } )

    expect( screen.getByText( label ) ).toBeInTheDocument()
  } )

  it( 'lists the suggestions in position order', () => {
    setup( {
      suggestions: [
        linkSuggestionFixture( { id: ID_C, position: 2, target: 'Third', anchor: null } ),
        linkSuggestionFixture( { position: 0, target: 'First' } ),
        linkSuggestionFixture( { id: ID_B, position: 1, target: 'Second', anchor: null } ),
      ],
    } )

    const targets = screen.getAllByText( /^\[\[/ ).map( ( element ) => element.textContent )

    expect( targets ).toEqual( [ '[[First]]', '[[Second]]', '[[Third]]' ] )
  } )

  it( 'offers Add to Related for a suggestion without an anchor', () => {
    setup( { suggestions: [ linkSuggestionFixture( { anchor: null } ) ] } )

    expect( screen.getByText( 'Related' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Add to Related' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Accept' } ) ).not.toBeInTheDocument()
    expect( screen.queryByText( 'Stale' ) ).not.toBeInTheDocument()
  } )

  it( 'marks a suggestion Stale when its anchor is no longer in the note', () => {
    setup( { note: '---\ntitle: Pricing\n---\n\nNothing about it any more.\n' } )

    expect( screen.getByText( 'Stale' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Add to Related' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Accept' } ) ).not.toBeInTheDocument()
  } )

  it( 'says so when the note already links to the target', () => {
    setup( { note: `${ NOTE }\n[[Pricing Strategy|pricing]]\n` } )

    expect( screen.getByText( 'Already linked' ) ).toBeInTheDocument()
  } )

  it( 'says nothing about links for a target the note does not link to', () => {
    setup()

    expect( screen.queryByText( 'Already linked' ) ).not.toBeInTheDocument()
  } )

  it( 'passes the suggestion to onAccept and onReject', async () => {
    const suggestion = linkSuggestionFixture()
    const { onAccept, onReject, user } = setup( { suggestions: [ suggestion ] } )

    await user.click( screen.getByRole( 'button', { name: 'Accept' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Reject' } ) )

    expect( onAccept ).toHaveBeenCalledWith( suggestion )
    expect( onReject ).toHaveBeenCalledWith( suggestion )
  } )

  it( 'collapses decided suggestions to one line without buttons', () => {
    setup( {
      suggestions: [
        linkSuggestionFixture( { status: 'accepted', target: 'Kept' } ),
        linkSuggestionFixture( { id: ID_B, position: 1, status: 'rejected', target: 'Dropped' } ),
      ],
    } )

    expect( screen.getByText( '[[Kept]]' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Accepted' ) ).toBeInTheDocument()
    expect( screen.getByText( '[[Dropped]]' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Rejected' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button' ) ).not.toBeInTheDocument()
    expect( screen.queryByText( 'The note is about how to price a product.' ) )
      .not.toBeInTheDocument()
  } )

  it( 'announces how many suggestions are pending', () => {
    setup( {
      suggestions: [
        linkSuggestionFixture(),
        linkSuggestionFixture( { id: ID_B, position: 1, status: 'pending' } ),
        linkSuggestionFixture( { id: ID_C, position: 2, status: 'accepted' } ),
      ],
    } )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( '2 pending' )
  } )

  it( 'says there are no suggestions when the list is empty', () => {
    setup( { suggestions: [] } )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'No suggested links' )
  } )

  it( 'disables the buttons while a request is running', () => {
    setup( { isBusy: true } )

    expect( screen.getByRole( 'button', { name: 'Accept' } ) ).toBeDisabled()
    expect( screen.getByRole( 'button', { name: 'Reject' } ) ).toBeDisabled()
  } )

  it( 'shows an error from a request', () => {
    setup( { error: 'Link suggestion x is not pending' } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Link suggestion x is not pending' )
  } )

  describe( 'Accept all and Reject all', () => {
    const two = (): StoredLinkSuggestion[] => [
      linkSuggestionFixture(),
      linkSuggestionFixture( { id: ID_B, position: 1, target: 'Second', anchor: null } ),
    ]

    it( 'calls onAcceptAll and onRejectAll', async () => {
      const { onAcceptAll, onRejectAll, user } = setup( { suggestions: two() } )

      await user.click( screen.getByRole( 'button', { name: 'Accept all' } ) )
      await user.click( screen.getByRole( 'button', { name: 'Reject all' } ) )

      expect( onAcceptAll ).toHaveBeenCalledOnce()
      expect( onRejectAll ).toHaveBeenCalledOnce()
    } )

    it( 'are offered only while two or more suggestions are pending', () => {
      setup( {
        suggestions: [
          linkSuggestionFixture(),
          linkSuggestionFixture( { id: ID_B, position: 1, status: 'accepted' } ),
        ],
      } )

      expect( screen.queryByRole( 'button', { name: 'Accept all' } ) ).not.toBeInTheDocument()
      expect( screen.queryByRole( 'button', { name: 'Reject all' } ) ).not.toBeInTheDocument()
    } )

    it( 'are disabled while a request is running', () => {
      setup( { suggestions: two(), isBusy: true } )

      expect( screen.getByRole( 'button', { name: 'Accept all' } ) ).toBeDisabled()
      expect( screen.getByRole( 'button', { name: 'Reject all' } ) ).toBeDisabled()
    } )
  } )
} )
