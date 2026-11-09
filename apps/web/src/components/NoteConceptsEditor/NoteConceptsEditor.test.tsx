// Testing Library
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type { MeleteNote, MeleteSyllabus } from '@atlas/shared'
// App
import { meleteNoteFixture } from '#src/test-support/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { NoteConceptsEditor } from './NoteConceptsEditor'

const ids = {
  basics: '1a2b3c4d-0000-4000-8000-000000000001',
  advanced: '1a2b3c4d-0000-4000-8000-000000000002',
  generics: '1a2b3c4d-0000-4000-8000-000000000011',
  narrowing: '1a2b3c4d-0000-4000-8000-000000000012',
  unions: '1a2b3c4d-0000-4000-8000-000000000013',
}

const syllabus: MeleteSyllabus = {
  sections: [
    {
      id: ids.basics,
      name: 'Basics',
      concepts: [
        { id: ids.generics, name: 'Generics', description: '' },
        { id: ids.narrowing, name: 'Narrowing', description: '' },
      ],
    },
    {
      id: ids.advanced,
      name: 'Advanced',
      concepts: [ { id: ids.unions, name: 'Unions', description: '' } ],
    },
  ],
}

const setup = ( overrides: Partial< MeleteNote > = {}, error: string | null = null ) => {
  const onSave = vi.fn()

  renderWithClient(
    <NoteConceptsEditor
      note={ meleteNoteFixture( overrides ) }
      syllabus={ syllabus }
      isSaving={ false }
      error={ error }
      onSave={ onSave }
    />,
  )

  return { onSave, user: userEvent.setup() }
}

const choose = async ( user: ReturnType< typeof userEvent.setup >, name: string ) => {
  await user.click( screen.getByRole( 'combobox', { name: 'Concepts' } ) )
  await user.click( within( screen.getByRole( 'listbox' ) ).getByRole( 'option', { name } ) )
}

describe( 'NoteConceptsEditor', () => {
  it( 'shows the concepts the note is mapped to', () => {
    setup( { concept_ids: [ ids.narrowing, ids.unions ] } )

    expect( screen.getByRole( 'button', { name: 'Narrowing' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Unions' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Generics' } ) ).not.toBeInTheDocument()
  } )

  it( 'offers the concepts of every section, grouped by section', async () => {
    const { user } = setup()

    await user.click( screen.getByRole( 'combobox', { name: 'Concepts' } ) )

    const list = within( screen.getByRole( 'listbox' ) )

    expect( list.getAllByRole( 'option' ).map( ( option ) => option.textContent ) )
      .toEqual( [ 'Generics', 'Narrowing', 'Unions' ] )
    expect( list.getByText( 'Basics' ) ).toBeInTheDocument()
    expect( list.getByText( 'Advanced' ) ).toBeInTheDocument()
  } )

  it( 'saves the chosen concepts, in the order of the syllabus', async () => {
    const { onSave, user } = setup( { concept_ids: [ ids.unions ] } )

    await choose( user, 'Generics' )
    await user.click( screen.getByRole( 'button', { name: 'Save mapping' } ) )

    expect( onSave ).toHaveBeenCalledWith( [ ids.generics, ids.unions ] )
  } )

  it( 'saves an empty mapping', async () => {
    const { onSave, user } = setup( { concept_ids: [ ids.unions ] } )

    const chip = screen.getByRole( 'button', { name: 'Unions' } )

    await user.click( within( chip ).getByTestId( 'CancelIcon' ) )
    await user.click( screen.getByRole( 'button', { name: 'Save mapping' } ) )

    expect( onSave ).toHaveBeenCalledWith( [] )
  } )

  it( 'keeps Save off until the mapping changes', async () => {
    const { user } = setup( { concept_ids: [ ids.unions ] } )
    const save = screen.getByRole( 'button', { name: 'Save mapping' } )

    expect( save ).toBeDisabled()

    await choose( user, 'Generics' )

    expect( save ).toBeEnabled()
  } )

  it( 'says who set the mapping, and that a hand mapping stays until the note changes', () => {
    setup( { mapping_pinned: true, concept_ids: [ ids.unions ] } )

    expect( screen.getByText( /set by hand/i ) ).toBeInTheDocument()
  } )

  it( 'does not mention a hand mapping for one Claude made', () => {
    setup( { mapping_pinned: false, concept_ids: [ ids.unions ] } )

    expect( screen.queryByText( /set by hand/i ) ).not.toBeInTheDocument()
  } )

  it( 'shows that the questions are being labelled while the mapping is queued', () => {
    setup( { mapping: 'queued' } )

    expect( screen.getByText( /labelling the questions/i ) ).toBeInTheDocument()
  } )

  it( 'shows an error from saving', () => {
    setup( {}, 'Concept not found' )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Concept not found' )
  } )
} )
