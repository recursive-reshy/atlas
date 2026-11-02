// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useRunBackup } from '#src/hooks/useRunBackup'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { BackupControls } from './BackupControls'

vi.mock( '#src/hooks/useRunBackup' )

const backup = vi.fn()
const result = {
  file: 'atlas-20261023-043000.db',
  bytes: 1_572_864,
  at: '2026-10-22T20:30:00.000Z',
}

const show = ( overrides: Parameters< typeof mutationStub >[ 0 ] = {} ): void => {
  vi.mocked( useRunBackup ).mockReturnValue(
    mutationStub( { mutate: backup, ...overrides } ),
  )
}

beforeEach( () => {
  backup.mockReset()
  show()
} )

describe( 'BackupControls', () => {
  it( 'starts a backup when Back up now is clicked', async () => {
    renderWithClient( <BackupControls /> )

    await userEvent.click( screen.getByRole( 'button', { name: 'Back up now' } ) )

    expect( backup ).toHaveBeenCalledOnce()
  } )

  it( 'disables the button and shows progress while it runs', () => {
    show( { isPending: true } )
    renderWithClient( <BackupControls /> )

    expect( screen.getByRole( 'button', { name: /Back up now/ } ) ).toBeDisabled()
    expect( screen.getByRole( 'progressbar', { name: 'Backing up' } ) ).toBeInTheDocument()
  } )

  it( 'shows the file and size in a status line when it succeeds', () => {
    show( { isSuccess: true, data: result } )
    renderWithClient( <BackupControls /> )

    expect( screen.getByRole( 'status' ) )
      .toHaveTextContent( 'Backed up to atlas-20261023-043000.db (1.5 MB)' )
    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
  } )

  it( 'shows the server\'s message when it fails', () => {
    show( { isError: true, error: new Error( 'A backup is already running' ) } )
    renderWithClient( <BackupControls /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'A backup is already running' )
    expect( screen.getByRole( 'button', { name: 'Back up now' } ) ).toBeEnabled()
  } )

  it( 'shows nothing extra before the first click', () => {
    renderWithClient( <BackupControls /> )

    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'progressbar' ) ).not.toBeInTheDocument()
  } )
} )
