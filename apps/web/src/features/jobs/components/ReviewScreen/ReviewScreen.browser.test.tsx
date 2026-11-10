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
import { updateDraft } from '#src/features/jobs/api/jobs.api'
import {
  acceptLinkSuggestions,
  listLinkSuggestions,
} from '#src/features/jobs/api/linkSuggestions.api'
import { useFolders } from '#src/features/vault/hooks/useFolders'
import { useModels } from '#src/hooks/useModels'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { useSource } from '#src/features/jobs/hooks/useSource'
import { modelsState, profilesState, settingsState } from '#src/test-support/hookStates'
import { jobFixture } from '#src/features/jobs/fixtures/job.fixture'
import { linkSuggestionFixture } from '#src/features/jobs/fixtures/linkSuggestion.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ReviewScreen } from './ReviewScreen'

vi.mock( '#src/features/jobs/api/jobs.api' )
vi.mock( '#src/features/jobs/api/linkSuggestions.api' )
vi.mock( '#src/features/jobs/hooks/useSource' )
vi.mock( '#src/features/vault/hooks/useFolders' )
vi.mock( '#src/hooks/useModels' )
vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/usePromptProfiles' )

// 60 paragraphs, so the pane scrolls
const text = Array.from( { length: 60 }, ( _, index ) => {
  return `Paragraph number ${ index } of the talk.`
} ).join( '\n\n' )

const transcript = {
  kind: 'video' as const,
  meta: {
    title: 'How Rust Works',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 1200,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'gpt-transcribe',
  },
  text,
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
} )
