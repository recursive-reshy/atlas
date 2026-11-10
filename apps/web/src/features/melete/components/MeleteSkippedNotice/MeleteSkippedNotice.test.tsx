// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { MeleteSkippedNotice } from './MeleteSkippedNotice'

describe( 'MeleteSkippedNotice', () => {
  it( 'shows nothing when every folder could be read', () => {
    renderWithClient( <MeleteSkippedNotice paths={ [] } /> )

    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
  } )

  it( 'names the one path in a warning', () => {
    renderWithClient( <MeleteSkippedNotice paths={ [ 'Learning/Locked' ] } /> )

    const alert = screen.getByRole( 'alert' )

    expect( alert ).toHaveTextContent( 'Melete couldn\'t read 1 folder or note in your vault' )
    expect( screen.getByText( 'Learning/Locked' ) ).toBeInTheDocument()
  } )

  it( 'lists up to five paths without a toggle', () => {
    const paths = [ 'A', 'B', 'C', 'D', 'E' ].map( ( name ) => `Learning/${ name }` )
    renderWithClient( <MeleteSkippedNotice paths={ paths } /> )

    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'Melete couldn\'t read 5 folders or notes in your vault' )
    expect( screen.getAllByRole( 'listitem' ) ).toHaveLength( 5 )
    expect( screen.queryByRole( 'button', { name: 'Show' } ) ).not.toBeInTheDocument()
  } )

  it( 'folds more than five behind Show', async () => {
    const user = userEvent.setup()
    const paths = [ 'A', 'B', 'C', 'D', 'E', 'F' ].map( ( name ) => `Learning/${ name }` )
    renderWithClient( <MeleteSkippedNotice paths={ paths } /> )

    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'Melete couldn\'t read 6 folders or notes in your vault' )
    expect( screen.queryByRole( 'listitem' ) ).not.toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Show' } ) )

    expect( screen.getAllByRole( 'listitem' ) ).toHaveLength( 6 )

    await user.click( screen.getByRole( 'button', { name: 'Hide' } ) )

    expect( screen.queryByRole( 'listitem' ) ).not.toBeInTheDocument()
  } )
} )
