// Shared
import type { LinkResponse } from '@atlas/shared'
import { parseNote } from '@atlas/shared'
// Clients
import { requestLinks } from '../clients/agent.client.js'
// Repositories
import { findUserById } from '../repositories/users.repository.js'
// Services
import { defaultFolderFor, findJob } from '../services/jobs.service.js'
import {
  completeLinking,
  failLinking,
  recordLinkRun,
  recordLinkSuggestions,
} from '../services/jobLinking.service.js'
import { vaultRootFor } from '../services/vault.service.js'
import { resolveLinkerPrompt } from '../services/prompts.service.js'
import { resolveLinkingModel } from '../services/settings.service.js'

export const linkJob = async ( userId: string, jobId: string ): Promise< void > => {
  try {
    const job = findJob( userId, jobId )

    if( job.note_markdown === null ) {
      throw new Error( 'The job has no note to link' )
    }

    const vaultDir = findUserById( userId )?.vault_dir

    if( vaultDir === null || vaultDir === undefined ) {
      throw new Error( 'Choose a vault first' )
    }

    // Throws VaultMissingError ("Your vault folder is missing"), so the agent is never asked
    vaultRootFor( userId )

    const { properties, body } = parseNote( job.note_markdown )
    const { version } = resolveLinkerPrompt( userId )
    const model = await resolveLinkingModel( userId )

    let response: LinkResponse

    try {
      response = await requestLinks( {
        note: {
          title: properties.title,
          tags: properties.tags,
          folder: job.target_folder ?? defaultFolderFor( userId, job ),
          body,
        },
        vault_dir: vaultDir,
        model,
        guidance: version.guidance,
      } )
    } catch( error ) {
      recordLinkRun( userId, jobId, {
        model,
        promptVersionId: version.id,
        usage: undefined,
        error: error instanceof Error ? error.message : 'Unknown error',
      } )

      throw error
    }

    const runId = recordLinkRun( userId, jobId, {
      model,
      promptVersionId: version.id,
      usage: response.usage,
      error: response.outcome === 'failed' ? response.reason ?? 'Linking failed' : undefined,
    } )

    if( response.outcome === 'failed' ) {
      failLinking( userId, jobId, response.reason ?? 'Linking failed' )

      return
    }

    recordLinkSuggestions( userId, jobId, runId, response.suggestions )
    completeLinking( userId, jobId )
  } catch( error ) {
    failLinking( userId, jobId, error instanceof Error ? error.message : 'Unknown error' )
  }
}
