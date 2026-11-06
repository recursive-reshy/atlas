// Packages
import { describe, it, expect } from 'vitest'
// Transcript
import { TranscriptMeta } from './transcript.js'

const validMeta = {
  title: 'A talk',
  source: 'https://www.youtube.com/watch?v=abc',
  channel: 'Some Channel',
  duration_seconds: 120,
  transcribed_at: '2026-10-14T10:00:00.000Z',
  model: 'large-v3',
}

describe( 'TranscriptMeta', () => {
  it( 'accepts valid metadata', () => {
    expect( TranscriptMeta.safeParse( validMeta ).success ).toBe( true )
  } )

  it( 'rejects an empty title', () => {
    expect( TranscriptMeta.safeParse( { ...validMeta, title: '' } ).success ).toBe( false )
  } )

  it( 'rejects a non-URL source', () => {
    expect( TranscriptMeta.safeParse( { ...validMeta, source: 'nope' } ).success ).toBe( false )
  } )

  it( 'rejects a negative duration_seconds', () => {
    const result = TranscriptMeta.safeParse( { ...validMeta, duration_seconds: -1 } )

    expect( result.success ).toBe( false )
  } )

  it( 'rejects a non-integer duration_seconds', () => {
    const result = TranscriptMeta.safeParse( { ...validMeta, duration_seconds: 1.5 } )

    expect( result.success ).toBe( false )
  } )

  it( 'rejects a non-ISO transcribed_at', () => {
    const result = TranscriptMeta.safeParse( { ...validMeta, transcribed_at: 'today' } )

    expect( result.success ).toBe( false )
  } )

  it( 'accepts truncated as an optional flag', () => {
    expect( TranscriptMeta.parse( validMeta ).truncated ).toBeUndefined()
    expect( TranscriptMeta.parse( { ...validMeta, truncated: true } ).truncated ).toBe( true )
    expect( TranscriptMeta.safeParse( { ...validMeta, truncated: 'yes' } ).success ).toBe( false )
  } )

  it( 'rejects an empty model', () => {
    expect( TranscriptMeta.safeParse( { ...validMeta, model: '' } ).success ).toBe( false )
  } )
} )
