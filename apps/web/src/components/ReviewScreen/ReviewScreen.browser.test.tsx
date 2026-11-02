// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { userEvent } from 'vitest/browser'
// Shared
import { serializeNote } from '@atlas/shared'
// App
import { updateDraft } from '#src/api/jobs.api'
import { acceptLinkSuggestions, listLinkSuggestions } from '#src/api/linkSuggestions.api'
import { useFolders } from '#src/hooks/useFolders'
import { useModels } from '#src/hooks/useModels'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { useSource } from '#src/hooks/useSource'
import { modelsState, profilesState, settingsState } from '#src/test-support/hookStates'
import { jobFixture } from '#src/test-support/job.fixture'
import { linkSuggestionFixture } from '#src/test-support/linkSuggestion.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ReviewScreen } from './ReviewScreen'

vi.mock( '#src/api/jobs.api' )
vi.mock( '#src/api/linkSuggestions.api' )
vi.mock( '#src/hooks/useSource' )
vi.mock( '#src/hooks/useFolders' )
vi.mock( '#src/hooks/useModels' )
vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/usePromptProfiles' )

// One paragraph every 20 seconds (a 16 second pause splits them), 60 of them, so the pane scrolls.
// Starts are fractional, as whisper-server gives them; the note cites whole seconds.
const segments = Array.from( { length: 60 }, ( _, index ) => ( {
  start: index * 20 + 0.4,
  end: index * 20 + 4.1,
  text: `Segment number ${ index } of the talk.`,
} ) )

