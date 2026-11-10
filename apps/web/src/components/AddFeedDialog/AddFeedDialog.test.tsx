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
import { previewFeed } from '#src/api/feeds.api'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CODING_ID, profilesFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { AddFeedDialog } from './AddFeedDialog'

vi.mock( '#src/api/feeds.api' )

const mockedPreview = vi.mocked( previewFeed )

const ADDRESS = 'https://blog.example.com'
const PREVIEW = {
  feed_url: 'https://blog.example.com/feed.xml',
  title: 'Example Blog',
  latest_item: { title: 'A new post', published_at: '2026-10-17T08:00:00.000Z' },
}
const URL_FIELD = { name: 'Feed or page address' }

const setup = ( overrides: Partial< Parameters< typeof AddFeedDialog >[ 0 ] > = {} ) => {
  const user = userEvent.setup()
  const handlers = { onSubmit: vi.fn(), onCancel: vi.fn() }

  renderWithClient(
    <AddFeedDialog
      profiles={ profilesFixture() }
      isSubmitting={ false }
      error={ null }
      { ...handlers }
      { ...overrides }
    />,
  )

  return { user, ...handlers }
}

const findFeed = async ( user: ReturnType< typeof userEvent.setup > ): Promise< void > => {
  await user.type( screen.getByRole( 'textbox', URL_FIELD ), ADDRESS )
  await user.click( screen.getByRole( 'button', { name: 'Find feed' } ) )
  await screen.findByRole( 'textbox', { name: 'Name' } )
}

beforeEach( () => {
  mockedPreview.mockReset()
  mockedPreview.mockResolvedValue( PREVIEW )
} )

describe( 'AddFeedDialog, finding the feed', () => {
  it( 'starts with only the address and Find feed', () => {
    setup()

    expect( screen.getByRole( 'dialog', { name: 'Add feed' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', URL_FIELD ) ).toHaveValue( '' )
    expect( screen.getByRole( 'button', { name: 'Find feed' } ) ).toBeDisabled()
    expect( screen.queryByRole( 'textbox', { name: 'Name' } ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Add' } ) ).not.toBeInTheDocument()
  } )

  it( 'looks the address up on Find feed', async () => {
    const { user } = setup()

    await findFeed( user )

    expect( mockedPreview ).toHaveBeenCalledWith( ADDRESS )
  } )

  it( 'looks the address up on Enter', async () => {
    const { user } = setup()

    await user.type( screen.getByRole( 'textbox', URL_FIELD ), `${ ADDRESS }{Enter}` )

    await screen.findByRole( 'textbox', { name: 'Name' } )
    expect( mockedPreview ).toHaveBeenCalledWith( ADDRESS )
  } )

  it( 'shows the lookup error and stays on the address step', async () => {
    mockedPreview.mockRejectedValue( new ApiError( 'No feed found at this address', 400 ) )
    const { user } = setup()

    await user.type( screen.getByRole( 'textbox', URL_FIELD ), ADDRESS )
    await user.click( screen.getByRole( 'button', { name: 'Find feed' } ) )

    expect( await screen.findByRole( 'alert' ) )
      .toHaveTextContent( 'No feed found at this address' )
    expect( screen.queryByRole( 'textbox', { name: 'Name' } ) ).not.toBeInTheDocument()
  } )

  it( 'cancels', async () => {
    const { user, onCancel } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
  } )
} )

describe( 'AddFeedDialog, adding the feed', () => {
  it( 'shows the feed\'s title, address and latest item, with the name filled in', async () => {
    const { user } = setup()

    await findFeed( user )

    expect( screen.getByText( 'https://blog.example.com/feed.xml' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Latest: A new post (2026-10-17)' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Name' } ) ).toHaveValue( 'Example Blog' )
  } )

  it( 'says when the feed has no items yet', async () => {
    mockedPreview.mockResolvedValue( { ...PREVIEW, latest_item: null } )
    const { user } = setup()

    await findFeed( user )

    expect( screen.getByText( 'No items yet' ) ).toBeInTheDocument()
  } )

  it( 'adds with only the address when nothing was changed', async () => {
    const { user, onSubmit } = setup()

    await findFeed( user )
    await user.click( screen.getByRole( 'button', { name: 'Add' } ) )

    expect( onSubmit ).toHaveBeenCalledWith( { url: ADDRESS } )
  } )

  it( 'sends a renamed feed, a chosen profile and the automatic choice', async () => {
    const { user, onSubmit } = setup()

    await findFeed( user )
    await user.clear( screen.getByRole( 'textbox', { name: 'Name' } ) )
    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'Mine' )
    await user.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Coding' } ) )
    await user.click( screen.getByRole( 'checkbox', { name: 'Summarize automatically' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Add' } ) )

    expect( onSubmit ).toHaveBeenCalledWith( {
      url: ADDRESS,
      name: 'Mine',
      profile_id: CODING_ID,
      auto_summarize: true,
    } )
  } )

  it( 'will not add a feed with an empty name', async () => {
    const { user } = setup()

    await findFeed( user )
    await user.clear( screen.getByRole( 'textbox', { name: 'Name' } ) )

    expect( screen.getByRole( 'button', { name: 'Add' } ) ).toBeDisabled()
  } )

  it( 'goes back to finding the feed when the address changes', async () => {
    const { user } = setup()

    await findFeed( user )
    await user.type( screen.getByRole( 'textbox', URL_FIELD ), '/x' )

    expect( screen.queryByRole( 'textbox', { name: 'Name' } ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Find feed' } ) ).toBeEnabled()
  } )

  it( 'shows the create error and disables Add while adding', async () => {
    const { user } = setup( { error: 'Feed already added' } )

    await findFeed( user )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Feed already added' )
  } )

  it( 'shows Adding… while the feed is being added', async () => {
    const { user } = setup( { isSubmitting: true } )

    await findFeed( user )

    expect( screen.getByRole( 'button', { name: 'Adding…' } ) ).toBeDisabled()
  } )
} )
