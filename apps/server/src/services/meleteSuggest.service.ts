// Shared
import type { SuggestMeleteResourcesResponse } from '@atlas/shared'
// Clients
import { suggestResources } from '../clients/claude.client.js'
// Errors
import { BadGatewayError, MeleteError, NotFoundError } from '../errors.js'
// Melete
import { LOCKED_INSTRUCTIONS_MELETE_SUGGEST, buildMeleteSystemPrompt } from '../melete/prompts.js'
import { recordMeleteRun } from '../melete/runs.js'
import { buildSuggestUser, processSuggestions } from '../melete/suggest.js'
// Repositories
import { findConcept } from '../repositories/meleteConcepts.repository.js'
import { findSection } from '../repositories/meleteSections.repository.js'
import { findSubject } from '../repositories/meleteSubjects.repository.js'
// Services
import { subjectName } from './melete.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
import { resolveMeleteSuggestModel } from './settings.service.js'
// Logging
import { logger } from '../logger.js'

const messageOf = ( error: unknown ): string => {
  return error instanceof Error ? error.message : 'Unknown error'
}

// Resources for one concept, from Claude's own knowledge (ADR 0093): answered on the spot, not
// stored, with every link removed. Only the run is recorded.
export const suggestForConcept = async (
  userId: string,
  conceptId: string,
  now = new Date(),
): Promise< SuggestMeleteResourcesResponse > => {
  const concept = findConcept( userId, conceptId )
  const subject = concept === undefined ? undefined : findSubject( userId, concept.subject_id )
  const section = concept === undefined ? undefined : findSection( userId, concept.section_id )

  if( concept === undefined || subject === undefined || section === undefined ) {
    throw new NotFoundError( 'Concept not found' )
  }

  const model = await resolveMeleteSuggestModel( userId )
  const { version } = resolveMeletePrompt( userId, 'melete_suggest' )
  const run = {
    kind: 'suggest' as const,
    subjectId: subject.id,
    model,
    promptVersionId: version.id,
    now,
  }
  let outcome: Awaited< ReturnType< typeof suggestResources > >

  try {
    outcome = await suggestResources( {
      model,
      system: buildMeleteSystemPrompt( LOCKED_INSTRUCTIONS_MELETE_SUGGEST, version.guidance ),
      user: buildSuggestUser( {
        subject: subjectName( subject.folder ),
        level: subject.target_level ?? 'working',
        intent: subject.intent,
        section: section.name,
        concept: concept.name,
        description: concept.description,
      } ),
    } )
  } catch( error ) {
    const message = messageOf( error )

    recordMeleteRun( userId, {
      ...run,
      usage: error instanceof MeleteError ? error.usage : undefined,
      error: message,
    } )
    logger.warn( { error: message }, 'Suggesting resources failed' )

    throw new BadGatewayError( message )
  }

  const suggestions = processSuggestions( outcome.output )

  if( suggestions.length === 0 ) {
    const message = 'No usable suggestions came back'

    recordMeleteRun( userId, { ...run, usage: outcome.usage, error: message } )

    throw new BadGatewayError( message )
  }

  recordMeleteRun( userId, { ...run, usage: outcome.usage } )

  return { suggestions }
}
