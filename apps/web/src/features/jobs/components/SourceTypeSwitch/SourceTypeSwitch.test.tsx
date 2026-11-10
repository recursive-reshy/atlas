// Testing Library
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { SourceTypeSwitch } from './SourceTypeSwitch'

describe( 'SourceTypeSwitch', () => {
  it( 'is a group named Source type with Video and Article', () => {
    render( <SourceTypeSwitch value="video" onChange={ vi.fn() } /> )

    expect( screen.getByRole( 'group', { name: 'Source type' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Video' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
    expect( screen.getByRole( 'button', { name: 'Article' } ) )
      .toHaveAttribute( 'aria-pressed', 'false' )
  } )

  it( 'marks the value it is given', () => {
    render( <SourceTypeSwitch value="article" onChange={ vi.fn() } /> )

    expect( screen.getByRole( 'button', { name: 'Article' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
  } )

  it( 'reports the other choice when clicked', async () => {
    const onChange = vi.fn()
    render( <SourceTypeSwitch value="video" onChange={ onChange } /> )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Article' } ) )

    expect( onChange ).toHaveBeenCalledExactlyOnceWith( 'article' )
  } )

  it( 'does not report a click on the current choice', async () => {
    const onChange = vi.fn()
    render( <SourceTypeSwitch value="video" onChange={ onChange } /> )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Video' } ) )

    expect( onChange ).not.toHaveBeenCalled()
  } )

  it( 'can be disabled', () => {
    render( <SourceTypeSwitch value="video" onChange={ vi.fn() } disabled /> )

    expect( screen.getByRole( 'button', { name: 'Article' } ) ).toBeDisabled()
  } )
} )
