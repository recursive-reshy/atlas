// Shared
import type { LinkUsageSummary, SummaryUsage } from '@atlas/shared'

const SMALL_COST_USD = 0.01

const formatTokens = ( count: number ): string => `${ ( count / 1000 ).toFixed( 1 ) }k`

const formatCost = ( usd: number ): string => {
  return `~US$${ usd.toFixed( usd < SMALL_COST_USD ? 3 : 2 ) }`
}

const formatTokenPair = ( input: number | null, output: number | null ): string[] => {
  return input !== null && output !== null
    ? [ `${ formatTokens( input ) } in / ${ formatTokens( output ) } out` ]
    : []
}

const formatAttempts = ( runCount: number, totalCost: number | null ): string | null => {
  const total = totalCost === null ? '' : `, ${ formatCost( totalCost ) } total`

  return runCount > 1 ? `${ runCount } attempts${ total }` : null
}

export interface SummaryInfoText {
  line: string
  attempts: string | null
}

export const formatSummaryInfo = (
  { last_run: last, run_count: runCount, total_cost_usd: totalCost }: SummaryUsage,
  modelName: string,
): SummaryInfoText => {
  const parts = [ modelName, `${ last.profile_name } v${ last.prompt_version }` ]

  parts.push( ...formatTokenPair( last.input_tokens, last.output_tokens ) )

  if( last.cost_usd !== null ) {
    parts.push( formatCost( last.cost_usd ) )
  }

  if( last.outcome === 'failed' ) {
    parts.unshift( 'Last attempt failed' )
  }

  return { line: parts.join( ' · ' ), attempts: formatAttempts( runCount, totalCost ) }
}

export const formatLinkInfo = (
  { last_run: last, run_count: runCount, total_cost_usd: totalCost }: LinkUsageSummary,
  modelName: string,
): SummaryInfoText => {
  const parts = [ modelName, `prompt v${ last.prompt_version }` ]

  if( last.tool_calls !== null ) {
    parts.push( `${ last.tool_calls } tool ${ last.tool_calls === 1 ? 'call' : 'calls' }` )
  }

  parts.push( ...formatTokenPair( last.input_tokens, last.output_tokens ) )

  if( last.cost_usd !== null ) {
    parts.push( formatCost( last.cost_usd ) )
  }

  parts.unshift( last.outcome === 'failed' ? 'Linking (last attempt failed)' : 'Linking' )

  return { line: parts.join( ' · ' ), attempts: formatAttempts( runCount, totalCost ) }
}
