// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { GmailSourceChip } from './GmailSourceChip'

describe( 'GmailSourceChip', () => {
  it( 'shows the source name with a mail icon', () => {
    renderWithClient( <GmailSourceChip name="Substacks" /> )

    expect( screen.getByText( 'Substacks' ) ).toBeInTheDocument()
    expect( screen.getByTestId( 'MailOutlinedIcon' ) ).toBeInTheDocument()
  } )
} )
