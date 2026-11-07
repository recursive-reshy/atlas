// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { TimeBar } from './TimeBar'

describe( 'TimeBar', () => {
  it( 'draws measured and logged as shares of the bar', () => {
    render( <TimeBar measured={ 5400 } logged={ 1800 } scale={ 1 } /> )

    expect( screen.getByRole( 'img', { name: 'Measured 75%' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'img', { name: 'Logged 25%' } ) ).toBeInTheDocument()
  } )

  it( 'leaves out a part with no time', () => {
    render( <TimeBar measured={ 600 } logged={ 0 } scale={ 1 } /> )

    expect( screen.getByRole( 'img', { name: 'Measured 100%' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'img', { name: /Logged/ } ) ).not.toBeInTheDocument()
  } )

  it( 'draws nothing when there is no time at all', () => {
    render( <TimeBar measured={ 0 } logged={ 0 } scale={ 0 } /> )

    expect( screen.queryByRole( 'img' ) ).not.toBeInTheDocument()
  } )

  it( 'sizes the whole bar by the scale', () => {
    render( <TimeBar measured={ 600 } logged={ 600 } scale={ 0.5 } /> )

    expect( screen.getByTestId( 'time-bar' ) ).toHaveStyle( { width: '50%' } )
  } )
} )
