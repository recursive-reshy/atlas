// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { OBSIDIAN_URL } from '#src/features/melete/fixtures/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ReferenceAnswer } from './ReferenceAnswer'

const ANSWER = 'It stands for a type chosen by the caller.'
const PASSAGE = 'A type parameter is a placeholder for a type.'

describe( 'ReferenceAnswer', () => {
  it( 'shows the answer and an Obsidian link', () => {
    renderWithClient(
      <ReferenceAnswer answer={ ANSWER } passage="" obsidianUrl={ OBSIDIAN_URL } />,
    )

    expect( screen.getByText( ANSWER ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Open in Obsidian' } ) )
      .toHaveAttribute( 'href', OBSIDIAN_URL )
  } )

  it( 'leaves out the link and the passage when there are none', () => {
    renderWithClient( <ReferenceAnswer answer={ ANSWER } passage="" obsidianUrl={ null } /> )

    expect( screen.queryByRole( 'link', { name: 'Open in Obsidian' } ) ).not.toBeInTheDocument()
    expect( screen.queryByText( 'Passage from the note' ) ).not.toBeInTheDocument()
  } )

  it( 'keeps the passage folded until it is opened', async () => {
    renderWithClient(
      <ReferenceAnswer answer={ ANSWER } passage={ PASSAGE } obsidianUrl={ null } />,
    )
    const toggle = screen.getByRole( 'button', { name: 'Passage from the note' } )

    expect( toggle ).toHaveAttribute( 'aria-expanded', 'false' )
    await userEvent.click( toggle )

    expect( toggle ).toHaveAttribute( 'aria-expanded', 'true' )
    expect( screen.getByText( PASSAGE ) ).toBeVisible()
  } )
} )
