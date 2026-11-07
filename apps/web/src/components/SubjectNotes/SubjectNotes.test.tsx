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
// Shared
import type { MeleteNote, MeleteSyllabus } from '@atlas/shared'
// App
import { meleteNoteFixture, NOTE_ID } from '#src/test-support/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SubjectNotes } from './SubjectNotes'

const SECTION = '1a2b3c4d-0000-4000-8000-000000000001'
const GENERICS = '1a2b3c4d-0000-4000-8000-000000000011'
const UNIONS = '1a2b3c4d-0000-4000-8000-000000000012'

const syllabus: MeleteSyllabus = {
  sections: [ {
    id: SECTION,
    name: 'Basics',
    concepts: [
      { id: GENERICS, name: 'Type parameters', description: '' },
      { id: UNIONS, name: 'Unions', description: '' },
    ],
  } ],
}

const setup = ( notes: MeleteNote[], withSyllabus: MeleteSyllabus | null = syllabus ) => {
  const handlers = {
    onEnrolledChange: vi.fn(),
    onRetry: vi.fn(),
    onDismissOffSyllabus: vi.fn(),
    onAddOffSyllabus: vi.fn(),
  }

  renderWithClient( <SubjectNotes notes={ notes } syllabus={ withSyllabus } { ...handlers } /> )

  return { ...handlers, user: userEvent.setup() }
}

describe( 'SubjectNotes', () => {
  it( 'says when the folder has no notes', () => {
    setup( [] )

    expect( screen.getByText( 'No notes in this folder yet.' ) ).toBeInTheDocument()
  } )

  it( 'shows each note with the names of its concepts, in syllabus order', () => {
    setup( [ meleteNoteFixture( { concept_ids: [ UNIONS, GENERICS ] } ) ] )

    const chips = screen.getAllByText( /Type parameters|Unions/ )

    expect( chips.map( ( chip ) => chip.textContent ) ).toEqual( [ 'Type parameters', 'Unions' ] )
  } )

  it( 'shows no concepts before the syllabus has loaded', () => {
    setup( [ meleteNoteFixture( { concept_ids: [ GENERICS ] } ) ], null )

    expect( screen.queryByText( 'Type parameters' ) ).not.toBeInTheDocument()
  } )

  it( 'forwards a note\'s actions with its id', async () => {
    const note = meleteNoteFixture( {
      generation: 'failed',
      generation_error: 'Too long',
      off_syllabus: 'flagged',
      off_syllabus_suggestion: 'Decorators',
    } )
    const handlers = setup( [ note ] )

    await handlers.user.click( screen.getByRole( 'switch', { name: 'Generics' } ) )
    await handlers.user.click( screen.getByRole( 'button', { name: 'Retry' } ) )
    await handlers.user.click( screen.getByRole( 'button', { name: 'Dismiss' } ) )
    await handlers.user.click( screen.getByRole( 'button', { name: 'Add concept' } ) )

    expect( handlers.onEnrolledChange ).toHaveBeenCalledWith( NOTE_ID, false )
    expect( handlers.onRetry ).toHaveBeenCalledWith( NOTE_ID )
    expect( handlers.onDismissOffSyllabus ).toHaveBeenCalledWith( NOTE_ID )
    expect( handlers.onAddOffSyllabus ).toHaveBeenCalledWith( NOTE_ID, SECTION )
  } )
} )
