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
import type { MeleteQuestion } from '@atlas/shared'
// App
import { meleteQuestionFixture } from '#src/test-support/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { MeleteQuestionItem } from './MeleteQuestionItem'

const setup = ( overrides: Partial< MeleteQuestion > = {} ) => {
  const onDrop = vi.fn()
  renderWithClient(
    <MeleteQuestionItem question={ meleteQuestionFixture( overrides ) } onDrop={ onDrop } />,
  )

  return { onDrop, user: userEvent.setup() }
}

describe( 'MeleteQuestionItem', () => {
  it( 'shows the prompt, the answer and the passage as a quote', () => {
    setup()

    expect( screen.getByText( 'What does a type parameter do?' ) ).toBeInTheDocument()
    expect( screen.getByText( 'It stands for a type chosen by the caller.' ) ).toBeInTheDocument()
    const passage = screen.getByText( 'A type parameter is a placeholder for a type.' )
    expect( passage.closest( 'blockquote' ) ).not.toBeNull()
  } )

  it( 'leaves out the quote when there is no passage', () => {
    setup( { passage: '' } )

    expect( screen.queryByText( 'Passage' ) ).not.toBeInTheDocument()
    expect( document.querySelector( 'blockquote' ) ).toBeNull()
  } )

  it.each( [
    [ { due: null, reps: 0 }, 'New · 0 reviews' ],
    [ { due: '2026-10-25T09:00:00.000Z', reps: 1 }, 'Due 2026-10-25 · 1 review' ],
    [ { due: '2026-10-25T09:00:00.000Z', reps: 3 }, 'Due 2026-10-25 · 3 reviews' ],
  ] as const )( 'shows the schedule for %j', ( overrides, text ) => {
    setup( overrides )

    expect( screen.getByText( text ) ).toBeInTheDocument()
  } )

  it( 'drops an active question', async () => {
    const { onDrop, user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Drop' } ) )

    expect( onDrop ).toHaveBeenCalled()
  } )

  it( 'has no Drop button and no schedule once dropped', () => {
    setup( { state: 'dropped', due: '2026-10-25T09:00:00.000Z' } )

    expect( screen.queryByRole( 'button', { name: 'Drop' } ) ).not.toBeInTheDocument()
    expect( screen.queryByText( /Due/ ) ).not.toBeInTheDocument()
  } )
} )
