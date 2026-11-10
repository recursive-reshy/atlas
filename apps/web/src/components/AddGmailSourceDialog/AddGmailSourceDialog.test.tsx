// Testing Library
import { screen } from '@testing-library/react'
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
import { ApiError } from '#src/lib/apiError'
import { listGmailLabels } from '#src/api/gmail.api'
import { previewGmailSource } from '#src/api/gmailSources.api'
import { gmailLabelFixture, gmailPreviewFixture } from '#src/test-support/gmail.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CODING_ID, profilesFixture } from '#src/test-support/summarizer.fixture'
import { AddGmailSourceDialog } from './AddGmailSourceDialog'

vi.mock( '#src/api/gmail.api' )
vi.mock( '#src/api/gmailSources.api' )

const mockedPreview = vi.mocked( previewGmailSource )

const setup = ( overrides: Partial< Parameters< typeof AddGmailSourceDialog >[ 0 ] > = {} ) => {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()

  renderWithClient(
    <AddGmailSourceDialog
      profiles={ profilesFixture() }
      isSubmitting={ false }
      error={ null }
      onSubmit={ onSubmit }
      onCancel={ onCancel }
      { ...overrides }
    />,
  )

  return { onSubmit, onCancel }
}

const search = async ( query = 'from:news@example.com' ): Promise< void > => {
  await userEvent.click( screen.getByRole( 'button', { name: 'Search' } ) )
  await userEvent.type( screen.getByRole( 'textbox', { name: 'Gmail search' } ), query )
}

const preview = async (): Promise< void > => {
  await userEvent.click( screen.getByRole( 'button', { name: 'Preview' } ) )
  await screen.findByText( /This week in tech/ )
}

beforeEach( () => {
  vi.mocked( listGmailLabels ).mockReset()
  vi.mocked( listGmailLabels ).mockResolvedValue( [
    gmailLabelFixture( { id: 'Label_1', name: 'Newsletters' } ),
  ] )
  mockedPreview.mockReset()
  mockedPreview.mockResolvedValue( gmailPreviewFixture() )
} )

