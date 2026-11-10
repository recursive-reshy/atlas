// React
import { createRef } from 'react'
// Packages
import { MDXEditor } from '@mdxeditor/editor'
import type { MDXEditorMethods } from '@mdxeditor/editor'
// Testing Library
import { render } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { noteFixtures } from '#src/test-support/noteFixtures'
import { noteEditorPlugins, noteMarkdownOptions } from './editorConfig'

const exportOnce = async ( markdown: string ): Promise< string > => {
  const ref = createRef< MDXEditorMethods >()
  const onError = vi.fn()
  const { unmount } = render(
    <MDXEditor
      ref={ ref }
      markdown={ markdown }
      onError={ onError }
      plugins={ noteEditorPlugins() }
      toMarkdownOptions={ noteMarkdownOptions }
    />,
  )

  await vi.waitFor( () => expect( ref.current ).not.toBeNull() )
  const exported = ref.current?.getMarkdown() ?? ''
  unmount()

  // On an import error MDXEditor echoes the input back, which would pass every comparison.
  expect( onError ).not.toHaveBeenCalled()

  return `${ exported.replace( /\n+$/, '' ) }\n`
}

const entries = Object.entries( noteFixtures )

describe( 'MDXEditor round-trip of notes (ADR 0023)', () => {
  it.each( entries )( 'is idempotent: %s', async ( _name, note ) => {
    const once = await exportOnce( note )
    const twice = await exportOnce( once )

    expect( twice ).toBe( once )
  } )

  const normalised = [ 'star bullets', 'bold around a link' ]

  it.each( entries.filter( ( [ name ] ) => !normalised.includes( name ) ) )(
    'keeps %s exactly, apart from the final newline',
    async ( _name, note ) => {
      expect( await exportOnce( note ) ).toBe( note )
    },
  )

  it( 'normalizes * bullets to - and nothing else', async () => {
    const note = noteFixtures[ 'star bullets' ] ?? ''

    expect( await exportOnce( note ) ).toBe( note.replaceAll( '* ', '- ' ) )
  } )

  it( 'normalizes bold around a link to link around bold, once (ADR 0026)', async () => {
    const note = noteFixtures[ 'bold around a link' ] ?? ''
    const once = await exportOnce( note )

    expect( once ).toBe( note.replace( '**[the guide](https://example.com/guide)**', '[**the guide**](https://example.com/guide)' ) )
    expect( await exportOnce( once ) ).toBe( once )
  } )

  it( 'keeps wikilinks and both timestamp forms byte for byte', async () => {
    const wikilinks = await exportOnce( noteFixtures[ 'wikilinks and aliases' ] ?? '' )
    const plain = await exportOnce( noteFixtures[ 'summary with plain timestamps' ] ?? '' )
    const youtube = await exportOnce(
      noteFixtures[ '0.2.0 summary with YouTube timestamp links' ] ?? '',
    )

    expect( wikilinks ).toContain( '[[Borrow Checker|the borrow checker]]' )
    expect( wikilinks ).toContain( '**bold [[Inside Bold]]**' )
    expect( plain ).toContain( '- Borrowing follows (1:05:20)' )
    expect( youtube ).toContain( '([12:34](https://youtu.be/abc123?t=754))' )
  } )

  it( 'still escapes brackets that are not wikilinks', async () => {
    const note = noteFixtures[ 'rule, inline code and a code block' ] ?? ''
    const changed = note.replace( 'Use `cargo build` here.', 'A [lone] bracket and [[ open.' )

    const exported = await exportOnce( changed )

    expect( exported ).toContain( 'A \\[lone] bracket and \\[\\[ open.' )
  } )
} )
