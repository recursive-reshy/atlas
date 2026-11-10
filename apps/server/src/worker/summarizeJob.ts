// Services
import {
  completeSummary,
  failSummary,
  findJob,
  recordSummaryRun,
} from '../services/jobs.service.js'
import { getSource } from '../services/jobRender.service.js'
import { resolvePrompt } from '../services/prompts.service.js'
import { getDefaultModel } from '../services/settings.service.js'
// Clients
import { SummaryError, summarizeSource } from '../clients/claude.client.js'
import type { SummaryOutcome } from '../clients/claude.client.js'
// Formatters
import { cleanSummary } from '../formatters/summary.cleanup.js'
import { formatSummary } from '../formatters/summary.formatter.js'

export const summarizeJob = async ( userId: string, jobId: string ): Promise< void > => {
  try {
    const job = findJob( userId, jobId )
    const document = getSource( userId, jobId )
    const { version } = resolvePrompt( userId, job.prompt_profile_id )
    const model = job.summary_model ?? getDefaultModel( userId )
    const promptVersionId = version.id

    let outcome: SummaryOutcome

    try {
      outcome = await summarizeSource( { document, model, guidance: version.guidance } )
    } catch( error ) {
      recordSummaryRun( userId, jobId, {
        model,
        promptVersionId,
        usage: error instanceof SummaryError ? error.usage : undefined,
        error: error instanceof Error ? error.message : 'Unknown error',
      } )

      throw error
    }

    recordSummaryRun( userId, jobId, { model, promptVersionId, usage: outcome.usage } )

    const summary = cleanSummary( outcome.summary, document )

    completeSummary(
      userId,
      jobId,
      formatSummary( summary ),
      summary.tags,
    )
  } catch( error ) {
    failSummary( userId, jobId, error instanceof Error ? error.message : 'Unknown error' )
  }
}
