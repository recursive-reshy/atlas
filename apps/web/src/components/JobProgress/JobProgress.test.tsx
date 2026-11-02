// Testing Library
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type { Job } from '@atlas/shared'
// App
import { jobFixture } from '#src/test-support/job.fixture'
import { JobProgress } from './JobProgress'

const labels = [
  'Waiting to start',
  'Downloading audio',
  'Converting audio',
  'Transcribing',
  'Summarizing',
  'Ready for review',
]

const setup = ( job: Job, connectionError: string | null = null ) => {
  const onRetry = vi.fn()

  render( <JobProgress job={ job } connectionError={ connectionError } onRetry={ onRetry } /> )

  return { onRetry, user: userEvent.setup() }
}

describe( 'JobProgress', () => {
  it.each( [
    [ 'queued', 'Waiting in the queue…', 'Waiting to start' ],
    [ 'downloading', 'Downloading audio…', 'Downloading audio' ],
    [ 'converting', 'Converting audio…', 'Converting audio' ],
    [ 'transcribing', 'Transcribing…', 'Transcribing' ],
    [ 'summarizing', 'Summarizing…', 'Summarizing' ],
    [ 'ready_for_review', 'Ready for review', 'Ready for review' ],
  ] as const )( 'shows the %s state', ( status, message, label ) => {
    setup( jobFixture( { status } ) )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( message )

    const current = screen.getAllByRole( 'listitem' )
      .filter( ( item ) => item.getAttribute( 'aria-current' ) === 'step' )

    expect( current ).toHaveLength( 1 )
    expect( current[ 0 ] ).toHaveTextContent( label )
  } )

  it.each( [
    [ 'fetching', 'Fetching the article…' ],
    [ 'summary_failed', 'Summary failed' ],
    [ 'saved', 'Saved' ],
  ] as const )( 'shows a message for the %s state', ( status, message ) => {
    setup( jobFixture( { status } ) )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( message )
  } )

  it( 'lists the six stages in order', () => {
    setup( jobFixture( { status: 'queued' } ) )

    const items = within( screen.getByRole( 'list' ) ).getAllByRole( 'listitem' )

    expect( items.map( ( item ) => item.textContent ) ).toEqual( labels )
  } )

  it( 'marks stages complete, current and pending', () => {
    setup( jobFixture( { status: 'transcribing' } ) )

    const states = screen.getAllByRole( 'listitem' ).map( ( item ) => item.dataset.state )

    expect( states ).toEqual( [
      'complete',
      'complete',
      'complete',
      'current',
      'pending',
      'pending',
    ] )
  } )

  it( 'marks every stage complete when ready, keeping the last as the current step', () => {
    setup( jobFixture( { status: 'ready_for_review' } ) )

    const items = screen.getAllByRole( 'listitem' )

    expect( items.map( ( item ) => item.dataset.state ) ).toEqual( Array( 6 ).fill( 'complete' ) )
    expect( items.at( -1 ) ).toHaveAttribute( 'aria-current', 'step' )
  } )

  it( 'shows the job URL', () => {
    setup( jobFixture() )

    expect( screen.getByText( jobFixture().url ) ).toBeInTheDocument()
  } )

  it( 'shows the error and a retry button for a failed job', async () => {
    const job = jobFixture( { status: 'failed', error: 'Video unavailable' } )
    const { onRetry, user } = setup( job )

    expect( screen.queryByRole( 'list' ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Video unavailable' )

    await user.click( screen.getByRole( 'button', { name: 'Try again' } ) )

    expect( onRetry ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'falls back to a generic message when a failed job has no error', () => {
    setup( jobFixture( { status: 'failed', error: null } ) )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Transcription failed.' )
  } )

  it( 'has no retry button while the job is running', () => {
    setup( jobFixture( { status: 'downloading' } ) )

    expect( screen.queryByRole( 'button', { name: 'Try again' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows a connection error above the list', () => {
    setup( jobFixture( { status: 'downloading' } ), 'Could not reach the server' )

    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'Could not reach the server. Retrying…' )
    expect( screen.getAllByRole( 'listitem' ) ).toHaveLength( 6 )
  } )

  it( 'shows no alert without a connection error', () => {
    setup( jobFixture( { status: 'downloading' } ) )

    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
  } )
} )

describe( 'JobProgress for an article', () => {
  const articleJob = ( status: Job[ 'status' ], error: string | null = null ) => {
    return jobFixture( { status, source_type: 'article', url: 'https://example.com/post', error } )
  }

  const setupArticle = ( job: Job ) => {
    const onRetry = vi.fn()
    const onPasteText = vi.fn()

    render(
      <JobProgress
        job={ job }
        connectionError={ null }
        onRetry={ onRetry }
        onPasteText={ onPasteText }
        isPasting={ false }
        pasteError={ null }
      />,
    )

    return { onRetry, onPasteText, user: userEvent.setup() }
  }

  it( 'lists the four article stages, with no download, convert or transcribe', () => {
    setupArticle( articleJob( 'queued' ) )

    const items = within( screen.getByRole( 'list' ) ).getAllByRole( 'listitem' )

    expect( items.map( ( item ) => item.textContent ) ).toEqual( [
      'Waiting to start',
      'Fetching the article',
      'Summarizing',
      'Ready for review',
    ] )
  } )

  it( 'makes fetching the current step', () => {
    setupArticle( articleJob( 'fetching' ) )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Fetching the article…' )
    expect( screen.getAllByRole( 'listitem' ).map( ( item ) => item.dataset.state ) )
      .toEqual( [ 'complete', 'current', 'pending', 'pending' ] )
  } )

  it( 'marks summarizing as current after the fetch', () => {
    setupArticle( articleJob( 'summarizing' ) )

    expect( screen.getAllByRole( 'listitem' ).map( ( item ) => item.dataset.state ) )
      .toEqual( [ 'complete', 'complete', 'current', 'pending' ] )
  } )

  it( 'shows the error, Paste text and Try again for a failed article', async () => {
    const { onRetry, user } = setupArticle( articleJob( 'failed', 'The page needs a login' ) )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'The page needs a login' )
    expect( screen.getByRole( 'button', { name: 'Paste text' } ) ).toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Try again' } ) )

    expect( onRetry ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'opens the paste dialog and passes the text on', async () => {
    const { onPasteText, user } = setupArticle( articleJob( 'failed', 'Paywalled' ) )
    const text = 'Pasted words go here. '.repeat( 15 )

    await user.click( screen.getByRole( 'button', { name: 'Paste text' } ) )
    await user.click( screen.getByRole( 'textbox', { name: 'Article text' } ) )
    await user.paste( text )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( onPasteText ).toHaveBeenCalledExactlyOnceWith( { text: text.trim() } )
  } )

  it( 'closes the dialog on Cancel', async () => {
    const { user } = setupArticle( articleJob( 'failed', 'Paywalled' ) )

    await user.click( screen.getByRole( 'button', { name: 'Paste text' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
  } )

  it( 'offers no Paste text for a failed video', () => {
    setupArticle( jobFixture( { status: 'failed', error: 'Video unavailable' } ) )

    expect( screen.queryByRole( 'button', { name: 'Paste text' } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'JobProgress linking step', () => {
  const stageTexts = (): Array< string | null > => {
    return screen.getAllByRole( 'listitem' ).map( ( item ) => item.textContent )
  }

  const stageStates = (): Array< string | undefined > => {
    return screen.getAllByRole( 'listitem' ).map( ( item ) => item.dataset.state )
  }

  it( 'makes Linking the current video step after Summarizing', () => {
    setup( jobFixture( { status: 'linking', link_state: 'pending' } ) )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Linking…' )
    expect( stageTexts() ).toEqual( [ ...labels.slice( 0, 5 ), 'Linking', 'Ready for review' ] )
    expect( stageStates() ).toEqual( [
      'complete',
      'complete',
      'complete',
      'complete',
      'complete',
      'current',
      'pending',
    ] )
    expect( screen.getByRole( 'listitem', { current: 'step' } ) ).toHaveTextContent( 'Linking' )
  } )

  it( 'makes Linking the current article step after Summarizing', () => {
    setup( jobFixture( { status: 'linking', link_state: 'pending', source_type: 'article' } ) )

    expect( stageTexts() ).toEqual( [
      'Waiting to start',
      'Fetching the article',
      'Summarizing',
      'Linking',
      'Ready for review',
    ] )
    expect( stageStates() ).toEqual( [ 'complete', 'complete', 'complete', 'current', 'pending' ] )
  } )

  it.each( [ 'linked', 'failed' ] as const )(
    'keeps Linking, complete, for a job ready for review whose linking %s',
    ( linkState ) => {
      setup( jobFixture( { status: 'ready_for_review', link_state: linkState } ) )

      expect( stageTexts() ).toContain( 'Linking' )
      expect( stageStates().every( ( state ) => state === 'complete' ) ).toBe( true )
    },
  )

  it.each( [ 'off', null ] as const )(
    'shows the 0.6.0 steps when linking is %s',
    ( linkState ) => {
      setup( jobFixture( { status: 'summarizing', link_state: linkState } ) )

      expect( stageTexts() ).toEqual( labels )
    },
  )
} )
