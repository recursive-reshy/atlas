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
// Shared
import type { InboxItem } from '@atlas/shared'
// App
import { useDismissInbox } from '#src/features/inbox/hooks/useDismissInbox'
import { useInbox } from '#src/features/inbox/hooks/useInbox'
import { useModels } from '#src/hooks/useModels'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { useSummarizeInbox } from '#src/features/inbox/hooks/useSummarizeInbox'
import { feedItemFixture, ITEM_ID } from '#src/features/feeds/fixtures/feed.fixture'
import { GMAIL_ITEM_ID, gmailItemFixture } from '#src/features/gmail/fixtures/gmail.fixture'
import { modelsState, profilesState, settingsState } from '#src/test-support/hookStates'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { Inbox } from './Inbox'

vi.mock( '#src/features/inbox/hooks/useInbox' )
vi.mock( '#src/features/inbox/hooks/useDismissInbox' )
vi.mock( '#src/features/inbox/hooks/useSummarizeInbox' )
vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/useModels' )
vi.mock( '#src/hooks/usePromptProfiles' )

const SECOND_ID = '5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e'

const ref = ( id: string ): { kind: 'feed', id: string } => ( { kind: 'feed', id } )
const emailRef = { kind: 'gmail', id: GMAIL_ITEM_ID }
const items: InboxItem[] = [
  feedItemFixture(),
  feedItemFixture( {
    id: SECOND_ID,
    title: 'A video',
    link: 'https://www.youtube.com/watch?v=abc',
    source_type: 'video',
    feed_name: 'A Channel',
    published_at: null,
    added_at: '2026-10-16T09:00:00.000Z',
  } ),
]

const mockInbox = ( list = items ): void => {
  vi.mocked( useInbox ).mockReturnValue( { items: list, isLoading: false, error: null } )
}

const setup = ( { dismiss = vi.fn(), summarize = vi.fn() } = {} ) => {
  vi.mocked( useDismissInbox ).mockReturnValue( mutationStub( { mutate: dismiss } ) )
  vi.mocked( useSummarizeInbox ).mockReturnValue( mutationStub( { mutate: summarize } ) )
  renderWithClient( <Inbox /> )

  return { user: userEvent.setup(), dismiss, summarize }
}

