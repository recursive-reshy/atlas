// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { ThemisHome } from './ThemisHome'
import { renderWithClient } from '#src/test-support/renderWithClient'

describe( 'ThemisHome', () => {
  it( 'has the page heading', () => {
    renderWithClient( <ThemisHome /> )

    expect( screen.getByRole( 'heading', { name: 'Themis' } ) ).toBeInTheDocument()
  } )
} )
