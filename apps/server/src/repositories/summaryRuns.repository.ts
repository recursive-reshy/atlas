// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'
import { marks } from './jobRows.js'

export const SummaryRunRecord = z.object( {
  job_id: z.string(),
  model: z.string(),
  prompt_version_id: z.int(),
  input_tokens: z.int().nullable(),
  output_tokens: z.int().nullable(),
  cost_usd: z.number().nullable(),
  outcome: z.enum( [ 'succeeded', 'failed' ] ),
  error: z.string().nullable(),
  created_at: z.string(),
} )
export type SummaryRunRecord = z.infer< typeof SummaryRunRecord >

const StoredSummaryRun = SummaryRunRecord.extend( { id: z.int() } )
export type StoredSummaryRun = z.infer< typeof StoredSummaryRun >

export const insertSummaryRun = ( userId: string, run: SummaryRunRecord ): void => {
  getDatabase()
    .prepare( `INSERT INTO summary_runs (
        user_id, job_id, model, prompt_version_id, input_tokens, output_tokens, cost_usd,
        outcome, error, created_at
      ) VALUES (
        @user_id, @job_id, @model, @prompt_version_id, @input_tokens, @output_tokens, @cost_usd,
        @outcome, @error, @created_at
      )` )
    .run( { ...run, user_id: userId } )
}

// One query for many jobs: each job's runs, oldest first; a job without runs has no entry
export const listRunsForJobs = (
  userId: string,
  jobIds: string[],
): Map< string, StoredSummaryRun[] > => {
  const byJob = new Map< string, StoredSummaryRun[] >()

  if( jobIds.length === 0 ) {
    return byJob
  }

  const runs = z.array( StoredSummaryRun ).parse( getDatabase()
    .prepare( `SELECT * FROM summary_runs
      WHERE user_id = ? AND job_id IN ( ${ marks( jobIds ) } ) ORDER BY id` )
    .all( userId, ...jobIds ) )

  for( const run of runs ) {
    byJob.set( run.job_id, [ ...byJob.get( run.job_id ) ?? [], run ] )
  }

  return byJob
}

export const listRunsForJob = ( userId: string, jobId: string ): StoredSummaryRun[] => {
  return listRunsForJobs( userId, [ jobId ] ).get( jobId ) ?? []
}
