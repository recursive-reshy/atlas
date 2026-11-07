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
import type { MeleteNote } from '@atlas/shared'
// App
import { meleteNoteFixture, NOTE_ID } from '#src/test-support/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { MeleteNoteRow } from './MeleteNoteRow'

const sections = [ { id: 'section-1', name: 'Basics' } ]

const setup = ( overrides: Partial< MeleteNote > = {}, concepts: string[] = [] ) => {
  const onEnrolledChange = vi.fn()
  const onRetry = vi.fn()
  const onDismissOffSyllabus = vi.fn()
  const onAddOffSyllabus = vi.fn()
  renderWithClient(
    <MeleteNoteRow
      note={ meleteNoteFixture( overrides ) }
      concepts={ concepts }
      sections={ sections }
      onEnrolledChange={ onEnrolledChange }
      onRetry={ onRetry }
      onDismissOffSyllabus={ onDismissOffSyllabus }
      onAddOffSyllabus={ onAddOffSyllabus }
    />,
  )

  return {
    onEnrolledChange,
    onRetry,
    onDismissOffSyllabus,
    onAddOffSyllabus,
    user: userEvent.setup(),
  }
}

describe( 'MeleteNoteRow', () => {
  it( 'links the title to the note page and shows the path below it', () => {
    setup()

    expect( screen.getByRole( 'link', { name: 'Generics' } ) )
      .toHaveAttribute( 'href', `/melete/notes/${ NOTE_ID }` )
    expect( screen.getByText( 'Learning/TypeScript/Generics.md' ) ).toBeInTheDocument()
  } )

  it( 'toggles enrollment from the switch named by the title', async () => {
    const { onEnrolledChange, user } = setup( { enrolled: false, question_count: 0 } )
    const toggle = screen.getByRole( 'switch', { name: 'Generics' } )

    expect( toggle ).not.toBeChecked()
    await user.click( toggle )

    expect( onEnrolledChange ).toHaveBeenCalledWith( true )
  } )

  it.each( [
    [ { question_count: 4 }, '4 questions' ],
    [ { question_count: 1 }, '1 question' ],
    [ { generation: 'queued' }, 'Generating…' ],
    [ { generation: 'generating' }, 'Generating…' ],
    [ { generation: 'generating', stale: true }, 'Changed — regenerating' ],
    [ { missing: true }, 'Missing' ],
  ] as const )( 'shows the status for %j', ( overrides, text ) => {
    setup( overrides )

    expect( screen.getByText( text ) ).toBeInTheDocument()
  } )

  it( 'shows nothing about questions for a note that is not enrolled and has none', () => {
    setup( { enrolled: false, question_count: 0 } )

    expect( screen.queryByText( /question/ ) ).not.toBeInTheDocument()
  } )

  it( 'shows a failed generation with its error and a Retry', async () => {
    const { onRetry, user } = setup( {
      generation: 'failed',
      generation_error: 'The note is too long',
    } )

    expect( screen.getByText( 'Failed' ) ).toBeInTheDocument()
    expect( screen.getByText( 'The note is too long' ) ).toBeInTheDocument()
    await user.click( screen.getByRole( 'button', { name: 'Retry' } ) )

    expect( onRetry ).toHaveBeenCalled()
  } )
} )

describe( 'MeleteNoteRow mapping', () => {
  it( 'shows the concepts the note is mapped to', () => {
    setup( {}, [ 'Type parameters', 'Narrowing' ] )

    expect( screen.getByText( 'Type parameters' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Narrowing' ) ).toBeInTheDocument()
  } )

  it( 'shows nothing about mapping for a note with no concepts and no flag', () => {
    setup()

    expect( screen.queryByText( /mapping/i ) ).not.toBeInTheDocument()
    expect( screen.queryByText( /off-syllabus/i ) ).not.toBeInTheDocument()
  } )

  it.each( [ 'queued', 'mapping' ] as const )( 'says it is mapping while %s', ( mapping ) => {
    setup( { mapping } )

    expect( screen.getByText( 'Mapping…' ) ).toBeInTheDocument()
  } )

  it( 'shows a failed mapping with its reason and retries it', async () => {
    const { onRetry, user } = setup( { mapping: 'failed', mapping_error: 'Overloaded' } )

    expect( screen.getByText( 'Overloaded' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Mapping failed' ) ).toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Retry' } ) )

    expect( onRetry ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'shows the off-syllabus flag with its suggestion, to dismiss or add', async () => {
    const { onDismissOffSyllabus, onAddOffSyllabus, user } = setup( {
      off_syllabus: 'flagged',
      off_syllabus_suggestion: 'Decorators',
    } )

    expect( screen.getByText( /“Decorators”/ ) ).toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Add concept' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Dismiss' } ) )

    expect( onAddOffSyllabus ).toHaveBeenCalledWith( 'section-1' )
    expect( onDismissOffSyllabus ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'does not show a dismissed flag', () => {
    setup( { off_syllabus: 'dismissed', off_syllabus_suggestion: 'Decorators' } )

    expect( screen.queryByText( /off-syllabus/i ) ).not.toBeInTheDocument()
  } )
} )

