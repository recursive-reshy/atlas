// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { FeedChip } from './FeedChip'

describe( 'FeedChip', () => {
  it( 'shows the feed name with a feed icon', () => {
    renderWithClient( <FeedChip name="Example Blog" /> )

    expect( screen.getByText( 'Example Blog' ) ).toBeInTheDocument()
    expect( screen.getByTestId( 'RssFeedIcon' ) ).toBeInTheDocument()
  } )
} )
