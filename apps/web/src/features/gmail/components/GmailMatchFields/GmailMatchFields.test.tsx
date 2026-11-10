// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import type { MatchDraft } from '#src/features/gmail/gmailMatch'
import { gmailLabelFixture } from '#src/features/gmail/fixtures/gmail.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { GmailMatchFields } from './GmailMatchFields'

const labels = [
  gmailLabelFixture( { id: 'Label_1', name: 'Newsletters' } ),
  gmailLabelFixture( { id: 'Label_2', name: 'Jobs' } ),
  gmailLabelFixture( { id: 'INBOX', name: 'INBOX', type: 'system' } ),
]

const labelsDraft: MatchDraft = { kind: 'labels', labelIds: [], query: '' }
const queryDraft: MatchDraft = { kind: 'query', labelIds: [], query: '' }

const setup = ( overrides: Partial< Parameters< typeof GmailMatchFields >[ 0 ] > = {} ) => {
  const onChange = vi.fn()

  renderWithClient(
    <GmailMatchFields
      draft={ labelsDraft }
      labels={ labels }
      labelsLoading={ false }
      labelsError={ null }
      onChange={ onChange }
      { ...overrides }
    />,
  )

  return { onChange }
}

describe( 'GmailMatchFields', () => {
  it( 'offers Labels and Search, with the draft\'s kind pressed', () => {
    setup()

    const pressed = ( name: string ): string | null => {
      return screen.getByRole( 'button', { name } ).getAttribute( 'aria-pressed' )
    }

    expect( pressed( 'Labels' ) ).toBe( 'true' )
    expect( pressed( 'Search' ) ).toBe( 'false' )
  } )

  it( 'switches to Search, keeping what was chosen', async () => {
    const { onChange } = setup( { draft: { kind: 'labels', labelIds: [ 'Label_1' ], query: 'x' } } )

    await userEvent.click( screen.getByRole( 'button', { name: 'Search' } ) )

    expect( onChange )
      .toHaveBeenCalledWith( { kind: 'query', labelIds: [ 'Label_1' ], query: 'x' } )
  } )

  it( 'switches back to Labels', async () => {
    const { onChange } = setup( { draft: queryDraft } )

    await userEvent.click( screen.getByRole( 'button', { name: 'Labels' } ) )

    expect( onChange ).toHaveBeenCalledWith( { ...queryDraft, kind: 'labels' } )
  } )

  describe( 'labels', () => {
    it( 'offers the Gmail labels and picks one', async () => {
      const { onChange } = setup()

      await userEvent.click( screen.getByRole( 'combobox', { name: 'Labels' } ) )

      expect( screen.getAllByRole( 'option' ).map( ( option ) => option.textContent ) )
        .toEqual( [ 'Newsletters', 'Jobs', 'INBOX' ] )

      await userEvent.click( screen.getByRole( 'option', { name: 'Jobs' } ) )

      expect( onChange ).toHaveBeenCalledWith( { ...labelsDraft, labelIds: [ 'Label_2' ] } )
    } )

    it( 'shows the chosen labels by name and removes one', async () => {
      const { onChange } = setup( {
        draft: { ...labelsDraft, labelIds: [ 'Label_1', 'Label_2' ] },
      } )

      expect( screen.getByText( 'Newsletters' ) ).toBeInTheDocument()
      expect( screen.getByText( 'Jobs' ) ).toBeInTheDocument()

      await userEvent.click( screen.getAllByTestId( 'CancelIcon' )[ 0 ] )

      expect( onChange ).toHaveBeenCalledWith( { ...labelsDraft, labelIds: [ 'Label_2' ] } )
    } )

    it( 'shows a chosen label that is no longer in Gmail by its id', () => {
      setup( { draft: { ...labelsDraft, labelIds: [ 'Label_gone' ] } } )

      expect( screen.getByText( 'Label_gone' ) ).toBeInTheDocument()
    } )

    it( 'stops offering labels at ten', async () => {
      const many = Array.from( { length: 10 }, ( _, index ) => `Label_x${ index }` )

      setup( { draft: { ...labelsDraft, labelIds: many } } )
      await userEvent.click( screen.getByRole( 'combobox', { name: 'Labels' } ) )

      expect( screen.getByRole( 'option', { name: 'Jobs' } ) ).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    } )

    it( 'says labels are loading', () => {
      setup( { labels: [], labelsLoading: true } )

      expect( screen.getByRole( 'combobox', { name: 'Labels' } ) ).toBeDisabled()
    } )

    it( 'shows why the labels could not be loaded', () => {
      setup( { labels: [], labelsError: 'Gmail needs to be reconnected' } )

      expect( screen.getByText( 'Gmail needs to be reconnected' ) ).toBeInTheDocument()
    } )
  } )

  describe( 'search', () => {
    it( 'types a query', async () => {
      const { onChange } = setup( { draft: queryDraft } )

      await userEvent.type( screen.getByRole( 'textbox', { name: 'Gmail search' } ), 'f' )

      expect( onChange ).toHaveBeenCalledWith( { ...queryDraft, query: 'f' } )
    } )

    it( 'shows the query and links to the search operators', () => {
      setup( { draft: { ...queryDraft, query: 'from:a@b.c' } } )

      expect( screen.getByRole( 'textbox', { name: 'Gmail search' } ) ).toHaveValue( 'from:a@b.c' )
      expect( screen.getByRole( 'link', { name: /search operators/i } ) )
        .toHaveAttribute( 'href', expect.stringContaining( 'support.google.com' ) as string )
    } )

    it( 'does not show the label picker', () => {
      setup( { draft: queryDraft } )

      expect( screen.queryByRole( 'combobox', { name: 'Labels' } ) ).not.toBeInTheDocument()
    } )
  } )
} )
