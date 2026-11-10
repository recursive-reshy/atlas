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
import { previewFeed } from '#src/api/feeds.api'
import { useFeeds } from '#src/hooks/useFeeds'
import { useMe } from '#src/app/useMe'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { FEED_ID, feedFixture } from '#src/test-support/feed.fixture'
import { profilesState, settingsState } from '#src/test-support/hookStates'
import { meFixture, memberFixture } from '#src/test-support/me.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { settingsFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { FeedSettings } from './FeedSettings'

vi.mock( '#src/hooks/useFeeds' )
vi.mock( '#src/app/useMe' )
vi.mock( '#src/api/feeds.api' )
vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/usePromptProfiles' )

const mockedFeeds = vi.mocked( useFeeds )
const mockedSettings = vi.mocked( useSettings )
const mockedProfiles = vi.mocked( usePromptProfiles )

type FeedsState = ReturnType< typeof useFeeds >

const feedsState = ( overrides: Partial< FeedsState > = {} ): FeedsState => ( {
  feeds: [ feedFixture() ],
  isLoading: false,
  error: null,
  updatedAt: Date.parse( '2026-10-18T10:00:00.000Z' ),
  createFeed: mutationStub(),
  updateFeed: mutationStub(),
  deleteFeed: mutationStub(),
  checkFeed: mutationStub(),
  checkAllFeeds: mutationStub(),
  ...overrides,
} )

beforeEach( () => {
  vi.mocked( useMe ).mockReturnValue( { me: meFixture(), isLoading: false, error: null } )
  mockedFeeds.mockReturnValue( feedsState() )
  mockedSettings.mockReturnValue( settingsState() )
  mockedProfiles.mockReturnValue( profilesState() )
} )

