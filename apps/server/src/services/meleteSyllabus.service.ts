// Shared
import type {
  AgentUsage,
  MeleteSubject,
  MeleteSyllabus,
  MeleteSyllabusEdit,
  SaveMeleteSyllabusResponse,
} from '@atlas/shared'
// Clients
import { AgentUnavailableError, draftSyllabusWithAgent } from '../clients/agent.client.js'
// Errors
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../errors.js'
// Melete
import { recordMeleteRun } from '../melete/runs.js'
import { planSyllabus } from '../melete/syllabusDiff.js'
import { processSyllabus } from '../melete/syllabus.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import {
  deleteConcept,
  insertConcept,
  listConcepts,
  replaceSyllabus,
  updateConcept,
} from '../repositories/meleteConcepts.repository.js'
import {
  listNoteIdsForConcepts,
  noteIdsWithoutConcepts,
} from '../repositories/meleteNoteConcepts.repository.js'
import {
  queueMappingFlagged,
  queueMappingForNotes,
  queueMappingForSubject,
  queueMappingUnpinned,
} from '../repositories/meleteNotes.repository.js'
import {
  deleteSection,
  insertSection,
  listSections,
  updateSection,
} from '../repositories/meleteSections.repository.js'
import type { SubjectRecord } from '../repositories/meleteSubjects.repository.js'
import { findSubject, updateSubject } from '../repositories/meleteSubjects.repository.js'
// Services
import { subjectName, toMeleteSubject } from './melete.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
import { resolveMeleteSyllabusModel } from './settings.service.js'
import { vaultDirFor, vaultRootFor } from './vault.service.js'
// Logging
import { logger } from '../logger.js'
// Worker
import { wakeGenerator } from '../worker/wake.js'

const NEEDS_LEVEL = 'Choose a target level first'

// Queues a draft for the Melete loop (ADR 0089); the call itself runs there
export const requestSyllabusDraft = (
  userId: string,
  subjectId: string,
  now = new Date(),
): MeleteSubject => {
  const subject = findSubject( userId, subjectId )

  if( subject === undefined ) {
    throw new NotFoundError( 'Subject not found' )
  }

  if( subject.target_level === null ) {
    throw new ValidationError( NEEDS_LEVEL )
  }

  if( subject.syllabus_status === 'drafting' ) {
    throw new ConflictError( 'A syllabus is already being drafted' )
  }

  const queued = updateSubject( userId, subjectId, {
    syllabus_status: 'drafting',
    syllabus_error: null,
  } )

  if( queued === undefined ) {
    throw new NotFoundError( 'Subject not found' )
  }

  wakeGenerator()

  return toMeleteSubject( userId, queued, now )
}

type Run = {
  subjectId: string
  model: string
  promptVersionId: number
  usage: Pick< AgentUsage, 'input_tokens' | 'output_tokens' > | undefined
  turns?: number
  toolCalls?: number
  now: Date
}

const messageOf = ( error: unknown ): string => {
  return error instanceof Error ? error.message : 'Unknown error'
}

// The old syllabus is left alone: only the status and the reason change
const failDraft = ( userId: string, subjectId: string, message: string, run?: Run ): void => {
  getDatabase().transaction( () => {
    if( run !== undefined ) {
      recordMeleteRun( userId, { ...run, kind: 'syllabus', error: message } )
    }

    updateSubject( userId, subjectId, {
      syllabus_status: 'failed',
      syllabus_error: message,
    } )
  } )()
  logger.warn( { error: message }, 'Syllabus drafting failed' )
}

const UNAVAILABLE = 'Agent service unavailable'

// Drafts the syllabus of one subject the loop has taken: the agent reads the subject's folder
// (ADR 0105). A failure is stored on the subject, never thrown
export const draftForSubject = async (
  userId: string,
  subjectId: string,
  now = new Date(),
): Promise< void > => {
  const subject = findSubject( userId, subjectId )

  if( subject === undefined ) {
    logger.warn( 'Queued subject not found' )

    return
  }

  if( subject.syllabus_status !== 'drafting' ) {
    return
  }

  if( subject.target_level === null ) {
    failDraft( userId, subjectId, NEEDS_LEVEL )

    return
  }

  try {
    const model = await resolveMeleteSyllabusModel( userId )
    const { version } = resolveMeletePrompt( userId, 'melete_syllabus' )
    const run = { subjectId, model, promptVersionId: version.id, now }

    // Throws if the vault is not chosen or is missing, before the agent is asked
    vaultRootFor( userId )

    const vaultDir = vaultDirFor( userId )

    if( vaultDir === null ) {
      throw new Error( 'No vault is chosen' )
    }

    let outcome: Awaited< ReturnType< typeof draftSyllabusWithAgent > >

    try {
      outcome = await draftSyllabusWithAgent( {
        vault_dir: vaultDir,
        subject_folder: subject.folder,
        name: subjectName( subject.folder ),
        level: subject.target_level,
        intent: subject.intent,
        model,
        guidance: version.guidance,
      } )
    } catch( error ) {
      failDraft(
        userId,
        subjectId,
        error instanceof AgentUnavailableError ? UNAVAILABLE : messageOf( error ),
        { ...run, usage: undefined },
      )

      return
    }

    const agentRun = {
      ...run,
      usage: outcome.usage,
      turns: outcome.usage.turns,
      toolCalls: outcome.usage.tool_calls,
    }

    if( outcome.outcome === 'failed' ) {
      failDraft( userId, subjectId, outcome.reason, agentRun )

      return
    }

    const { sections, capped } = processSyllabus( outcome )

    if( sections.length === 0 ) {
      failDraft( userId, subjectId, 'No usable syllabus came back', agentRun )

      return
    }

    getDatabase().transaction( () => {
      recordMeleteRun( userId, { ...agentRun, kind: 'syllabus' } )
      replaceSyllabus( userId, subjectId, sections )
      updateSubject( userId, subjectId, { syllabus_status: 'draft', syllabus_error: null } )
    } )()

    if( capped > 0 ) {
      logger.info( { capped }, 'Syllabus draft trimmed to the concept limit' )
    }
  } catch( error ) {
    failDraft( userId, subjectId, messageOf( error ) )
  }
}