const transcript = {
  kind: 'video' as const,
  meta: {
    title: 'How Rust Works',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 1200,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  segments,
}

const note = serializeNote( {
  properties: {
    title: 'How Rust Works',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration: '20:00',
    created: '2026-10-15',
    tags: [ 'mnemosyne' ],
  },
  body: [
    '## Key points',
    '',
    '- Early point ([00:20](https://youtu.be/abc?t=20))',
    '- Later point ([13:20](https://youtu.be/abc?t=800))',
    '- Middle point ([13:45](https://youtu.be/abc?t=825))',
    '- A plain point with no timestamp',
    '',
  ].join( '\n' ),
} )

const job = jobFixture( {
  status: 'ready_for_review',
  title: 'How Rust Works',
  note_markdown: note,
} )

const pane = (): HTMLElement => screen.getByRole( 'region', { name: 'Transcript' } )

const marked = (): string[] => {
  return [ ...pane().querySelectorAll( '[aria-current="true"]' ) ].map( ( element ) => element.id )
}

const render = ( shown = job ): void => {
  renderWithClient( <ReviewScreen job={ shown } onSaved={ vi.fn() } onDiscarded={ vi.fn() } /> )
}

const settle = async (): Promise< void > => {
  await new Promise( ( resolve ) => {
    requestAnimationFrame( () => requestAnimationFrame( resolve ) )
  } )
}

const richItem = async ( text: string ): Promise< HTMLElement > => {
  return vi.waitFor( () => {
    const found = [ ...document.querySelectorAll( 'li' ) ]
      .find( ( element ) => element.textContent.startsWith( text ) )

    if( found === undefined ) {
      throw new Error( 'The note is not rendered yet' )
    }

    return found
  } )
}

const showSource = async (): Promise< void > => {
  await userEvent.click( await screen.findByText( 'Source mode' ) )
  await vi.waitFor( () => {
    if( document.querySelector( '.cm-content' ) === null ) {
      throw new Error( 'The source editor is not shown yet' )
    }
  } )
}

const sourceLine = ( text: string ): HTMLElement => {
  const found = [ ...document.querySelectorAll< HTMLElement >( '.cm-line' ) ]
    .find( ( line ) => line.textContent.includes( text ) )

  if( found === undefined ) {
    throw new Error( `No source line contains "${ text }"` )
  }

  return found
}

// From the start of the note, one arrow key at a time, as a user would.
const arrowToLine = async ( text: string ): Promise< void > => {
  await userEvent.click( sourceLine( '## Key points' ) )

  for( let step = 0; step < 20; step += 1 ) {
    if( document.querySelector( '.cm-activeLine' )?.textContent.includes( text ) ) {
      return
    }

    await userEvent.keyboard( '{ArrowDown}' )
  }

  throw new Error( `The cursor never reached "${ text }"` )
}

const expectVisible = ( id: string ): void => {
  const paragraph = pane().querySelector< HTMLElement >( `#${ id }` )
  const area = pane().getBoundingClientRect()
  const box = paragraph?.getBoundingClientRect()

  expect( box?.top ).toBeGreaterThanOrEqual( area.top )
  expect( box?.bottom ).toBeLessThanOrEqual( area.bottom )
}

beforeEach( () => {
  vi.mocked( useSource ).mockReturnValue( { source: transcript, error: null } )
  vi.mocked( useFolders ).mockReturnValue(
    { defaultFolder: 'Mnemosyne', folders: [], error: null },
  )
  vi.mocked( useModels ).mockReturnValue( modelsState() )
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
  vi.mocked( updateDraft ).mockResolvedValue( job )
} )

describe( 'ReviewScreen caret sync in a real browser', () => {
  it( 'scrolls to and marks the paragraph of a timestamp clicked in rich text mode', async () => {
    render()
    const item = await richItem( 'Middle point' )

    expect( marked() ).toEqual( [] )

    await userEvent.click( item )

    await expect.poll( marked ).toEqual( [ 'transcript-820' ] )
    expect( pane().scrollTop ).toBeGreaterThan( 0 )
    expectVisible( 'transcript-820' )
  } )

  it( 'follows the arrow keys onto a timestamp line in rich text mode', async () => {
    render()
    await userEvent.click( await richItem( 'A plain point' ) )
    await userEvent.keyboard( '{ArrowUp}' )

    await expect.poll( marked ).toEqual( [ 'transcript-820' ] )
  } )

  it( 'keeps the marker when the caret moves to a line without a timestamp', async () => {
    render()
    await userEvent.click( await richItem( 'Middle point' ) )
    await expect.poll( marked ).toEqual( [ 'transcript-820' ] )

    await userEvent.click( await richItem( 'A plain point' ) )
    await settle()

    expect( marked() ).toEqual( [ 'transcript-820' ] )
  } )

  it( 'follows the arrow keys onto a timestamp line in source mode', async () => {
    render()
    await showSource()

    await arrowToLine( 'Middle point' )

    await expect.poll( marked ).toEqual( [ 'transcript-820' ] )
    expect( pane().scrollTop ).toBeGreaterThan( 0 )
    expectVisible( 'transcript-820' )
  } )

  it( 'marks the paragraph that starts at a cited second in rich text mode', async () => {
    render()

    await userEvent.click( await richItem( 'Later point' ) )

    await expect.poll( marked ).toEqual( [ 'transcript-800' ] )
    expectVisible( 'transcript-800' )
  } )

  it( 'marks the paragraph that starts at a cited second in source mode', async () => {
    render()
    await showSource()

    await arrowToLine( 'Later point' )

    await expect.poll( marked ).toEqual( [ 'transcript-800' ] )
  } )

  it( 'ignores the duration in the front-matter in source mode', async () => {
    render()
    await showSource()

    await userEvent.click( sourceLine( 'duration' ) )
    await settle()

    expect( marked() ).toEqual( [] )
  } )
} )

describe( 'ReviewScreen suggested links in a real browser', () => {
  const linkedJob = { ...job, link_state: 'linked' as const }
  const suggestion = linkSuggestionFixture( {
    job_id: job.id,
    target: 'Plain Point',
    kind: 'new_concept',
    anchor: 'plain point',
  } )

  beforeEach( () => {
    vi.mocked( listLinkSuggestions ).mockResolvedValue( [ suggestion ] )
    vi.mocked( acceptLinkSuggestions ).mockImplementation( ( _id, body ) => Promise.resolve( {
      job: { ...linkedJob, note_markdown: body.note_markdown },
      suggestions: [ { ...suggestion, status: 'accepted' } ],
    } ) )
  } )

  it( 'puts an accepted link in the real editor and saves it once', async () => {
    render( linkedJob )

    await userEvent.click( await screen.findByRole( 'button', { name: 'Accept' } ) )

    await vi.waitFor( () => expect( acceptLinkSuggestions ).toHaveBeenCalledOnce() )
    const sent = vi.mocked( acceptLinkSuggestions ).mock.calls[ 0 ]?.[ 1 ].note_markdown ?? ''

    expect( sent ).toContain( 'A [[Plain Point|plain point]] with no timestamp' )
    await expect.poll( async () => ( await richItem( 'A [[Plain Point' ) ).textContent )
      .toBe( 'A [[Plain Point|plain point]] with no timestamp' )
    await expect.poll( () => screen.queryByText( 'Saved' ) !== null ).toBe( true )

    // The editor reports the replaced text back; it must not turn into a second, different save.
    await settle()
    await settle()

    expect( screen.queryByText( 'Unsaved changes' ) ).toBeNull()
    expect( updateDraft ).not.toHaveBeenCalled()
  } )

  it( 'keeps the caret sync working on the Source tab', async () => {
    render( linkedJob )
    await userEvent.click( await screen.findByRole( 'tab', { name: 'Source' } ) )

    await userEvent.click( await richItem( 'Middle point' ) )

    await expect.poll( marked ).toEqual( [ 'transcript-820' ] )
    expectVisible( 'transcript-820' )
  } )
} )
