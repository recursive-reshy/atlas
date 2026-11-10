// Testing Library
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { mockMatchMedia } from '#src/test-support/matchMedia'
import { noteFixtures } from '#src/test-support/noteFixtures'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { NoteEditor } from './NoteEditor'

const note = noteFixtures[ '0.2.0 summary with YouTube timestamp links' ] ?? ''

const root = (): Element | null => document.querySelector( '.mdxeditor' )
const popups = (): Element | null => document.querySelector( '.mdxeditor-popup-container' )
const content = (): Element | null => document.querySelector( '[contenteditable="true"]' )

const open = async (): Promise< void > => {
  renderWithClient( <NoteEditor value={ note } onChange={ vi.fn() } /> )
  await screen.findByRole( 'heading', { name: 'Key points' } )
}

beforeEach( () => {
  window.localStorage.clear()
} )

describe( 'NoteEditor dark mode', () => {
  it( 'is light by default', async () => {
    await open()

    expect( root() ).toHaveClass( 'noteEditor' )
    expect( root() ).not.toHaveClass( 'dark-theme' )
    expect( popups() ).not.toHaveClass( 'dark-theme' )
  } )

  it( 'gets the dark theme on the editor and its popups when the scheme is dark', async () => {
    mockMatchMedia( { isDark: true } )
    await open()

    expect( root() ).toHaveClass( 'dark-theme' )
    expect( popups() ).toHaveClass( 'dark-theme' )
    expect( popups() ).toHaveClass( 'noteEditor' )
  } )

  it( 'switches with the colour scheme without remounting the editor', async () => {
    const os = mockMatchMedia( { isDark: false } )
    await open()
    const before = content()
    const text = before?.textContent

    act( () => os.setDark( true ) )

    expect( root() ).toHaveClass( 'dark-theme' )
    expect( popups() ).toHaveClass( 'dark-theme' )
    expect( content() ).toBe( before )
    expect( content()?.textContent ).toBe( text )

    act( () => os.setDark( false ) )

    expect( root() ).not.toHaveClass( 'dark-theme' )
    expect( popups() ).not.toHaveClass( 'dark-theme' )
    expect( content() ).toBe( before )
  } )

  it( 'keeps exactly one popup container across switches', async () => {
    const os = mockMatchMedia( { isDark: false } )
    await open()

    act( () => os.setDark( true ) )
    act( () => os.setDark( false ) )

    expect( document.querySelectorAll( '.mdxeditor-popup-container' ) ).toHaveLength( 1 )
  } )
} )

// A popup is dark when it sits in the popup container and that container has the dark class.
const expectInPopups = ( popup: HTMLElement, isDark: boolean ): void => {
  expect( popup.closest( '.mdxeditor-popup-container' ) ).toBe( popups() )
  expect( popup.closest( '.dark-theme' ) !== null ).toBe( isDark )
}

const openBlockTypes = async ( isDark: boolean ): Promise< void > => {
  const user = userEvent.setup()

  await user.click( screen.getByRole( 'combobox', { name: 'Block type' } ) )
  expectInPopups( await screen.findByRole( 'listbox' ), isDark )
  await user.keyboard( '{Escape}' )
  await vi.waitFor( () => expect( screen.queryByRole( 'listbox' ) ).not.toBeInTheDocument() )
}

const selectWord = (): void => {
  const content = document.querySelector( '[contenteditable="true"]' ) as HTMLElement
  const walker = document.createTreeWalker( content, NodeFilter.SHOW_TEXT )
  let text: Node | null = null

  while( walker.nextNode() ) {
    if( walker.currentNode.textContent === 'First paragraph.' ) {
      text = walker.currentNode
      break
    }
  }

  const range = document.createRange()

  range.setStart( text as Node, 0 )
  range.setEnd( text as Node, 5 )
  content.focus()
  document.getSelection()?.removeAllRanges()
  document.getSelection()?.addRange( range )
  document.dispatchEvent( new Event( 'selectionchange' ) )
}

describe( 'NoteEditor popups after a colour switch', () => {
  it( 'opens the block type dropdown after light to dark and dark to light', async () => {
    const os = mockMatchMedia( { isDark: false } )
    await open()

    await openBlockTypes( false )
    act( () => os.setDark( true ) )
    await openBlockTypes( true )
    act( () => os.setDark( false ) )
    await openBlockTypes( false )
  } )

  it( 'opens the block type dropdown after several switches in a row', async () => {
    const os = mockMatchMedia( { isDark: false } )
    await open()

    for( const isDark of [ true, false, true, true, false, true ] ) {
      act( () => os.setDark( isDark ) )
      await openBlockTypes( isDark )
    }
  } )

  it( 'opens the link dialog after a switch, in the dark popup container', async () => {
    const os = mockMatchMedia( { isDark: false } )
    await open()

    act( () => os.setDark( true ) )
    selectWord()
    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Create link' } ) )

    expectInPopups( await screen.findByRole( 'dialog' ), true )
  } )

  it( 'keeps the dark class when the editor re-renders with a new value', async () => {
    function Harness(): ReactElement {
      const [ value, setValue ] = useState( note )

      return (
        <>
          <button type="button" onClick={ () => setValue( `${ note }\nA new line.\n` ) }>
            Change
          </button>
          <NoteEditor value={ value } onChange={ vi.fn() } />
        </>
      )
    }

    const os = mockMatchMedia( { isDark: false } )
    renderWithClient( <Harness /> )
    await screen.findByRole( 'heading', { name: 'Key points' } )

    act( () => os.setDark( true ) )
    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Change' } ) )
    await screen.findByText( 'A new line.' )

    expect( root() ).toHaveClass( 'dark-theme' )
    expect( popups() ).toHaveClass( 'dark-theme' )
    await openBlockTypes( true )
  } )
} )