beforeEach( () => {
  mockInbox()
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( useModels ).mockReturnValue( modelsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
} )

describe( 'Inbox', () => {
  it( 'shows nothing when the inbox is empty', () => {
    mockInbox( [] )
    setup()

    expect( screen.queryByRole( 'heading' ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'list' ) ).not.toBeInTheDocument()
  } )

  it( 'has a heading with the count', () => {
    setup()

    expect( screen.getByRole( 'heading', { name: 'Inbox (2)' } ) ).toBeInTheDocument()
  } )

  it( 'shows each item\'s feed, title link, date and type', () => {
    setup()
    const [ article, video ] = within( screen.getByRole( 'list', { name: 'Inbox items' } ) )
      .getAllByRole( 'listitem' )

    expect( within( article ).getByText( 'Example Blog' ) ).toBeInTheDocument()
    const link = within( article ).getByRole( 'link', { name: 'A new post' } )
    expect( link ).toHaveAttribute( 'href', 'https://blog.example.com/a-new-post' )
    expect( link ).toHaveAttribute( 'target', '_blank' )
    expect( link ).toHaveAttribute( 'rel', 'noopener noreferrer' )
    expect( within( article ).getByText( '2026-10-17' ) ).toBeInTheDocument()
    expect( within( article ).getByRole( 'img', { name: 'Article' } ) ).toBeInTheDocument()
    expect( within( video ).getByRole( 'img', { name: 'Video' } ) ).toBeInTheDocument()
    expect( within( video ).getByText( '2026-10-16' ) ).toBeInTheDocument()
  } )

  it( 'disables Summarize and Dismiss until something is selected', () => {
    setup()

    expect( screen.getByRole( 'button', { name: 'Summarize selected' } ) ).toBeDisabled()
    expect( screen.getByRole( 'button', { name: 'Dismiss selected' } ) ).toBeDisabled()
  } )

  it( 'selects one item, then all, then none', async () => {
    const { user } = setup()
    const all = screen.getByRole( 'checkbox', { name: 'Select all' } )

    await user.click( screen.getByRole( 'checkbox', { name: 'Select A new post' } ) )
    expect( screen.getByRole( 'button', { name: 'Summarize selected' } ) ).toBeEnabled()
    expect( all ).toHaveAttribute( 'data-indeterminate', 'true' )

    await user.click( all )
    expect( screen.getByRole( 'checkbox', { name: 'Select A video' } ) ).toBeChecked()
    expect( all ).toBeChecked()

    await user.click( all )
    expect( screen.getByRole( 'checkbox', { name: 'Select A video' } ) ).not.toBeChecked()
    expect( screen.getByRole( 'button', { name: 'Dismiss selected' } ) ).toBeDisabled()
  } )

  it( 'dismisses the selected items', async () => {
    const { user, dismiss } = setup()

    await user.click( screen.getByRole( 'checkbox', { name: 'Select all' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Dismiss selected' } ) )

    expect( dismiss ).toHaveBeenCalledWith(
      [ ref( ITEM_ID ), ref( SECOND_ID ) ],
      expect.any( Object ),
    )
  } )

  it( 'dismisses one item from its own button', async () => {
    const { user, dismiss } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Dismiss A video' } ) )

    expect( dismiss ).toHaveBeenCalledWith( [ ref( SECOND_ID ) ], expect.any( Object ) )
  } )

  it( 'drops items that left the inbox from the selection', async () => {
    vi.mocked( useDismissInbox ).mockReturnValue( mutationStub() )
    vi.mocked( useSummarizeInbox ).mockReturnValue( mutationStub() )
    const user = userEvent.setup()
    const { rerender } = renderWithClient( <Inbox /> )
    await user.click( screen.getByRole( 'checkbox', { name: 'Select all' } ) )

    mockInbox( [ items[ 0 ] ] )
    rerender( <Inbox /> )
    await user.click( screen.getByRole( 'button', { name: 'Summarize selected' } ) )

    expect( screen.getByText( '1 item will become a job.' ) ).toBeInTheDocument()
  } )

  it( 'shows a dismiss error', () => {
    vi.mocked( useDismissInbox ).mockReturnValue(
      mutationStub( { isError: true, error: new Error( 'Could not reach the server' ) } ),
    )
    vi.mocked( useSummarizeInbox ).mockReturnValue( mutationStub() )
    renderWithClient( <Inbox /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  it( 'summarizes the selection through the dialog', async () => {
    const { user, summarize } = setup()

    await user.click( screen.getByRole( 'checkbox', { name: 'Select all' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Summarize selected' } ) )
    expect( screen.getByText( '2 items will become jobs.' ) ).toBeInTheDocument()
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( summarize ).toHaveBeenCalledWith(
      { items: [ ref( ITEM_ID ), ref( SECOND_ID ) ] },
      expect.any( Object ),
    )
  } )

  it( 'summarizes one item from its own button', async () => {
    const { user, summarize } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Summarize A video' } ) )
    expect( screen.getByText( '1 item will become a job.' ) ).toBeInTheDocument()
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( summarize ).toHaveBeenCalledWith(
      { items: [ ref( SECOND_ID ) ] },
      expect.any( Object ),
    )
  } )

  it( 'closes the dialog on cancel without summarizing', async () => {
    const { user, summarize } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Summarize A video' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    await vi.waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
    expect( summarize ).not.toHaveBeenCalled()
  } )
  describe( 'newsletter emails', () => {
    const email = gmailItemFixture()
    const mixed = [ email, ...items ]

    it( 'counts every kind in the heading', () => {
      mockInbox( mixed )
      setup()

      expect( screen.getByRole( 'heading', { name: 'Inbox (3)' } ) ).toBeInTheDocument()
    } )

    it( 'shows an email with its icon, Gmail link, sender, source and date', () => {
      mockInbox( mixed )
      setup()
      const [ row ] = within( screen.getByRole( 'list', { name: 'Inbox items' } ) )
        .getAllByRole( 'listitem' )

      const link = within( row ).getByRole( 'link', { name: 'This week in tech' } )

      expect( link ).toHaveAttribute( 'href', email.link )
      expect( link ).toHaveAttribute( 'target', '_blank' )
      expect( link ).toHaveAttribute( 'rel', 'noopener noreferrer' )
      expect( within( row ).getByRole( 'img', { name: 'Email' } ) ).toBeInTheDocument()
      expect( within( row ).getByText( 'Lenny' ) ).toBeInTheDocument()
      expect( within( row ).getByText( 'Newsletters' ) ).toBeInTheDocument()
      // The row's icon and the source chip's.
      expect( within( row ).getAllByTestId( 'MailOutlinedIcon' ) ).toHaveLength( 2 )
      expect( within( row ).getByText( '2026-10-19' ) ).toBeInTheDocument()
    } )

    it( 'shows no sender line and no mail chip on a feed item', () => {
      mockInbox( mixed )
      setup()
      const rows = within( screen.getByRole( 'list', { name: 'Inbox items' } ) )
        .getAllByRole( 'listitem' )

      const feedRow = within( rows[ 1 ] )

      expect( feedRow.queryByTestId( 'MailOutlinedIcon' ) ).not.toBeInTheDocument()
      expect( feedRow.getByTestId( 'RssFeedIcon' ) ).toBeInTheDocument()
    } )

    it( 'dismisses both kinds with the kind of each', async () => {
      mockInbox( mixed )
      const { user, dismiss } = setup()

      await user.click( screen.getByRole( 'checkbox', { name: 'Select all' } ) )
      await user.click( screen.getByRole( 'button', { name: 'Dismiss selected' } ) )

      expect( dismiss ).toHaveBeenCalledWith(
        [ emailRef, ref( ITEM_ID ), ref( SECOND_ID ) ],
        expect.any( Object ),
      )
    } )

    it( 'summarizes one email from its own button', async () => {
      mockInbox( mixed )
      const { user, summarize } = setup()

      await user.click( screen.getByRole( 'button', { name: 'Summarize This week in tech' } ) )
      await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

      expect( summarize ).toHaveBeenCalledWith(
        { items: [ emailRef ] },
        expect.any( Object ),
      )
    } )

    it( 'dismisses one email from its own button', async () => {
      mockInbox( mixed )
      const { user, dismiss } = setup()

      await user.click( screen.getByRole( 'button', { name: 'Dismiss This week in tech' } ) )

      expect( dismiss ).toHaveBeenCalledWith( [ emailRef ], expect.any( Object ) )
    } )
  } )

  describe( 'when some items cannot be summarized', () => {
    const outcome = ( failedTitles: string[] ) => ( { jobs: [], failedTitles } )

    const summarizeAll = async ( failedTitles: string[] ) => {
      type Options = { onSuccess?: ( data: unknown ) => void }
      const summarize = vi.fn( ( _body: unknown, options?: Options ) => {
        options?.onSuccess?.( outcome( failedTitles ) )
      } )
      const { user } = setup( { summarize } )

      await user.click( screen.getByRole( 'checkbox', { name: 'Select all' } ) )
      await user.click( screen.getByRole( 'button', { name: 'Summarize selected' } ) )
      await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

      return user
    }

    it( 'tells which ones stayed in the inbox', async () => {
      await summarizeAll( [ 'A video' ] )

      expect( await screen.findByRole( 'alert' ) )
        .toHaveTextContent( '1 of 2 couldn\'t be summarized and stay in the inbox: A video' )
    } )

    it( 'lists every title that stayed', async () => {
      await summarizeAll( [ 'A video', 'A new post' ] )

      expect( await screen.findByRole( 'alert' ) )
        .toHaveTextContent(
          '2 of 2 couldn\'t be summarized and stay in the inbox: A video, A new post',
        )
    } )

    it( 'says nothing when every item became a job', async () => {
      await summarizeAll( [] )

      await vi.waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
      expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
    } )

    it( 'closes the dialog and clears the selection either way', async () => {
      await summarizeAll( [ 'A video' ] )

      await vi.waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
      expect( screen.getByRole( 'button', { name: 'Summarize selected' } ) ).toBeDisabled()
    } )

    it( 'closes the notice with its close button', async () => {
      const user = await summarizeAll( [ 'A video' ] )

      await user.click( await screen.findByRole( 'button', { name: 'Close' } ) )

      await vi.waitFor( () => expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument() )
    } )

    it( 'keeps the dialog open with the server\'s message when every item failed', async () => {
      vi.mocked( useSummarizeInbox ).mockReturnValue( mutationStub( {
        isError: true,
        error: new Error( 'Could not summarize "A video" (too little text)' ),
      } ) )
      vi.mocked( useDismissInbox ).mockReturnValue( mutationStub() )
      renderWithClient( <Inbox /> )

      await userEvent.click( screen.getByRole( 'button', { name: 'Summarize A video' } ) )

      expect( screen.getByRole( 'dialog' ) )
        .toHaveTextContent( 'Could not summarize "A video" (too little text)' )
    } )
  } )
} )
