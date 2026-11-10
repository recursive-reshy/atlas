// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { settingsState } from '#src/test-support/hookStates'
import { PromptLockedInstructions } from './PromptLockedInstructions'

vi.mock( '#src/features/settings/hooks/useSettings' )
vi.mock( '../LockedInstructions', () => ( {
  LockedInstructions: ( { title, text }: { title?: string, text: string } ) => (
    <p>{ `${ title ?? 'locked' }: ${ text }` }</p>
  ),
} ) )

beforeEach( () => {
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
} )

const SENDS = 'Instructions the app always sends'

describe( 'PromptLockedInstructions', () => {
  it( 'shows the video and article instructions for a summary prompt', () => {
    render( <PromptLockedInstructions purpose="summary" /> )

    expect( screen.getByText( `${ SENDS } for videos: You summarize the transcript of a video.` ) )
      .toBeInTheDocument()
    expect( screen.getByText( `${ SENDS } for articles: You summarize an article.` ) )
      .toBeInTheDocument()
  } )

  it.each( [
    [ 'melete_questions', 'for question generation', 'You write questions.' ],
    [ 'melete_grading', 'for grading', 'You grade answers.' ],
    [ 'melete_map', 'for mapping notes', 'You map a note.' ],
    [ 'melete_suggest', 'for resource suggestions', 'You suggest resources.' ],
  ] as const )( 'shows the app\'s own text for %s', ( purpose, what, text ) => {
    render( <PromptLockedInstructions purpose={ purpose } /> )

    expect( screen.getByText( `${ SENDS } ${ what }: ${ text }` ) ).toBeInTheDocument()
    expect( screen.queryByText( /for videos/ ) ).not.toBeInTheDocument()
  } )

  it( 'shows the syllabus text the agent serves', () => {
    render( <PromptLockedInstructions purpose="melete_syllabus" /> )

    expect( screen.getByText( `${ SENDS } for syllabus drafting: You draft a syllabus.` ) )
      .toBeInTheDocument()
  } )

  it( 'says the syllabus text is unavailable while the agent is down', () => {
    vi.mocked( useSettings ).mockReturnValue(
      settingsState( { syllabusLockedInstructions: null } ),
    )
    render( <PromptLockedInstructions purpose="melete_syllabus" /> )

    expect( screen.getByText( 'Unavailable while the agent service is down.' ) )
      .toBeInTheDocument()
  } )

  it( 'shows the linker text, or says it is unavailable', () => {
    const { unmount } = render( <PromptLockedInstructions purpose="linker" /> )

    expect( screen.getByText( `${ SENDS } when linking: You propose links.` ) )
      .toBeInTheDocument()
    unmount()
    vi.mocked( useSettings ).mockReturnValue( settingsState( { linkerLockedInstructions: null } ) )
    render( <PromptLockedInstructions purpose="linker" /> )

    expect( screen.getByText( 'Unavailable while the agent service is down.' ) )
      .toBeInTheDocument()
  } )

  it( 'shows nothing for the app\'s own texts until the settings have loaded', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( { lockedInstructions: null } ) )
    const { container } = render( <PromptLockedInstructions purpose="melete_grading" /> )

    expect( container ).toBeEmptyDOMElement()
  } )
} )
