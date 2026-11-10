// Testing Library
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { noteFixtures } from '#src/test-support/noteFixtures'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { NoteEditor } from './NoteEditor'

const note = noteFixtures[ '0.2.0 summary with YouTube timestamp links' ] ?? ''

const open = async (): Promise< void > => {
  renderWithClient( <NoteEditor value={ note } onChange={ vi.fn() } /> )
  await screen.findByRole( 'heading', { name: 'Key points' } )
}

describe( 'NoteEditor mode toggle', () => {
  it( 'is one named group with the two modes, rich text pressed', async () => {
    await open()

    const group = screen.getByRole( 'group', { name: 'Editor mode' } )
    const buttons = within( group ).getAllByRole( 'button' )

    expect( buttons.map( ( button ) => button.textContent ) )
      .toEqual( [ 'Rich text', 'Source mode' ] )
    expect( buttons[ 0 ] ).toHaveAttribute( 'aria-pressed', 'true' )
    expect( buttons[ 1 ] ).toHaveAttribute( 'aria-pressed', 'false' )
  } )
} )

const FORMATTING_NAMES = [
  /^Undo/,
  /^Redo/,
  'Block type',
  'Bold',
  'Italic',
  'Bulleted list',
  'Numbered list',
  'Create link',
] as const

const control = ( name: string | RegExp ): HTMLElement | null => {
  return screen.queryByRole( 'button', { name } )
    ?? screen.queryByRole( 'combobox', { name } )
    ?? screen.queryByRole( 'radio', { name } )
}

describe( 'NoteEditor formatting toolbar', () => {
  it( 'offers the formatting controls in rich text mode, each with a name', async () => {
    await open()

    for( const name of FORMATTING_NAMES ) {
      expect( control( name ), String( name ) ).not.toBeNull()
    }
  } )

  it( 'offers nothing that Markdown cannot hold or that the note does not use', async () => {
    await open()

    const extras = [ /underline/i, /check list/i, /strikethrough/i, /code/i, /table/i, /image/i ]

    for( const name of extras ) {
      expect( control( name ), String( name ) ).toBeNull()
    }
  } )

  it( 'hides the formatting controls in source mode and keeps the mode toggle', async () => {
    const user = userEvent.setup()
    await open()

    await user.click( screen.getByRole( 'button', { name: 'Source mode' } ) )

    for( const name of FORMATTING_NAMES ) {
      expect( control( name ), String( name ) ).toBeNull()
    }
    expect( screen.getByRole( 'group', { name: 'Editor mode' } ) ).toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Rich text' } ) )

    for( const name of FORMATTING_NAMES ) {
      expect( control( name ), String( name ) ).not.toBeNull()
    }
  } )

  it( 'lists paragraph, headings 1 to 3 and quote as block types, nothing deeper', async () => {
    const user = userEvent.setup()
    await open()

    await user.click( control( 'Block type' ) as HTMLElement )

    const options = within( await screen.findByRole( 'listbox' ) ).getAllByRole( 'option' )

    expect( options.map( ( option ) => option.textContent ).sort() )
      .toEqual( [ 'Heading 1', 'Heading 2', 'Heading 3', 'Paragraph', 'Quote' ] )
  } )

  describe( 'state follows the selection', () => {
    const everything = noteFixtures[ 'everything the toolbar can write' ] ?? ''

    const select = async ( text: string ): Promise< void > => {
      const content = document.querySelector( '[contenteditable="true"]' ) as HTMLElement
      const walker = document.createTreeWalker( content, NodeFilter.SHOW_TEXT )
      let node: Node | null = null

      while( walker.nextNode() ) {
        if( walker.currentNode.textContent === text ) {
          node = walker.currentNode
          break
        }
      }

      const range = document.createRange()

      range.setStart( node as Node, 0 )
      range.setEnd( node as Node, text.length )
      content.focus()
      document.getSelection()?.removeAllRanges()
      document.getSelection()?.addRange( range )
      await act( async () => {
        document.dispatchEvent( new Event( 'selectionchange' ) )
        await Promise.resolve()
      } )
    }

    it( 'shows bold as on (named "Remove bold") inside bold text and off elsewhere', async () => {
      renderWithClient( <NoteEditor value={ everything } onChange={ vi.fn() } /> )
      await screen.findByRole( 'heading', { name: 'Heading one' } )

      await select( 'Heading two' )

      expect( screen.getByRole( 'radio', { name: 'Bold' } ) )
        .toHaveAttribute( 'aria-checked', 'false' )

      await select( 'bold' )

      expect( screen.getByRole( 'radio', { name: 'Remove bold' } ) )
        .toHaveAttribute( 'aria-checked', 'true' )
    } )
  } )
} )
