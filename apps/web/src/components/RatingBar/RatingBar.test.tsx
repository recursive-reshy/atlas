// Testing Library
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type { MeleteRating } from '@atlas/shared'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { RatingBar } from './RatingBar'

interface Handlers {
  onSelect: ( rating: MeleteRating ) => void
  onConfirm: ( rating: MeleteRating ) => void
}

const setup = (
  selected: MeleteRating | null,
  isDisabled = false,
): Handlers => {
  const handlers = { onSelect: vi.fn(), onConfirm: vi.fn() }

  renderWithClient(
    <RatingBar selected={ selected } isDisabled={ isDisabled } { ...handlers } />,
  )

  return handlers
}

describe( 'RatingBar', () => {
  it( 'shows the four ratings and marks the selected one', () => {
    setup( 'hard' )

    for( const name of [ 'Again', 'Hard', 'Good', 'Easy' ] ) {
      expect( screen.getByRole( 'button', { name } ) ).toBeInTheDocument()
    }
    expect( screen.getByRole( 'button', { name: 'Hard' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
    expect( screen.getByRole( 'button', { name: 'Good' } ) )
      .toHaveAttribute( 'aria-pressed', 'false' )
  } )

  it( 'confirms the pre-selected rating with Next', async () => {
    const { onConfirm } = setup( 'hard' )

    await userEvent.click( screen.getByRole( 'button', { name: 'Next' } ) )

    expect( onConfirm ).toHaveBeenCalledWith( 'hard' )
  } )

  it( 'selects another rating when it is tapped', async () => {
    const { onSelect, onConfirm } = setup( 'hard' )

    await userEvent.click( screen.getByRole( 'button', { name: 'Good' } ) )

    expect( onSelect ).toHaveBeenCalledWith( 'good' )
    expect( onConfirm ).not.toHaveBeenCalled()
  } )

  it( 'confirms when the selected rating is tapped again', async () => {
    const { onSelect, onConfirm } = setup( 'hard' )

    await userEvent.click( screen.getByRole( 'button', { name: 'Hard' } ) )

    expect( onConfirm ).toHaveBeenCalledWith( 'hard' )
    expect( onSelect ).not.toHaveBeenCalled()
  } )

  it( 'keeps Next off until a rating is selected', () => {
    setup( null )

    expect( screen.getByRole( 'button', { name: 'Next' } ) ).toBeDisabled()
  } )

  it( 'selects with the keys 1 to 4 and confirms with Enter', () => {
    const { onSelect, onConfirm } = setup( 'good' )

    fireEvent.keyDown( document, { key: '1' } )
    fireEvent.keyDown( document, { key: '4' } )
    fireEvent.keyDown( document, { key: 'Enter' } )

    expect( onSelect ).toHaveBeenNthCalledWith( 1, 'again' )
    expect( onSelect ).toHaveBeenNthCalledWith( 2, 'easy' )
    expect( onConfirm ).toHaveBeenCalledWith( 'good' )
  } )

  it( 'ignores Enter when nothing is selected', () => {
    const { onConfirm } = setup( null )

    fireEvent.keyDown( document, { key: 'Enter' } )

    expect( onConfirm ).not.toHaveBeenCalled()
  } )

  it( 'ignores the keys while the focus is in a text field', () => {
    const handlers = { onSelect: vi.fn(), onConfirm: vi.fn() }

    renderWithClient(
      <>
        <textarea aria-label="Answer" />
        <RatingBar selected="good" isDisabled={ false } { ...handlers } />
      </>,
    )
    fireEvent.keyDown( screen.getByLabelText( 'Answer' ), { key: '2', bubbles: true } )
    fireEvent.keyDown( screen.getByLabelText( 'Answer' ), { key: 'Enter', bubbles: true } )

    expect( handlers.onSelect ).not.toHaveBeenCalled()
    expect( handlers.onConfirm ).not.toHaveBeenCalled()
  } )

  it( 'does nothing while disabled', () => {
    const { onSelect, onConfirm } = setup( 'hard', true )

    fireEvent.keyDown( document, { key: '1' } )
    fireEvent.keyDown( document, { key: 'Enter' } )

    expect( screen.getByRole( 'button', { name: 'Next' } ) ).toBeDisabled()
    expect( screen.getByRole( 'button', { name: 'Good' } ) ).toBeDisabled()
    expect( onSelect ).not.toHaveBeenCalled()
    expect( onConfirm ).not.toHaveBeenCalled()
  } )

  it( 'stops listening for keys once unmounted', () => {
    const onSelect = vi.fn()
    const { unmount } = render(
      <RatingBar
        selected={ null }
        isDisabled={ false }
        onSelect={ onSelect }
        onConfirm={ vi.fn() }
      />,
    )

    unmount()
    fireEvent.keyDown( document, { key: '1' } )

    expect( onSelect ).not.toHaveBeenCalled()
  } )
} )
