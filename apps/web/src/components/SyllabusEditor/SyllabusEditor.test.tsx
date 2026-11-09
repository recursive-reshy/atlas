// Testing Library
import { screen, waitFor, within } from '@testing-library/react'
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
import {
  JOINS_ID,
  SQL_ID,
  syllabusFixture,
  WINDOWS_ID,
} from '#src/test-support/syllabus.fixture'
import { SyllabusEditor } from './SyllabusEditor'

const setup = ( overrides = {}, syllabus = syllabusFixture() ) => {
  const handlers = { onSave: vi.fn(), onApprove: vi.fn(), onRedraft: vi.fn() }

  renderWithClient(
    <SyllabusEditor
      syllabus={ syllabus }
      status="draft"
      isBusy={ false }
      savedDiff={ null }
      { ...handlers }
      { ...overrides }
    />,
  )

  return { ...handlers, user: userEvent.setup() }
}

const conceptNames = (): string[] => {
  return screen.getAllByRole( 'textbox', { name: 'Concept name' } )
    .map( ( field ) => ( field as HTMLInputElement ).value )
}

const save = () => screen.getByRole( 'button', { name: 'Save changes' } )

describe( 'SyllabusEditor, showing a syllabus', () => {
  it( 'lists the sections and their concepts in order, with the count', () => {
    setup()

    expect( screen.getAllByRole( 'textbox', { name: 'Section name' } )
      .map( ( field ) => ( field as HTMLInputElement ).value ) ).toEqual( [ 'Basics', 'Advanced' ] )
    expect( conceptNames() ).toEqual( [ 'SQL', 'Joins', 'Windows' ] )
    expect( screen.getAllByRole( 'textbox', { name: 'Description' } )[ 1 ] )
      .toHaveValue( 'Combining tables' )
    expect( screen.getByText( '3 of 80 concepts' ) ).toBeInTheDocument()
  } )

  it( 'keeps Save and Discard off until something changes', () => {
    setup()

    expect( save() ).toBeDisabled()
    expect( screen.queryByRole( 'button', { name: 'Discard changes' } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'SyllabusEditor, editing', () => {
  it( 'saves a renamed concept with its id', async () => {
    const { user, onSave } = setup()
    const [ first ] = screen.getAllByRole( 'textbox', { name: 'Concept name' } )

    await user.clear( first )
    await user.type( first, 'SQL basics' )
    await user.click( save() )

    const [ edit ] = onSave.mock.calls[ 0 ] as [ { sections: { concepts: unknown[] }[] } ]

    expect( edit.sections[ 0 ].concepts[ 0 ] )
      .toEqual( { id: SQL_ID, name: 'SQL basics', description: 'Queries' } )
    expect( edit.sections ).toHaveLength( 2 )
  } )

  it( 'moves a concept up and down within its section', async () => {
    const { user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Move SQL down' } ) )

    expect( conceptNames() ).toEqual( [ 'Joins', 'SQL', 'Windows' ] )

    await user.click( screen.getByRole( 'button', { name: 'Move SQL up' } ) )

    expect( conceptNames() ).toEqual( [ 'SQL', 'Joins', 'Windows' ] )
  } )

  it( 'moves the last concept of a section into the next section', async () => {
    const { user, onSave } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Move Joins down' } ) )
    await user.click( save() )

    const [ edit ] = onSave.mock.calls[ 0 ] as [
      { sections: { concepts: { id: string }[] }[] },
    ]

    expect( edit.sections[ 1 ].concepts.map( ( { id } ) => id ) )
      .toEqual( [ JOINS_ID, WINDOWS_ID ] )
  } )

  it( 'offers no way past the first or last concept', () => {
    setup()

    expect( screen.getByRole( 'button', { name: 'Move SQL up' } ) ).toBeDisabled()
    expect( screen.getByRole( 'button', { name: 'Move Windows down' } ) ).toBeDisabled()
  } )

  it( 'moves a section down', async () => {
    const { user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Move section Basics down' } ) )

    expect( conceptNames() ).toEqual( [ 'Windows', 'SQL', 'Joins' ] )
    expect( screen.getByRole( 'button', { name: 'Move section Basics down' } ) ).toBeDisabled()
  } )

  it( 'adds a concept and asks for its name before Save is allowed', async () => {
    const { user, onSave } = setup()

    await user.click( screen.getAllByRole( 'button', { name: 'Add concept' } )[ 1 ] )

    expect( conceptNames() ).toEqual( [ 'SQL', 'Joins', 'Windows', '' ] )
    expect( screen.getByText( 'Name every concept' ) ).toBeInTheDocument()
    expect( save() ).toBeDisabled()

    await user.type( screen.getAllByRole( 'textbox', { name: 'Concept name' } )[ 3 ], 'Views' )

    expect( save() ).toBeEnabled()

    await user.click( save() )

    const [ edit ] = onSave.mock.calls[ 0 ] as [ { sections: { concepts: object[] }[] } ]

    expect( edit.sections[ 1 ].concepts[ 1 ] ).toEqual( { name: 'Views', description: '' } )
  } )

  it( 'adds a section with a blank concept, and asks for both names', async () => {
    const { user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Add section' } ) )

    expect( screen.getAllByRole( 'textbox', { name: 'Section name' } ) ).toHaveLength( 3 )
    expect( screen.getByText( 'Name every section' ) ).toBeInTheDocument()
    expect( save() ).toBeDisabled()
  } )

  it( 'removes a concept and a section', async () => {
    const { user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Remove Joins' } ) )

    expect( conceptNames() ).toEqual( [ 'SQL', 'Windows' ] )

    await user.click( screen.getByRole( 'button', { name: 'Remove section Basics' } ) )

    expect( conceptNames() ).toEqual( [ 'Windows' ] )
    expect( save() ).toBeEnabled()
  } )

  it( 'asks for a concept in a section left empty', async () => {
    const { user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Remove Windows' } ) )

    expect( screen.getByText( 'Every section needs a concept' ) ).toBeInTheDocument()
    expect( save() ).toBeDisabled()
  } )

  it( 'discards the changes', async () => {
    const { user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Remove Joins' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Discard changes' } ) )

    expect( conceptNames() ).toEqual( [ 'SQL', 'Joins', 'Windows' ] )
    expect( save() ).toBeDisabled()
  } )

  it( 'refuses more than 80 concepts', () => {
    const big = syllabusFixture()

    for( let index = 0; index < 78; index++ ) {
      big.sections[ 0 ].concepts.push( {
        id: `00000000-0000-4000-8000-${ String( index ).padStart( 12, '0' ) }`,
        name: `Extra ${ index }`,
        description: '',
      } )
    }

    setup( {}, big )

    expect( screen.getByText( '81 of 80 concepts' ) ).toBeInTheDocument()
    expect( screen.getByText( 'A syllabus has at most 80 concepts' ) ).toBeInTheDocument()
  } )
} )

describe( 'SyllabusEditor, approving and redrafting', () => {
  it( 'approves a draft', async () => {
    const { user, onApprove } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Approve' } ) )

    expect( onApprove ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'asks for the changes to be saved before approving', async () => {
    const { user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Remove Joins' } ) )

    expect( screen.getByRole( 'button', { name: 'Approve' } ) ).toBeDisabled()
    expect( screen.getByText( 'Save your changes before approving' ) ).toBeInTheDocument()
  } )

  it( 'shows an approved syllabus as approved, with nothing to approve', () => {
    setup( { status: 'approved' } )

    expect( screen.queryByRole( 'button', { name: 'Approve' } ) ).not.toBeInTheDocument()
    expect( screen.getByText( 'Approved' ) ).toBeInTheDocument()
  } )

  it( 'redrafts only after a confirm', async () => {
    const { user, onRedraft } = setup( { status: 'approved' } )

    await user.click( screen.getByRole( 'button', { name: 'Redraft' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )
    await waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )

    expect( onRedraft ).not.toHaveBeenCalled()

    await user.click( screen.getByRole( 'button', { name: 'Redraft' } ) )

    const dialog = screen.getByRole( 'dialog' )

    await user.click( within( dialog ).getByRole( 'button', { name: 'Redraft' } ) )

    expect( onRedraft ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'turns every action off while a request is in flight', () => {
    setup( { isBusy: true } )

    expect( screen.getByRole( 'button', { name: 'Approve' } ) ).toBeDisabled()
    expect( screen.getByRole( 'button', { name: 'Redraft' } ) ).toBeDisabled()
    expect( save() ).toBeDisabled()
  } )

  it( 'tells what the last save changed', () => {
    setup( { savedDiff: { renamed: 1, added: 2, removed: 0, moved: 1 } } )

    expect( screen.getByRole( 'status' ).textContent )
      .toContain( 'Saved: 1 renamed, 2 added, 1 moved' )
  } )

  it( 'says plain Saved when nothing in the concepts changed', () => {
    setup( { savedDiff: { renamed: 0, added: 0, removed: 0, moved: 0 } } )

    expect( screen.getByRole( 'status' ).textContent ).toContain( 'Saved' )
    expect( screen.getByRole( 'status' ).textContent ).not.toContain( ':' )
  } )
} )
