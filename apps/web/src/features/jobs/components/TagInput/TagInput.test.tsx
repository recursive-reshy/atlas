// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Testing Library
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { TagInput } from './TagInput'

function Harness( { initial }: { initial: string[] } ): ReactElement {
  const [ tags, setTags ] = useState( initial )

  return <TagInput tags={ tags } onChange={ setTags } />
}

const tagNames = (): string[] => {
  return screen.getAllByRole( 'listitem' )
    .map( ( item ) => ( item.textContent ?? '' ).replace( '×', '' ) )
}

describe( 'TagInput', () => {
  it( 'shows the fixed mnemosyne tag first, without a remove button', () => {
    render( <Harness initial={ [ 'rust' ] } /> )

    const items = screen.getAllByRole( 'listitem' )

    expect( items[ 0 ] ).toHaveTextContent( 'mnemosyne' )
    expect( screen.queryByRole( 'button', { name: 'Remove tag mnemosyne' } ) )
      .not.toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Remove tag rust' } ) ).toBeInTheDocument()
  } )

  it( 'removes a tag', async () => {
    render( <Harness initial={ [ 'rust', 'go' ] } /> )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Remove tag rust' } ) )

    expect( tagNames().join( ',' ) ).toBe( 'mnemosyne,go' )
  } )

  it( 'adds a normalized tag on Enter and clears the field', async () => {
    render( <Harness initial={ [] } /> )
    const user = userEvent.setup()
    const field = screen.getByRole( 'textbox', { name: 'Add tag' } )

    await user.type( field, 'Machine Learning{Enter}' )

    expect( tagNames().join( ',' ) ).toBe( 'mnemosyne,machine-learning' )
    expect( field ).toHaveValue( '' )
  } )

  it( 'adds a tag on a comma', async () => {
    render( <Harness initial={ [] } /> )
    const user = userEvent.setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Add tag' } ), 'rust,go,' )

    expect( tagNames().join( ',' ) ).toBe( 'mnemosyne,rust,go' )
  } )

  it( 'adds the pending tag when the field loses focus', async () => {
    render( <Harness initial={ [] } /> )
    const user = userEvent.setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Add tag' } ), 'rust' )
    await user.tab()

    expect( tagNames().join( ',' ) ).toBe( 'mnemosyne,rust' )
  } )

  it( 'ignores duplicates, mnemosyne and tags with nothing valid in them', async () => {
    render( <Harness initial={ [ 'rust' ] } /> )
    const user = userEvent.setup()
    const field = screen.getByRole( 'textbox', { name: 'Add tag' } )

    await user.type( field, 'Rust{Enter}Mnemosyne{Enter}!!!{Enter}' )

    expect( tagNames().join( ',' ) ).toBe( 'mnemosyne,rust' )
    expect( field ).toHaveValue( '' )
  } )

  it( 'does not remove a tag on Backspace in an empty field', async () => {
    render( <Harness initial={ [ 'rust' ] } /> )

    await userEvent.setup().type(
      screen.getByRole( 'textbox', { name: 'Add tag' } ),
      '{Backspace}',
    )

    expect( tagNames().join( ',' ) ).toBe( 'mnemosyne,rust' )
  } )
} )
