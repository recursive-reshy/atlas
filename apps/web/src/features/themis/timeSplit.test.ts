// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { timeSplitCaption } from './timeSplit'

describe( 'timeSplitCaption', () => {
  it( 'names measured and logged time', () => {
    expect( timeSplitCaption( { measured: 5400, logged: 1800, calendar: 0 } ) )
      .toBe( '1 h 30 min measured · 30 min logged' )
  } )

  it( 'adds calendar time when there is some', () => {
    expect( timeSplitCaption( { measured: 3600, logged: 1800, calendar: 1800 } ) )
      .toBe( '1 h measured · 30 min logged · 30 min calendar' )
  } )

  it( 'says zero for the parts with no time, except calendar', () => {
    expect( timeSplitCaption( { measured: 0, logged: 0, calendar: 0 } ) )
      .toBe( '0 min measured · 0 min logged' )
  } )
} )