describe( 'FeedSettings', () => {
  it( 'has the Feeds heading and lists the feeds', () => {
    renderWithClient( <FeedSettings /> )

    expect( screen.getByText( 'Checked 1h ago' ) ).toBeInTheDocument()

    expect( screen.getByRole( 'heading', { level: 3, name: 'Feeds' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'Example Blog' ) ).toBeInTheDocument()
  } )

  it( 'announces loading and shows a load error', () => {
    mockedFeeds.mockReturnValue( feedsState( { feeds: [], isLoading: true } ) )
    const { unmount } = renderWithClient( <FeedSettings /> )
    expect( screen.getByText( 'Loading feeds…' ) ).toBeInTheDocument()
    unmount()

    mockedFeeds.mockReturnValue( feedsState( { feeds: [], error: 'Could not reach the server' } ) )
    renderWithClient( <FeedSettings /> )
    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  it( 'shows the saved interval', () => {
    mockedSettings.mockReturnValue( settingsState( {
      settings: { ...settingsFixture().settings, feed_check_interval_minutes: 180 },
    } ) )
    renderWithClient( <FeedSettings /> )

    expect( screen.getByRole( 'combobox', { name: 'Check feeds every' } ) )
      .toHaveTextContent( '3 hours' )
  } )

  it( 'offers the six intervals', async () => {
    const user = userEvent.setup()
    renderWithClient( <FeedSettings /> )

    await user.click( screen.getByRole( 'combobox', { name: 'Check feeds every' } ) )
    const options = within( screen.getByRole( 'listbox' ) ).getAllByRole( 'option' )

    expect( options.map( ( option ) => option.textContent ) ).toEqual( [
      '15 minutes',
      '30 minutes',
      '1 hour',
      '3 hours',
      '6 hours',
      'Daily',
    ] )
  } )

  it( 'saves a new interval at once', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    mockedSettings.mockReturnValue(
      settingsState( { updateSettings: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <FeedSettings /> )

    await user.click( screen.getByRole( 'combobox', { name: 'Check feeds every' } ) )
    await user.click( screen.getByRole( 'option', { name: '6 hours' } ) )

    expect( mutate ).toHaveBeenCalledWith( { feed_check_interval_minutes: 360 } )
  } )

  it( 'confirms a saved interval and shows a save error', () => {
    mockedSettings.mockReturnValue( settingsState( {
      updateSettings: mutationStub( { isError: true, error: new Error( 'Could not save' ) } ),
    } ) )
    renderWithClient( <FeedSettings /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not save' )
  } )

  it( 'checks every feed from Check all now', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    mockedFeeds.mockReturnValue( feedsState( { checkAllFeeds: mutationStub( { mutate } ) } ) )
    renderWithClient( <FeedSettings /> )

    await user.click( screen.getByRole( 'button', { name: 'Check all now' } ) )

    expect( mutate ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'disables Check all now and says Checking… while it runs', () => {
    mockedFeeds.mockReturnValue(
      feedsState( { checkAllFeeds: mutationStub( { isPending: true } ) } ),
    )
    renderWithClient( <FeedSettings /> )

    expect( screen.getByRole( 'button', { name: 'Checking…' } ) ).toBeDisabled()
  } )

  it( 'shows an error from Check all now', () => {
    mockedFeeds.mockReturnValue( feedsState( {
      checkAllFeeds: mutationStub( { isError: true, error: new Error( 'Boom' ) } ),
    } ) )
    renderWithClient( <FeedSettings /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Boom' )
  } )

  it( 'passes a switch change and a single check to the mutations', async () => {
    const user = userEvent.setup()
    const update = vi.fn()
    const check = vi.fn()
    mockedFeeds.mockReturnValue( feedsState( {
      updateFeed: mutationStub( { mutate: update } ),
      checkFeed: mutationStub( { mutate: check } ),
    } ) )
    renderWithClient( <FeedSettings /> )

    await user.click( screen.getByRole( 'switch', { name: 'On' } ) )
    expect( update ).toHaveBeenCalledWith( { id: FEED_ID, body: { enabled: false } } )

    await user.click( screen.getByRole( 'button', { name: 'Example Blog actions' } ) )
    await user.click( screen.getByRole( 'menuitem', { name: 'Check now' } ) )
    expect( check ).toHaveBeenCalledWith( FEED_ID )
  } )

  it( 'adds a feed through the Add feed dialog', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    vi.mocked( previewFeed ).mockResolvedValue( {
      feed_url: 'https://blog.example.com/feed.xml',
      title: 'Example Blog',
      latest_item: null,
    } )
    mockedFeeds.mockReturnValue( feedsState( { createFeed: mutationStub( { mutate } ) } ) )
    renderWithClient( <FeedSettings /> )

    await user.click( screen.getByRole( 'button', { name: 'Add feed' } ) )
    await user.type(
      screen.getByRole( 'textbox', { name: 'Feed or page address' } ),
      'https://blog.example.com{Enter}',
    )
    await user.click( await screen.findByRole( 'button', { name: 'Add' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { url: 'https://blog.example.com' },
      { onSuccess: expect.any( Function ) as () => void },
    )
  } )

  it( 'closes the Add dialog on success and when cancelled', async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    mockedFeeds.mockReturnValue( feedsState( { createFeed: mutationStub( { reset } ) } ) )
    renderWithClient( <FeedSettings /> )

    await user.click( screen.getByRole( 'button', { name: 'Add feed' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    await vi.waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
    expect( reset ).toHaveBeenCalled()
  } )

  it( 'edits a feed from its menu', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    mockedFeeds.mockReturnValue( feedsState( { updateFeed: mutationStub( { mutate } ) } ) )
    renderWithClient( <FeedSettings /> )

    await user.click( screen.getByRole( 'button', { name: 'Example Blog actions' } ) )
    await user.click( screen.getByRole( 'menuitem', { name: 'Edit' } ) )
    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), '!' )
    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { id: FEED_ID, body: { name: 'Example Blog!' } },
      { onSuccess: expect.any( Function ) as () => void },
    )
  } )

  it( 'deletes a feed from its menu, with the remove-items choice', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    mockedFeeds.mockReturnValue( feedsState( {
      feeds: [ feedFixture( { inbox_count: 2 } ) ],
      deleteFeed: mutationStub( { mutate } ),
    } ) )
    renderWithClient( <FeedSettings /> )

    await user.click( screen.getByRole( 'button', { name: 'Example Blog actions' } ) )
    await user.click( screen.getByRole( 'menuitem', { name: 'Delete' } ) )
    await user.click( screen.getByRole( 'checkbox' ) )
    await user.click( screen.getByRole( 'button', { name: 'Delete' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { id: FEED_ID, removeItems: true },
      { onSuccess: expect.any( Function ) as () => void },
    )
  } )

  it( 'shows a dialog\'s failed change inside the dialog', async () => {
    const user = userEvent.setup()
    mockedFeeds.mockReturnValue( feedsState( {
      deleteFeed: mutationStub( { isError: true, error: new Error( 'Feed not found' ) } ),
    } ) )
    renderWithClient( <FeedSettings /> )

    await user.click( screen.getByRole( 'button', { name: 'Example Blog actions' } ) )
    await user.click( screen.getByRole( 'menuitem', { name: 'Delete' } ) )

    expect( within( screen.getByRole( 'dialog' ) ).getByRole( 'alert' ) )
      .toHaveTextContent( 'Feed not found' )
  } )
} )

describe( 'FeedSettings, by role', () => {
  it( 'lets the admin set how often feeds are checked', () => {
    renderWithClient( <FeedSettings /> )

    expect( screen.getByRole( 'combobox', { name: 'Check feeds every' } ) ).toBeInTheDocument()
  } )

  it( 'leaves the check interval to the admin, but keeps the rest for a member', () => {
    vi.mocked( useMe ).mockReturnValue(
      { me: memberFixture(), isLoading: false, error: null },
    )
    renderWithClient( <FeedSettings /> )

    expect( screen.queryByRole( 'combobox', { name: 'Check feeds every' } ) )
      .not.toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Add feed' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Check all now' } ) ).toBeInTheDocument()
  } )
} )