describe( 'AddGmailSourceDialog', () => {
  it( 'is a dialog titled Add Gmail source, and Cancel closes it', async () => {
    const { onCancel } = setup()

    expect( screen.getByRole( 'dialog', { name: 'Add Gmail source' } ) ).toBeInTheDocument()

    await userEvent.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'starts as a newsletter source matching by labels', () => {
    setup()

    expect( screen.getByRole( 'combobox', { name: 'Labels' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'combobox', { name: 'Backfill' } ) )
      .toHaveTextContent( 'Last 30 days' )
  } )

  it( 'cannot be added, or previewed, before there is a match', () => {
    setup()

    expect( screen.getByRole( 'button', { name: 'Preview' } ) ).toBeDisabled()
    expect( screen.getByRole( 'button', { name: 'Add' } ) ).toBeDisabled()
  } )

  describe( 'previewing', () => {
    it( 'runs the search and shows the count and the newest email', async () => {
      setup()
      await search()
      await preview()

      expect( mockedPreview ).toHaveBeenCalledWith(
        { kind: 'query', query: 'from:news@example.com' },
      )
      expect( screen.getByText( '12 emails match' ) ).toBeInTheDocument()
      expect( screen.getByText( /This week in tech/ ) ).toBeInTheDocument()
      expect( screen.getByText( /Lenny/ ) ).toBeInTheDocument()
    } )

    it( 'runs a label match', async () => {
      setup()
      await userEvent.click( screen.getByRole( 'combobox', { name: 'Labels' } ) )
      await userEvent.click( await screen.findByRole( 'option', { name: 'Newsletters' } ) )
      await userEvent.click( screen.getByRole( 'button', { name: 'Preview' } ) )

      expect( mockedPreview ).toHaveBeenCalledWith( { kind: 'labels', label_ids: [ 'Label_1' ] } )
    } )

    it( 'says 500+ when the count is capped, and 1 email for one', async () => {
      mockedPreview.mockResolvedValue( gmailPreviewFixture( { count: 500, count_capped: true } ) )
      setup()
      await search()
      await preview()

      expect( screen.getByText( '500+ emails match' ) ).toBeInTheDocument()
    } )

    it( 'warns about a match with no emails, and still allows adding it', async () => {
      mockedPreview.mockResolvedValue( gmailPreviewFixture( { count: 0, newest: null } ) )
      setup()
      await userEvent.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'Mine' )
      await search()
      await userEvent.click( screen.getByRole( 'button', { name: 'Preview' } ) )

      expect( await screen.findByText( /No emails match this yet/ ) ).toBeInTheDocument()
      expect( screen.getByRole( 'button', { name: 'Add' } ) ).toBeEnabled()
    } )

    it( 'warns about the sources it overlaps', async () => {
      mockedPreview.mockResolvedValue( gmailPreviewFixture( { overlaps: [
        { id: '2c0a6b6e-5b1f-4a53-8a86-0f3f5a7c9d11', name: 'Upwork alerts' },
        { id: '3c0a6b6e-5b1f-4a53-8a86-0f3f5a7c9d11', name: 'Old rule' },
      ] } ) )
      setup()
      await search()
      await preview()

      expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Upwork alerts, Old rule' )
    } )

    it( 'shows why a preview failed', async () => {
      mockedPreview.mockRejectedValue( new ApiError( 'Gmail needs to be reconnected', 409 ) )
      setup()
      await search()
      await userEvent.click( screen.getByRole( 'button', { name: 'Preview' } ) )

      expect( await screen.findByText( 'Gmail needs to be reconnected' ) ).toBeInTheDocument()
    } )

    it( 'forgets the preview when the match changes', async () => {
      setup()
      await userEvent.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'Mine' )
      await search()
      await preview()

      expect( screen.getByRole( 'button', { name: 'Add' } ) ).toBeEnabled()

      await userEvent.type( screen.getByRole( 'textbox', { name: 'Gmail search' } ), ' more' )

      expect( screen.queryByText( '12 emails match' ) ).not.toBeInTheDocument()
      expect( screen.getByRole( 'button', { name: 'Add' } ) ).toBeDisabled()
    } )

    it( 'keeps the preview when only the name changes', async () => {
      setup()
      await search()
      await preview()
      await userEvent.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'Mine' )

      expect( screen.getByText( '12 emails match' ) ).toBeInTheDocument()
    } )
  } )

  describe( 'what happens to the emails', () => {
    it.each( [
      [ 'None', /Only the newest email will go to your inbox/ ],
      [ 'Last 30 days', /last 30 days.*up to 200.*inbox/i ],
      [ 'Last 90 days', /last 90 days.*up to 200.*inbox/i ],
      [ 'All', /newest 200.*inbox/i ],
    ] )( 'with backfill %s says what goes to the inbox', async ( choice, text ) => {
      setup()
      await search()
      await userEvent.click( screen.getByRole( 'combobox', { name: 'Backfill' } ) )
      await userEvent.click( screen.getByRole( 'option', { name: choice } ) )
      await preview()

      expect( screen.getByText( text ) ).toBeInTheDocument()
    } )
  } )

  describe( 'destination', () => {
    it( 'has no destination choice and always shows the newsletter options', () => {
      setup()

      expect( screen.queryByRole( 'radio', { name: 'Newsletter' } ) ).not.toBeInTheDocument()
      expect( screen.queryByRole( 'radio', { name: 'Freelance jobs' } ) ).not.toBeInTheDocument()
      expect( screen.getByRole( 'checkbox', { name: 'Summarize automatically' } ) )
        .toBeInTheDocument()
      expect( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) ).toBeInTheDocument()
      expect( screen.getByRole( 'combobox', { name: 'Backfill' } ) ).toBeInTheDocument()
    } )
  } )

  describe( 'adding', () => {
    const fillAndPreview = async ( name = 'Substacks' ): Promise< void > => {
      await userEvent.type( screen.getByRole( 'textbox', { name: 'Name' } ), name )
      await search()
      await preview()
    }

    it( 'sends a newsletter source with the default backfill', async () => {
      const { onSubmit } = setup()

      await fillAndPreview()
      await userEvent.click( screen.getByRole( 'button', { name: 'Add' } ) )

      expect( onSubmit ).toHaveBeenCalledWith( {
        name: 'Substacks',
        match: { kind: 'query', query: 'from:news@example.com' },
        destination: 'newsletter',
        backfill: '30d',
      } )
    } )

    it( 'sends the profile, auto-summarize and backfill choices', async () => {
      const { onSubmit } = setup()

      await userEvent.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
      await userEvent.click( screen.getByRole( 'option', { name: 'Coding' } ) )
      await userEvent.click( screen.getByRole( 'checkbox', { name: 'Summarize automatically' } ) )
      await userEvent.click( screen.getByRole( 'combobox', { name: 'Backfill' } ) )
      await userEvent.click( screen.getByRole( 'option', { name: 'None' } ) )
      await fillAndPreview()
      await userEvent.click( screen.getByRole( 'button', { name: 'Add' } ) )

      expect( onSubmit ).toHaveBeenCalledWith( {
        name: 'Substacks',
        match: { kind: 'query', query: 'from:news@example.com' },
        destination: 'newsletter',
        profile_id: CODING_ID,
        auto_summarize: true,
        backfill: 'none',
      } )
    } )

    it( 'trims the name and will not add without one', async () => {
      const { onSubmit } = setup()

      await search()
      await preview()

      expect( screen.getByRole( 'button', { name: 'Add' } ) ).toBeDisabled()

      await userEvent.type( screen.getByRole( 'textbox', { name: 'Name' } ), '  Padded  ' )
      await userEvent.click( screen.getByRole( 'button', { name: 'Add' } ) )

      expect( onSubmit ).toHaveBeenCalledWith( expect.objectContaining( { name: 'Padded' } ) )
    } )

    it( 'shows Adding… while it saves, and why it failed', () => {
      setup( { isSubmitting: true, error: 'Unknown prompt profile' } )

      expect( screen.getByRole( 'button', { name: 'Adding…' } ) ).toBeDisabled()
      expect( screen.getByText( 'Unknown prompt profile' ) ).toBeInTheDocument()
    } )
  } )
} )
