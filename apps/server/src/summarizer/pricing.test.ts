// Packages
import {
  describe,
  it,
  expect,
  vi,
} from 'vitest'
// Summarizer
import { SHIPPED_DEFAULT_MODEL } from './models.js'
import {
  MODEL_PRICES,
  PRICES_CHECKED_ON,
  estimateCostUsd,
  estimateGeminiCostUsd,
  GEMINI_PRICES,
} from './pricing.js'

describe( 'estimateCostUsd', () => {
  it( 'prices input and output tokens per million', () => {
    const [ model, price ] = Object.entries( MODEL_PRICES )[ 0 ] ?? [ '', { input: 0, output: 0 } ]

    expect( estimateCostUsd( model, 1_000_000, 0 ) ).toBeCloseTo( price.input, 10 )
    expect( estimateCostUsd( model, 0, 1_000_000 ) ).toBeCloseTo( price.output, 10 )
    expect( estimateCostUsd( model, 2_000_000, 500_000 ) )
      .toBeCloseTo( 2 * price.input + 0.5 * price.output, 10 )
  } )

  it( 'prices a typical summary of the default model', () => {
    const price = MODEL_PRICES[ SHIPPED_DEFAULT_MODEL ]

    expect( estimateCostUsd( SHIPPED_DEFAULT_MODEL, 31_200, 1_400 ) ).toBeCloseTo(
      ( 31_200 * ( price?.input ?? 0 ) + 1_400 * ( price?.output ?? 0 ) ) / 1_000_000,
      10,
    )
  } )

  it( 'returns 0 for zero tokens', () => {
    expect( estimateCostUsd( SHIPPED_DEFAULT_MODEL, 0, 0 ) ).toBe( 0 )
  } )

  it( 'returns null for a model that is not in the table', () => {
    expect( estimateCostUsd( 'claude-unknown-9', 1000, 1000 ) ).toBeNull()
  } )

  it( 'returns null when a token count is missing', () => {
    expect( estimateCostUsd( SHIPPED_DEFAULT_MODEL, null, 10 ) ).toBeNull()
    expect( estimateCostUsd( SHIPPED_DEFAULT_MODEL, 10, null ) ).toBeNull()
  } )
} )

describe( 'MODEL_PRICES', () => {
  it( 'prices the shipped default model', () => {
    expect( MODEL_PRICES[ SHIPPED_DEFAULT_MODEL ] ).toBeDefined()
  } )

  it.each( Object.entries( MODEL_PRICES ) )( 'has positive prices for %s', ( _model, price ) => {
    expect( price.input ).toBeGreaterThan( 0 )
    expect( price.output ).toBeGreaterThan( 0 )
    expect( Number.isFinite( price.input + price.output ) ).toBe( true )
  } )

  it( 'records the date the prices were checked', () => {
    expect( PRICES_CHECKED_ON ).toMatch( /^\d{4}-\d{2}-\d{2}$/ )
    expect( Number.isNaN( Date.parse( PRICES_CHECKED_ON ) ) ).toBe( false )
  } )
} )

describe( 'estimateGeminiCostUsd', () => {
  const before = new Date( '2026-12-31T23:59:59Z' )
  const after = new Date( '2027-01-01T00:00:00Z' )

  it( 'knows the current Flash model', () => {
    expect( GEMINI_PRICES[ 'gemini-3.8-flash' ] ).toHaveLength( 2 )
  } )

  it( 'prices input and output per million at the paid-tier rate until the end of 2026', () => {
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 1_000_000, 0, before ) ).toBe( 0.75 )
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 0, 1_000_000, before ) ).toBe( 3.75 )
  } )

  it( 'prices at the doubled rate from 2027-01-01, which Google\'s price list announces', () => {
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 1_000_000, 0, after ) ).toBe( 1.5 )
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 0, 1_000_000, after ) ).toBe( 7.5 )
  } )

  it( 'uses today\'s date when none is given', () => {
    vi.useFakeTimers()
    vi.setSystemTime( after )
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 1_000_000, 0 ) ).toBe( 1.5 )
    vi.setSystemTime( before )
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 1_000_000, 0 ) ).toBe( 0.75 )
    vi.useRealTimers()
  } )

  it( 'rounds to the millionth of a dollar', () => {
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 1, 1, before ) )
      .toBe( Math.round( 0.75 + 3.75 ) / 1_000_000 )
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 123_456, 7_890, before ) )
      .toBe( Math.round( 123_456 * 0.75 + 7_890 * 3.75 ) / 1_000_000 )
  } )

  it( 'returns 0 for no tokens', () => {
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 0, 0, before ) ).toBe( 0 )
  } )

  it( 'returns null for an unknown model or unknown tokens', () => {
    expect( estimateGeminiCostUsd( 'gemini-9-flash', 10, 10, before ) ).toBeNull()
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', null, 10, before ) ).toBeNull()
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 10, null, before ) ).toBeNull()
  } )
} )
