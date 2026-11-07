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
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SUBJECT_ID } from '#src/test-support/themis.fixture'
import { LogTimeButton } from './LogTimeButton'

vi.mock( '#src/components/LogTimeDialog', () => ( {
  LogTimeDialog: ( { subjectId, onClose }: { subjectId?: string, onClose: () => void } ) => (
    <div>
      <p>{ `log time dialog for ${ subjectId ?? 'nothing' }` }</p>
      <button type="button" onClick={ onClose }>close dialog</button>
    </div>
  ),
} ) )

describe( 'LogTimeButton', () => {
  it( 'is a button named Log time, with no dialog until it is pressed', () => {
    renderWithClient( <LogTimeButton /> )

    expect( screen.getByRole( 'button', { name: 'Log time' } ) ).toBeInTheDocument()
    expect( screen.queryByText( /log time dialog/ ) ).not.toBeInTheDocument()
  } )

  it( 'opens the dialog, and closes it again', async () => {
    renderWithClient( <LogTimeButton /> )
    await userEvent.click( screen.getByRole( 'button', { name: 'Log time' } ) )

    expect( screen.getByText( 'log time dialog for nothing' ) ).toBeInTheDocument()

    await userEvent.click( screen.getByRole( 'button', { name: 'close dialog' } ) )

    expect( screen.queryByText( /log time dialog/ ) ).not.toBeInTheDocument()
  } )

  it( 'opens the dialog on its subject', async () => {
    renderWithClient( <LogTimeButton subjectId={ SUBJECT_ID } /> )
    await userEvent.click( screen.getByRole( 'button', { name: 'Log time' } ) )

    expect( screen.getByText( `log time dialog for ${ SUBJECT_ID }` ) ).toBeInTheDocument()
  } )

  it( 'can be a floating button, still named Log time, fixed to the corner', () => {
    renderWithClient( <LogTimeButton isFloating /> )

    expect( screen.getByRole( 'button', { name: 'Log time' } ) )
      .toHaveStyle( { position: 'fixed' } )
  } )
} )
