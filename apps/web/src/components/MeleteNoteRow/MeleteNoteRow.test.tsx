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

const setup = ( overrides: Partial< MeleteNote > = {} ) => {
  const onEnrolledChange = vi.fn()
  const onRetry = vi.fn()
  renderWithClient(
    <MeleteNoteRow
      note={ meleteNoteFixture( overrides ) }
      onEnrolledChange={ onEnrolledChange }
      onRetry={ onRetry }
    />,
  )

  return { onEnrolledChange, onRetry, user: userEvent.setup() }
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
