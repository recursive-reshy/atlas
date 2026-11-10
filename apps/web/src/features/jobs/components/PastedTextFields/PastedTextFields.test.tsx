// React
import { useState } from 'react'
// Testing Library
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { PastedTextFields } from './PastedTextFields'

function Harness( { initial = '' }: { initial?: string } ) {
  const [ text, setText ] = useState( initial )
  const [ title, setTitle ] = useState( '' )

  return (
    <PastedTextFields
      text={ text }
      title={ title }
      onTextChange={ setText }
      onTitleChange={ setTitle }
    />
  )
}

describe( 'PastedTextFields', () => {
  it( 'has a Title field and an Article text field of at least ten rows', () => {
    render( <Harness /> )

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Article text' } ) )
      .toHaveAttribute( 'rows', '10' )
  } )

  it( 'passes typing to the handlers', async () => {
    const user = userEvent.setup()
    render( <Harness /> )

    await user.type( screen.getByRole( 'textbox', { name: 'Title' } ), 'My title' )
    await user.type( screen.getByRole( 'textbox', { name: 'Article text' } ), 'Some words' )

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toHaveValue( 'My title' )
    expect( screen.getByRole( 'textbox', { name: 'Article text' } ) ).toHaveValue( 'Some words' )
  } )

  it( 'counts characters against the limit', async () => {
    const user = userEvent.setup()
    render( <Harness /> )

    expect( screen.getByText( '0 / 300,000' ) ).toBeInTheDocument()

    await user.type( screen.getByRole( 'textbox', { name: 'Article text' } ), 'abcde' )

    expect( screen.getByText( '5 / 300,000' ) ).toBeInTheDocument()
  } )

  it( 'says the text is too short from the first character to 199', async () => {
    const user = userEvent.setup()
    render( <Harness /> )

    expect( screen.queryByText( /at least 200 characters/ ) ).not.toBeInTheDocument()

    await user.type( screen.getByRole( 'textbox', { name: 'Article text' } ), 'abc' )

    expect( screen.getByText( /at least 200 characters/ ) ).toBeInTheDocument()
  } )

  it( 'is happy at 200 characters', () => {
    render( <Harness initial={ 'x'.repeat( 200 ) } /> )

    expect( screen.queryByText( /at least 200 characters/ ) ).not.toBeInTheDocument()
  } )

  it( 'does not count surrounding whitespace toward the minimum', () => {
    const padded = `${ ' '.repeat( 150 ) }${ 'x'.repeat( 100 ) }${ ' '.repeat( 150 ) }`

    render( <Harness initial={ padded } /> )

    expect( screen.getByText( /at least 200 characters/ ) ).toBeInTheDocument()
  } )

  it( 'flags text over the limit', () => {
    render( <Harness initial={ 'x'.repeat( 300_001 ) } /> )

    expect( screen.getByText( /at most 300,000 characters/ ) ).toBeInTheDocument()
  } )
} )
