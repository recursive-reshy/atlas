// Packages
import { describe, it, expect } from 'vitest'
// Summarizer
import { SHIPPED_DEFAULT_MODEL } from './models.js'
import {
  MODEL_PRICES,
  PRICES_CHECKED_ON,
  estimateCostUsd,
  estimateTranscriptionCostUsd,
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

describe( 'estimateTranscriptionCostUsd', () => {
  it( 'prices gpt-transcribe per minute of audio', () => {
    expect( estimateTranscriptionCostUsd( 'gpt-transcribe', 3600 ) ).toBeCloseTo( 0.27, 10 )
    expect( estimateTranscriptionCostUsd( 'gpt-transcribe', 90 ) ).toBeCloseTo( 0.00675, 10 )
  } )

  it( 'returns 0 for no audio', () => {
    expect( estimateTranscriptionCostUsd( 'gpt-transcribe', 0 ) ).toBe( 0 )
  } )

  it( 'returns null for a model that is not in the table', () => {
    expect( estimateTranscriptionCostUsd( 'whisper-1', 60 ) ).toBeNull()
  } )
} )

describe( 'estimateGeminiCostUsd', () => {
  const price = GEMINI_PRICES[ 'gemini-3.8-flash' ]

  it( 'knows the current Flash model', () => {
    expect( price ).toBeDefined()
  } )

  it( 'prices input and output tokens per million', () => {
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 1_000_000, 0 ) ).toBe( price?.input )
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 0, 1_000_000 ) ).toBe( price?.output )
  } )

  it( 'rounds to the millionth of a dollar', () => {
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 1, 1 ) )
      .toBe( Math.round( ( ( price?.input ?? 0 ) + ( price?.output ?? 0 ) ) ) / 1_000_000 )
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 123_456, 7_890 ) )
      .toBe( Math.round(
        123_456 * ( price?.input ?? 0 ) + 7_890 * ( price?.output ?? 0 ),
      ) / 1_000_000 )
  } )

  it( 'returns 0 for no tokens', () => {
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 0, 0 ) ).toBe( 0 )
  } )

  it( 'returns null for an unknown model or unknown tokens', () => {
    expect( estimateGeminiCostUsd( 'gemini-9-flash', 10, 10 ) ).toBeNull()
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', null, 10 ) ).toBeNull()
    expect( estimateGeminiCostUsd( 'gemini-3.8-flash', 10, null ) ).toBeNull()
  } )
} )
