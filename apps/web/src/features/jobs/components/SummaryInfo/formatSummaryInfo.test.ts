// Shared
import type {
  LinkRun,
  LinkUsageSummary,
  SummaryRun,
  SummaryUsage,
} from '@atlas/shared'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { BUSINESS_ID } from '#src/features/jobs/fixtures/summarizer.fixture'
import { formatLinkInfo, formatSummaryInfo } from './formatSummaryInfo'

const run = ( overrides: Partial< SummaryRun > = {} ): SummaryRun => ( {
  model: 'claude-sonnet-5-5',
  profile_id: BUSINESS_ID,
  profile_name: 'Business ideas',
  prompt_version: 3,
  input_tokens: 31_200,
  output_tokens: 1_400,
  cost_usd: 0.1243,
  outcome: 'succeeded',
  created_at: '2026-10-17T10:00:00.000Z',
  ...overrides,
} )

const usage = ( overrides: Partial< SummaryUsage > = {} ): SummaryUsage => ( {
  last_run: run(),
  run_count: 1,
  total_input_tokens: 31_200,
  total_output_tokens: 1_400,
  total_cost_usd: 0.1243,
  ...overrides,
} )

describe( 'formatSummaryInfo, the line for the latest attempt', () => {
  it( 'joins model, profile and version, tokens and cost', () => {
    expect( formatSummaryInfo( usage(), 'Claude Sonnet 5.5' ).line )
      .toBe( 'Claude Sonnet 5.5 · Business ideas v3 · 31.2k in / 1.4k out · ~US$0.12' )
  } )

  it.each( [
    [ 0, '0.0k' ],
    [ 949, '0.9k' ],
    [ 1_000, '1.0k' ],
    [ 31_249, '31.2k' ],
    [ 1_234_567, '1234.6k' ],
  ] )( 'writes %i tokens as %s', ( tokens, text ) => {
    const line = formatSummaryInfo(
      usage( { last_run: run( { input_tokens: tokens, output_tokens: tokens } ) } ),
      'M',
    ).line

    expect( line ).toContain( `${ text } in / ${ text } out` )
  } )

  it.each( [
    [ 0.1243, '~US$0.12' ],
    [ 0.126, '~US$0.13' ],
    [ 0.01, '~US$0.01' ],
    [ 0.0049, '~US$0.005' ],
    [ 0.0004, '~US$0.000' ],
    [ 12.5, '~US$12.50' ],
  ] )( 'writes the cost %f as %s', ( cost, text ) => {
    expect( formatSummaryInfo( usage( { last_run: run( { cost_usd: cost } ) } ), 'M' ).line )
      .toMatch( new RegExp( `${ text.replace( '$', '\\$' ).replace( '~', '~' ) }$` ) )
  } )

  it( 'leaves out the cost when the model has no price', () => {
    const { line } = formatSummaryInfo( usage( { last_run: run( { cost_usd: null } ) } ), 'M' )

    expect( line ).toBe( 'M · Business ideas v3 · 31.2k in / 1.4k out' )
  } )

  it( 'leaves out the tokens when none were recorded', () => {
    const last = run( { input_tokens: null, output_tokens: null, cost_usd: null } )

    expect( formatSummaryInfo( usage( { last_run: last } ), 'M' ).line )
      .toBe( 'M · Business ideas v3' )
  } )

  it( 'says when the latest attempt failed', () => {
    const { line } = formatSummaryInfo(
      usage( { last_run: run( { outcome: 'failed' } ) } ),
      'M',
    )

    expect( line )
      .toBe( 'Last attempt failed · M · Business ideas v3 · 31.2k in / 1.4k out · ~US$0.12' )
  } )
} )

describe( 'formatSummaryInfo, the attempts line', () => {
  it( 'is absent for a single attempt', () => {
    expect( formatSummaryInfo( usage(), 'M' ).attempts ).toBeNull()
  } )

  it( 'gives the count and the total for several attempts', () => {
    expect( formatSummaryInfo( usage( { run_count: 3, total_cost_usd: 0.3141 } ), 'M' ).attempts )
      .toBe( '3 attempts, ~US$0.31 total' )
  } )

  it( 'gives only the count when the total cost is unknown', () => {
    expect( formatSummaryInfo( usage( { run_count: 2, total_cost_usd: null } ), 'M' ).attempts )
      .toBe( '2 attempts' )
  } )
} )

const linkRun = ( overrides: Partial< LinkRun > = {} ): LinkRun => ( {
  model: 'claude-haiku-5-5',
  prompt_version: 2,
  input_tokens: 12_000,
  output_tokens: 800,
  cache_read_input_tokens: 9_000,
  cache_creation_input_tokens: 0,
  tool_calls: 6,
  cost_usd: 0.0132,
  outcome: 'succeeded',
  created_at: '2026-10-17T10:00:00.000Z',
  ...overrides,
} )

const linkUsage = ( overrides: Partial< LinkUsageSummary > = {} ): LinkUsageSummary => ( {
  last_run: linkRun(),
  run_count: 1,
  total_input_tokens: 12_000,
  total_output_tokens: 800,
  total_cost_usd: 0.0132,
  ...overrides,
} )

describe( 'formatLinkInfo, the line for the latest linking run', () => {
  it( 'joins model, prompt version, tool calls, tokens and cost', () => {
    expect( formatLinkInfo( linkUsage(), 'Claude Haiku 5.5' ).line ).toBe(
      'Linking · Claude Haiku 5.5 · prompt v2 · 6 tool calls · 12.0k in / 0.8k out · ~US$0.01',
    )
  } )

  it( 'writes one tool call in the singular', () => {
    const { line } = formatLinkInfo( linkUsage( { last_run: linkRun( { tool_calls: 1 } ) } ), 'M' )

    expect( line ).toContain( '1 tool call ·' )
  } )

  it( 'leaves out the cost when the model has no price (tokens only)', () => {
    const { line } = formatLinkInfo( linkUsage( { last_run: linkRun( { cost_usd: null } ) } ), 'M' )

    expect( line ).toBe( 'Linking · M · prompt v2 · 6 tool calls · 12.0k in / 0.8k out' )
  } )

  it( 'leaves out tool calls and tokens when none were recorded', () => {
    const last = linkRun( {
      tool_calls: null,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    } )

    expect( formatLinkInfo( linkUsage( { last_run: last } ), 'M' ).line )
      .toBe( 'Linking · M · prompt v2' )
  } )

  it( 'says when the latest run failed', () => {
    const { line } = formatLinkInfo(
      linkUsage( { last_run: linkRun( { outcome: 'failed' } ) } ),
      'M',
    )

    expect( line.startsWith( 'Linking (last attempt failed) · M · prompt v2' ) ).toBe( true )
  } )

  it( 'has no attempts line for a single run', () => {
    expect( formatLinkInfo( linkUsage(), 'M' ).attempts ).toBeNull()
  } )

  it( 'gives the count and the total for several runs', () => {
    expect( formatLinkInfo( linkUsage( { run_count: 3, total_cost_usd: 0.04 } ), 'M' ).attempts )
      .toBe( '3 attempts, ~US$0.04 total' )
  } )

  it( 'gives only the count when the total cost is unknown', () => {
    expect( formatLinkInfo( linkUsage( { run_count: 2, total_cost_usd: null } ), 'M' ).attempts )
      .toBe( '2 attempts' )
  } )
} )
