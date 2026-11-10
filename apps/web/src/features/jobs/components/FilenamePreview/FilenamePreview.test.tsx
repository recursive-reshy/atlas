// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { FilenamePreview } from './FilenamePreview'

describe( 'FilenamePreview', () => {
  it( 'shows the vault path the note will get', () => {
    render( <FilenamePreview title="How Rust Works" folder="Mnemosyne" /> )

    expect( screen.getByText( 'Mnemosyne/How Rust Works.md' ) ).toBeInTheDocument()
  } )

  it( 'shows a nested folder', () => {
    render( <FilenamePreview title="What Is RAG: A Primer" folder="Learning/AI" /> )

    expect( screen.getByText( 'Learning/AI/What Is RAG A Primer.md' ) ).toBeInTheDocument()
  } )

  it( 'shows just the file name for the vault root', () => {
    render( <FilenamePreview title="How Rust Works" folder="" /> )

    expect( screen.getByText( 'How Rust Works.md' ) ).toBeInTheDocument()
  } )

  it( 'says "default folder" while the default is not known', () => {
    render( <FilenamePreview title="How Rust Works" folder={ null } /> )

    expect( screen.getByText( /in the default folder as/ ) ).toBeInTheDocument()
    expect( screen.getByText( 'How Rust Works.md' ) ).toBeInTheDocument()
  } )

  it( 'removes characters that are not allowed in a file name', () => {
    render( <FilenamePreview title={ 'What Is RAG: A Primer #1' } folder="Mnemosyne" /> )

    expect( screen.getByText( 'Mnemosyne/What Is RAG A Primer 1.md' ) ).toBeInTheDocument()
  } )

  it( 'falls back to Untitled for a blank title', () => {
    render( <FilenamePreview title="   " folder="Mnemosyne" /> )

    expect( screen.getByText( 'Mnemosyne/Untitled.md' ) ).toBeInTheDocument()
  } )

  it( 'updates when the title or the folder changes', () => {
    const { rerender } = render( <FilenamePreview title="One" folder="A" /> )

    rerender( <FilenamePreview title="Two" folder="B" /> )

    expect( screen.getByText( 'B/Two.md' ) ).toBeInTheDocument()
  } )
} )
