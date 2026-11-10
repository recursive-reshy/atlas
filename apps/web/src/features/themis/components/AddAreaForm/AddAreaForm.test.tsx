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
import { useCreateArea } from '#src/features/themis/hooks/useThemisMutations'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { AddAreaForm } from './AddAreaForm'

vi.mock( '#src/features/themis/hooks/useThemisMutations' )

type Stub = ReturnType< typeof useCreateArea >

const mutate = vi.fn()

beforeEach( () => {
  mutate.mockReset()
  vi.mocked( useCreateArea ).mockReturnValue( mutationStub< Stub >( { mutate } ) )
} )

describe( 'AddAreaForm', () => {
  it( 'adds the trimmed name', async () => {
    renderWithClient( <AddAreaForm /> )

    await userEvent.type( screen.getByRole( 'textbox', { name: 'Area name' } ), '  Career ' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Add area' } ) )

    expect( mutate ).toHaveBeenCalledWith( { name: 'Career' }, expect.anything() )
  } )

  it( 'adds on Enter', async () => {
    renderWithClient( <AddAreaForm /> )

    await userEvent.type( screen.getByRole( 'textbox', { name: 'Area name' } ), 'Health{Enter}' )

    expect( mutate ).toHaveBeenCalledWith( { name: 'Health' }, expect.anything() )
  } )

  it( 'does not add an empty name', async () => {
    renderWithClient( <AddAreaForm /> )

    expect( screen.getByRole( 'button', { name: 'Add area' } ) ).toBeDisabled()
    await userEvent.type( screen.getByRole( 'textbox', { name: 'Area name' } ), '   ' )
    expect( screen.getByRole( 'button', { name: 'Add area' } ) ).toBeDisabled()
  } )

  it( 'clears the field once the area is added', async () => {
    mutate.mockImplementation( ( _body: unknown, options: { onSuccess: () => void } ) => {
      options.onSuccess()
    } )
    renderWithClient( <AddAreaForm /> )

    await userEvent.type( screen.getByRole( 'textbox', { name: 'Area name' } ), 'Career{Enter}' )

    expect( screen.getByRole( 'textbox', { name: 'Area name' } ) ).toHaveValue( '' )
  } )

  it( 'shows the server\'s message', () => {
    vi.mocked( useCreateArea ).mockReturnValue( mutationStub< Stub >( {
      error: new Error( 'That area already exists' ),
      isError: true,
    } ) )
    renderWithClient( <AddAreaForm /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'That area already exists' )
  } )
} )
