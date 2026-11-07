// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { overviewFixture } from '#src/test-support/themis.fixture'
import { AreaSection } from './AreaSection'

const [ career, financial ] = overviewFixture().areas

describe( 'AreaSection', () => {
  it( 'is a region named by the area, with its goal cards', () => {
    renderWithClient( <AreaSection area={ financial } onEdit={ vi.fn() } onAddGoal={ vi.fn() } /> )

    expect( screen.getByRole( 'region', { name: 'Financial' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'Emergency fund' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Time with family' ) ).toBeInTheDocument()
  } )

  it( 'says so when the area has no active goal', () => {
    renderWithClient(
      <AreaSection area={ { ...career, goals: [] } } onEdit={ vi.fn() } onAddGoal={ vi.fn() } />,
    )

    expect( screen.getByText( 'No active goals' ) ).toBeInTheDocument()
  } )

  it( 'opens the area for editing', async () => {
    const onEdit = vi.fn()

    renderWithClient( <AreaSection area={ career } onEdit={ onEdit } onAddGoal={ vi.fn() } /> )
    await userEvent.click( screen.getByRole( 'button', { name: 'Edit area Career' } ) )

    expect( onEdit ).toHaveBeenCalledWith( { id: career.id, name: 'Career' } )
  } )

  it( 'starts a goal in this area', async () => {
    const onAddGoal = vi.fn()

    renderWithClient( <AreaSection area={ career } onEdit={ vi.fn() } onAddGoal={ onAddGoal } /> )
    await userEvent.click( screen.getByRole( 'button', { name: 'Add goal to Career' } ) )

    expect( onAddGoal ).toHaveBeenCalledWith( career.id )
  } )
} )
