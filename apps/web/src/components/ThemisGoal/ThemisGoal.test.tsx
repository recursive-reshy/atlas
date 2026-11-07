// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { ThemisGoal } from './ThemisGoal'
import { renderWithClient } from '#src/test-support/renderWithClient'

describe( 'ThemisGoal', () => {
  it( 'has the page heading', () => {
    renderWithClient( <ThemisGoal /> )

    expect( screen.getByRole( 'heading', { name: 'Goal' } ) ).toBeInTheDocument()
  } )
} )
