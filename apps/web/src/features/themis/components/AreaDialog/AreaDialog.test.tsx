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
import { useDeleteArea, useUpdateArea } from '#src/features/themis/hooks/useGoalMutations'
import { useCreateArea } from '#src/features/themis/hooks/useThemisMutations'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CAREER_ID } from '#src/features/themis/fixtures/themis.fixture'
import { AreaDialog } from './AreaDialog'

vi.mock( '#src/features/themis/hooks/useThemisMutations' )
vi.mock( '#src/features/themis/hooks/useGoalMutations' )

const create = vi.fn()
const update = vi.fn()
const remove = vi.fn()
const onClose = vi.fn()

const stubs = ( overrides: { create?: object, update?: object, remove?: object } = {} ): void => {
  vi.mocked( useCreateArea ).mockReturnValue(
    mutationStub< ReturnType< typeof useCreateArea > >( { mutate: create, ...overrides.create } ),
  )
  vi.mocked( useUpdateArea ).mockReturnValue(
    mutationStub< ReturnType< typeof useUpdateArea > >( { mutate: update, ...overrides.update } ),
  )
  vi.mocked( useDeleteArea ).mockReturnValue(
    mutationStub< ReturnType< typeof useDeleteArea > >( { mutate: remove, ...overrides.remove } ),
  )
}

const succeed = ( mock: ReturnType< typeof vi.fn > ) => {
  mock.mockImplementation( ( _vars: unknown, options: { onSuccess: () => void } ) => {
    options.onSuccess()
  } )
}

beforeEach( () => {
  create.mockReset()
  update.mockReset()
  remove.mockReset()
  onClose.mockReset()
  stubs()
} )

describe( 'AreaDialog, new area', () => {
  it( 'is titled New area and has no Delete', () => {
    renderWithClient( <AreaDialog area={ null } onClose={ onClose } /> )

    expect( screen.getByRole( 'dialog', { name: 'New area' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Delete area' } ) ).not.toBeInTheDocument()
  } )

  it( 'creates the area with the trimmed name, then closes', async () => {
    succeed( create )
    renderWithClient( <AreaDialog area={ null } onClose={ onClose } /> )

    await userEvent.type( screen.getByRole( 'textbox', { name: 'Area name' } ), ' Health ' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Add area' } ) )

    expect( create ).toHaveBeenCalledWith( { name: 'Health' }, expect.anything() )
    expect( onClose ).toHaveBeenCalled()
  } )

  it( 'keeps Add area off while the name is empty', () => {
    renderWithClient( <AreaDialog area={ null } onClose={ onClose } /> )

    expect( screen.getByRole( 'button', { name: 'Add area' } ) ).toBeDisabled()
  } )

  it( 'shows the server\'s message and stays open', () => {
    stubs( { create: { error: new Error( 'You already have an area with that name' ) } } )
    renderWithClient( <AreaDialog area={ null } onClose={ onClose } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'already have an area' )
    expect( onClose ).not.toHaveBeenCalled()
  } )
} )

describe( 'AreaDialog, existing area', () => {
  const area = { id: CAREER_ID, name: 'Career' }

  it( 'starts with the current name', () => {
    renderWithClient( <AreaDialog area={ area } onClose={ onClose } /> )

    expect( screen.getByRole( 'dialog', { name: 'Rename area' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Area name' } ) ).toHaveValue( 'Career' )
  } )

  it( 'renames the area, then closes', async () => {
    succeed( update )
    renderWithClient( <AreaDialog area={ area } onClose={ onClose } /> )

    const field = screen.getByRole( 'textbox', { name: 'Area name' } )

    await userEvent.clear( field )
    await userEvent.type( field, 'Work' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( update ).toHaveBeenCalledWith(
      { id: CAREER_ID, body: { name: 'Work' } },
      expect.anything(),
    )
    expect( onClose ).toHaveBeenCalled()
  } )

  it( 'just closes when the name is unchanged', async () => {
    renderWithClient( <AreaDialog area={ area } onClose={ onClose } /> )

    await userEvent.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( update ).not.toHaveBeenCalled()
    expect( onClose ).toHaveBeenCalled()
  } )

  it( 'deletes the area, then closes', async () => {
    succeed( remove )
    renderWithClient( <AreaDialog area={ area } onClose={ onClose } /> )

    await userEvent.click( screen.getByRole( 'button', { name: 'Delete area' } ) )

    expect( remove ).toHaveBeenCalledWith( CAREER_ID, expect.anything() )
    expect( onClose ).toHaveBeenCalled()
  } )

  it( 'shows why a delete was refused and stays open', () => {
    stubs( { remove: { error: new Error( 'Move or delete its goals first' ) } } )
    renderWithClient( <AreaDialog area={ area } onClose={ onClose } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Move or delete its goals first' )
    expect( onClose ).not.toHaveBeenCalled()
  } )
} )
