// Testing Library
import { render, screen } from '@testing-library/react'
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
import { NoteEditor } from './NoteEditor'

const note = noteFixtures[ '0.2.0 summary with YouTube timestamp links' ] ?? ''

const sourceText = (): string => document.querySelector( '.cm-content' )?.textContent ?? ''

const toggle = async ( name: 'Source mode' | 'Rich text' ): Promise< void > => {
  await userEvent.setup().click( screen.getByRole( 'button', { name } ) )
}

describe( 'NoteEditor', () => {
  it( 'opens in rich text, without showing the front-matter', async () => {
    render( <NoteEditor value={ note } onChange={ vi.fn() } /> )

    expect( await screen.findByRole( 'heading', { name: 'Key points' } ) ).toBeInTheDocument()
    expect( screen.queryByText( /title: "How Transformers Work"/ ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
  } )

  it( 'switches to source mode showing the whole note, and reports the mode', async () => {
    const onModeChange = vi.fn()
    render( <NoteEditor value={ note } onChange={ vi.fn() } onModeChange={ onModeChange } /> )
    await screen.findByRole( 'heading', { name: 'Key points' } )

    await toggle( 'Source mode' )

    expect( onModeChange ).toHaveBeenLastCalledWith( 'source' )
    expect( sourceText() ).toContain( 'title: "How Transformers Work"' )
    expect( sourceText() ).toContain( '- Ownership is central ([12:34](https://youtu.be/abc123?t=754))' )
  } )

  it( 'goes back to rich text and keeps the note unchanged', async () => {
    const onChange = vi.fn()
    const onModeChange = vi.fn()
    render( <NoteEditor value={ note } onChange={ onChange } onModeChange={ onModeChange } /> )
    await screen.findByRole( 'heading', { name: 'Key points' } )

    await toggle( 'Source mode' )
    const before = sourceText()
    await toggle( 'Rich text' )
    await toggle( 'Source mode' )

    expect( onModeChange ).toHaveBeenCalledWith( 'rich-text' )
    expect( sourceText() ).toBe( before )
    for( const call of onChange.mock.calls ) {
      expect( call[ 0 ] ).toBe( note )
    }
  } )

  it( 'applies a new value prop that differs from what the editor holds', async () => {
    const { rerender } = render( <NoteEditor value={ note } onChange={ vi.fn() } /> )
    await screen.findByRole( 'heading', { name: 'Key points' } )
    const next = note.replace( '## Key points', '## Main ideas' )

    rerender( <NoteEditor value={ next } onChange={ vi.fn() } /> )

    expect( await screen.findByRole( 'heading', { name: 'Main ideas' } ) ).toBeInTheDocument()
  } )

  it( 'reports source edits as the whole note with exactly one trailing newline', async () => {
    const onChange = vi.fn()
    render( <NoteEditor value={ note } onChange={ onChange } /> )
    await screen.findByRole( 'heading', { name: 'Key points' } )
    await toggle( 'Source mode' )
    const user = userEvent.setup()

    await user.click( document.querySelector( '.cm-content' ) as HTMLElement )
    await user.keyboard( '{Control>}{End}{/Control}{Enter}{Enter}' )

    expect( onChange ).toHaveBeenCalled()
    for( const [ markdown ] of onChange.mock.calls as [ string ][] ) {
      expect( markdown.startsWith( '---\ntitle: "How Transformers Work"' ) ).toBe( true )
      expect( markdown.endsWith( '\n' ) ).toBe( true )
      expect( markdown.endsWith( '\n\n' ) ).toBe( false )
    }
  } )

  it( 'does not report the normalization of the note it was opened with', async () => {
    const onChange = vi.fn()
    const starred = noteFixtures[ 'star bullets' ] ?? ''
    render( <NoteEditor value={ starred } onChange={ onChange } /> )

    await screen.findByRole( 'heading', { name: 'Key points' } )

    expect( onChange ).not.toHaveBeenCalled()
  } )

  it( 'stays in source mode and says why when the front-matter does not parse', async () => {
    const onModeChange = vi.fn()
    render( <NoteEditor value={ note } onChange={ vi.fn() } onModeChange={ onModeChange } /> )
    await screen.findByRole( 'heading', { name: 'Key points' } )
    await toggle( 'Source mode' )
    const user = userEvent.setup()
    await user.click( document.querySelector( '.cm-content' ) as HTMLElement )
    await user.keyboard( '{Control>}a{/Control}---{Enter}title: a: b{Enter}---{Enter}{Enter}Body' )

    await toggle( 'Rich text' )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Fix the front-matter' )
    expect( onModeChange ).toHaveBeenLastCalledWith( 'source' )
    expect( sourceText() ).toContain( 'title: a: b' )
  } )
} )
