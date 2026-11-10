// Testing Library
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CODING_ID, profilesFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { GmailNewsletterFields } from './GmailNewsletterFields'

const setup = ( overrides: Partial< Parameters< typeof GmailNewsletterFields >[ 0 ] > = {} ) => {
  const onProfileChange = vi.fn()
  const onAutoSummarizeChange = vi.fn()
  const onBackfillChange = vi.fn()

  renderWithClient(
    <GmailNewsletterFields
      profileId=""
      autoSummarize={ false }
      profiles={ profilesFixture() }
      onProfileChange={ onProfileChange }
      onAutoSummarizeChange={ onAutoSummarizeChange }
      { ...overrides }
    />,
  )

  return { onProfileChange, onAutoSummarizeChange, onBackfillChange }
}

describe( 'GmailNewsletterFields', () => {
  it( 'offers the default profile and the others, and picks one', async () => {
    const { onProfileChange } = setup()

    await userEvent.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )

    expect( within( screen.getByRole( 'listbox' ) ).getAllByRole( 'option' )[ 0 ] )
      .toHaveTextContent( 'Default profile' )

    await userEvent.click( screen.getByRole( 'option', { name: 'Coding' } ) )

    expect( onProfileChange ).toHaveBeenCalledWith( CODING_ID )
  } )

  it( 'shows the chosen profile, and the default for a profile that is gone', () => {
    setup( { profileId: CODING_ID } )

    expect( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
      .toHaveTextContent( 'Coding' )
  } )

  it( 'toggles Summarize automatically', async () => {
    const { onAutoSummarizeChange } = setup()

    await userEvent.click( screen.getByRole( 'checkbox', { name: 'Summarize automatically' } ) )

    expect( onAutoSummarizeChange ).toHaveBeenCalledWith( true )
  } )

  it( 'has no backfill choice unless it is given one', () => {
    setup()

    expect( screen.queryByRole( 'combobox', { name: 'Backfill' } ) ).not.toBeInTheDocument()
  } )

  it( 'offers the four backfill choices and picks one', async () => {
    const onBackfillChange = vi.fn()

    setup( { backfill: '30d', onBackfillChange } )

    expect( screen.getByRole( 'combobox', { name: 'Backfill' } ) )
      .toHaveTextContent( 'Last 30 days' )

    await userEvent.click( screen.getByRole( 'combobox', { name: 'Backfill' } ) )

    expect( screen.getAllByRole( 'option' ).map( ( option ) => option.textContent ) )
      .toEqual( [ 'None', 'Last 30 days', 'Last 90 days', 'All' ] )

    await userEvent.click( screen.getByRole( 'option', { name: 'All' } ) )

    expect( onBackfillChange ).toHaveBeenCalledWith( 'all' )
  } )
} )
