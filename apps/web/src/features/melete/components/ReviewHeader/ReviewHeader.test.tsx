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
import type { MeleteReviewMode } from '@atlas/shared'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ReviewHeader } from './ReviewHeader'

const setup = ( mode: MeleteReviewMode = 'typed', isBusy = false ) => {
  const onModeChange = vi.fn()
  const onDrop = vi.fn()

  renderWithClient(
    <ReviewHeader
      subjectName="TypeScript"
      done={ 3 }
      left={ 9 }
      mode={ mode }
      isBusy={ isBusy }
      onModeChange={ onModeChange }
      onDrop={ onDrop }
    />,
  )

  return { onModeChange, onDrop, user: userEvent.setup() }
}

describe( 'ReviewHeader', () => {
  it( 'shows the subject, the progress and a way out', () => {
    setup()

    expect( screen.getByText( 'TypeScript' ) ).toBeInTheDocument()
    expect( screen.getByText( '3 done · 9 left' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Close review' } ) )
      .toHaveAttribute( 'href', '/melete' )
  } )

  it( 'marks the current mode and changes it', async () => {
    const { onModeChange, user } = setup( 'typed' )

    expect( screen.getByRole( 'button', { name: 'Typed' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
    await user.click( screen.getByRole( 'button', { name: 'Quick' } ) )

    expect( onModeChange ).toHaveBeenCalledWith( 'quick' )
  } )

  it( 'does not report a click on the current mode as a change', async () => {
    const { onModeChange, user } = setup( 'typed' )

    await user.click( screen.getByRole( 'button', { name: 'Typed' } ) )

    expect( onModeChange ).not.toHaveBeenCalled()
  } )

  it( 'drops the question from the overflow menu', async () => {
    const { onDrop, user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'More' } ) )
    await user.click( screen.getByRole( 'menuitem', { name: 'Drop question' } ) )

    expect( onDrop ).toHaveBeenCalledOnce()
  } )

  it( 'cannot drop while busy', async () => {
    const { user } = setup( 'typed', true )

    await user.click( screen.getByRole( 'button', { name: 'More' } ) )

    expect( screen.getByRole( 'menuitem', { name: 'Drop question' } ) )
      .toHaveAttribute( 'aria-disabled', 'true' )
  } )
} )