const requireSubject = ( userId: string, subjectId: string ): SubjectRecord => {
  const subject = findSubject( userId, subjectId )

  if( subject === undefined ) {
    throw new NotFoundError( 'Subject not found' )
  }

  return subject
}

export const getSyllabus = ( userId: string, subjectId: string ): MeleteSyllabus => {
  requireSubject( userId, subjectId )

  const concepts = listConcepts( userId, subjectId )

  return {
    sections: listSections( userId, subjectId ).map( ( section ) => ( {
      id: section.id,
      name: section.name,
      concepts: concepts
        .filter( ( { section_id } ) => section_id === section.id )
        .map( ( { id, name, description } ) => ( { id, name, description } ) ),
    } ) ),
  }
}

// The edited syllabus replaces the stored one in place (TRD §3.3): concepts keep their ids, so
// their mappings and question labels survive a rename or a move, and only a removal drops them
export const saveSyllabus = (
  userId: string,
  subjectId: string,
  edit: MeleteSyllabusEdit,
): SaveMeleteSyllabusResponse => {
  const subject = requireSubject( userId, subjectId )

  if( subject.syllabus_status !== 'draft' && subject.syllabus_status !== 'approved' ) {
    throw new ConflictError( 'There is no syllabus to edit yet' )
  }

  const plan = planSyllabus( getSyllabus( userId, subjectId ), edit )

  getDatabase().transaction( () => {
    const losing = listNoteIdsForConcepts( userId, plan.removeConceptIds )

    for( const section of plan.sections ) {
      const sectionId = section.id === null
        ? insertSection( userId, {
          subject_id: subjectId,
          name: section.name,
          position: section.position,
        } ).id
        : updateSection( userId, section.id, { name: section.name, position: section.position } )
          ?.id

      for( const concept of section.concepts ) {
        if( sectionId === undefined ) {
          throw new NotFoundError( 'Section not found' )
        }

        if( concept.id === null ) {
          insertConcept( userId, {
            subject_id: subjectId,
            section_id: sectionId,
            name: concept.name,
            description: concept.description,
            position: concept.position,
          } )
        } else {
          updateConcept( userId, concept.id, {
            name: concept.name,
            description: concept.description,
            position: concept.position,
            section_id: sectionId,
          } )
        }
      }
    }

    // Surviving concepts have left a removed section by now
    plan.removeConceptIds.forEach( ( id ) => deleteConcept( userId, id ) )
    plan.removeSectionIds.forEach( ( id ) => deleteSection( userId, id ) )

    // Only an approved syllabus is mapped. Renames and moves change nothing for a note (TRD §4.3)
    if( subject.syllabus_status === 'approved' ) {
      if( plan.diff.added > 0 ) {
        queueMappingFlagged( userId, subjectId )
      }

      queueMappingForNotes( userId, noteIdsWithoutConcepts( userId, losing ) )
    }
  } )()

  return { syllabus: getSyllabus( userId, subjectId ), diff: plan.diff }
}

// Approving queues every enrolled note for mapping; the loop does the mapping (Checkpoint B)
export const approveSyllabus = (
  userId: string,
  subjectId: string,
  now = new Date(),
): MeleteSubject => {
  const subject = requireSubject( userId, subjectId )

  if( subject.syllabus_status !== 'draft' ) {
    throw new ConflictError( 'Only a drafted syllabus can be approved' )
  }

  if( listConcepts( userId, subjectId ).length === 0 ) {
    throw new ConflictError( 'The syllabus has no concepts' )
  }

  const approved = getDatabase().transaction( () => {
    queueMappingForSubject( userId, subjectId )

    return updateSubject( userId, subjectId, { syllabus_status: 'approved' } )
  } )()

  if( approved === undefined ) {
    throw new NotFoundError( 'Subject not found' )
  }

  wakeGenerator()

  return toMeleteSubject( userId, approved, now )
}

// Remap all (TRD §4.3): every enrolled note that is not pinned goes back to Map
export const remapSyllabus = ( userId: string, subjectId: string ): { queued: number } => {
  const subject = requireSubject( userId, subjectId )

  if( subject.syllabus_status !== 'approved' ) {
    throw new ConflictError( 'Only an approved syllabus can be mapped again' )
  }

  const queued = queueMappingUnpinned( userId, subjectId )

  wakeGenerator()

  return { queued }
}
