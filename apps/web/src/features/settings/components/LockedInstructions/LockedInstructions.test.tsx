// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { LockedInstructions } from './LockedInstructions'

const text = 'You summarize the transcript of a video.\n\nYour output has four parts:'

describe( 'LockedInstructions with a title', () => {
  it( 'uses the title given for the accordion', () => {
    renderWithClient( <LockedInstructions title="Instructions for articles" text={ text } /> )

    expect( screen.getByRole( 'button', { name: 'Instructions for articles' } ) )
      .toHaveAttribute( 'aria-expanded', 'false' )
  } )
} )

describe( 'LockedInstructions', () => {
  it( 'is a collapsed accordion with a clear title', () => {
    renderWithClient( <LockedInstructions text={ text } /> )

    expect( screen.getByRole( 'button', { name: 'Instructions the app always sends' } ) )
      .toHaveAttribute( 'aria-expanded', 'false' )
  } )

  it( 'shows the text read-only once expanded', async () => {
    const user = userEvent.setup()
    renderWithClient( <LockedInstructions text={ text } /> )

    await user.click( screen.getByRole( 'button', { name: 'Instructions the app always sends' } ) )

    expect( screen.getByText( /Your output has four parts/ ) ).toBeVisible()
    expect( screen.queryByRole( 'textbox' ) ).not.toBeInTheDocument()
  } )

  it( 'explains that the guidance sits on top of it', async () => {
    const user = userEvent.setup()
    renderWithClient( <LockedInstructions text={ text } /> )

    await user.click( screen.getByRole( 'button', { name: 'Instructions the app always sends' } ) )

    expect( screen.getByText( /cannot be edited/i ) ).toBeVisible()
  } )
} )
