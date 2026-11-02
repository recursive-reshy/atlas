// Packages
import { z } from 'zod'
// Shared
import { LinkRun, LinkUsageSummary } from '@atlas/shared'
// Repositories
import { getDatabase } from './database.js'

export const LinkRunRecord = z.object( {
  job_id: z.string(),
  model: z.string(),
  prompt_version_id: z.int(),
  input_tokens: z.int().nullable(),
  output_tokens: z.int().nullable(),
  cache_read_input_tokens: z.int().nullable(),
  cache_creation_input_tokens: z.int().nullable(),
  tool_calls: z.int().nullable(),
  cost_usd: z.number().nullable(),
  outcome: z.enum( [ 'succeeded', 'failed' ] ),
  error: z.string().nullable(),
  created_at: z.string(),
} )
export type LinkRunRecord = z.infer< typeof LinkRunRecord >

const StoredLinkRun = LinkRunRecord.extend( { id: z.int() } )

export const insertLinkRun = ( userId: string, run: LinkRunRecord ): number => {
  const { lastInsertRowid } = getDatabase()
    .prepare( `INSERT INTO link_runs (
        user_id, job_id, model, prompt_version_id, input_tokens, output_tokens,
        cache_read_input_tokens, cache_creation_input_tokens, tool_calls, cost_usd,
        outcome, error, created_at
      ) VALUES (
        @user_id, @job_id, @model, @prompt_version_id, @input_tokens, @output_tokens,
        @cache_read_input_tokens, @cache_creation_input_tokens, @tool_calls, @cost_usd,
        @outcome, @error, @created_at
      )` )
    .run( { ...run, user_id: userId } )

  return Number( lastInsertRowid )
}

export const listLinkRuns = (
  userId: string,
  jobId: string,
): z.infer< typeof StoredLinkRun >[] => {
  return z.array( StoredLinkRun ).parse( getDatabase()
    .prepare( 'SELECT * FROM link_runs WHERE job_id = ? AND user_id = ? ORDER BY id' )
    .all( jobId, userId ) )
}

const RunWithVersion = StoredLinkRun.extend( { prompt_version: z.int().min( 1 ) } )

export const summarizeLinkUsage = (
  userId: string,
  jobId: string,
): LinkUsageSummary | undefined => {
  const runs = z.array( RunWithVersion ).parse( getDatabase()
    .prepare( `SELECT link_runs.*, prompt_versions.version AS prompt_version
      FROM link_runs
        JOIN prompt_versions ON prompt_versions.id = link_runs.prompt_version_id
          AND prompt_versions.user_id = link_runs.user_id
      WHERE link_runs.job_id = ? AND link_runs.user_id = ?
      ORDER BY link_runs.id` )
    .all( jobId, userId ) )
  const last = runs.at( -1 )

  if( last === undefined ) {
    return undefined
  }

  const hasUnpricedTokens = runs.some(
    ( run ) => run.input_tokens !== null && run.cost_usd === null,
  )

  return LinkUsageSummary.parse( {
    last_run: LinkRun.parse( {
      model: last.model,
      prompt_version: last.prompt_version,
      input_tokens: last.input_tokens,
      output_tokens: last.output_tokens,
      cache_read_input_tokens: last.cache_read_input_tokens,
      cache_creation_input_tokens: last.cache_creation_input_tokens,
      tool_calls: last.tool_calls,
      cost_usd: last.cost_usd,
      outcome: last.outcome,
      created_at: last.created_at,
    } ),
    run_count: runs.length,
    total_input_tokens: runs.reduce( ( sum, run ) => sum + ( run.input_tokens ?? 0 ), 0 ),
    total_output_tokens: runs.reduce( ( sum, run ) => sum + ( run.output_tokens ?? 0 ), 0 ),
    total_cost_usd: hasUnpricedTokens
      ? null
      : runs.reduce( ( sum, run ) => sum + ( run.cost_usd ?? 0 ), 0 ),
  } )
}
