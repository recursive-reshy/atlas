// Testing Library
import { act, renderHook } from '@testing-library/react'
// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useDebouncedValue } from './useDebouncedValue'

beforeEach( () => {
  vi.useFakeTimers()
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'useDebouncedValue', () => {
  it( 'starts with the value it is given', () => {
    const { result } = renderHook( () => useDebouncedValue( 'first', 300 ) )

    expect( result.current ).toBe( 'first' )
  } )

  it( 'follows a change 300 ms after the last one', async () => {
    const { result, rerender } = renderHook(
      ( { value } ) => useDebouncedValue( value, 300 ),
      { initialProps: { value: 'a' } },
    )

    rerender( { value: 'b' } )
    await act( () => vi.advanceTimersByTimeAsync( 200 ) )
    rerender( { value: 'c' } )
    await act( () => vi.advanceTimersByTimeAsync( 299 ) )

    expect( result.current ).toBe( 'a' )

    await act( () => vi.advanceTimersByTimeAsync( 1 ) )

    expect( result.current ).toBe( 'c' )
  } )
} )
