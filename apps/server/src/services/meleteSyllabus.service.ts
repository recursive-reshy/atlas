// Node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
// Shared
import type {
  MeleteSubject,
  MeleteSyllabus,
  MeleteSyllabusEdit,
  SaveMeleteSyllabusResponse,
} from '@atlas/shared'
// Clients
import { draftSyllabus } from '../clients/claude.client.js'
// Errors
import {
  ConflictError,
  MeleteError,
  NotFoundError,
  ValidationError,
} from '../errors.js'
// Melete
import { LOCKED_INSTRUCTIONS_MELETE_SYLLABUS, buildMeleteSystemPrompt } from '../melete/prompts.js'
import { recordMeleteRun } from '../melete/runs.js'
import { splitFrontMatter } from '../melete/scan.js'
import { planSyllabus } from '../melete/syllabusDiff.js'
import {
  MAX_SYLLABUS_NOTES,
  buildSyllabusUser,
  noteOpening,
  processSyllabus,
} from '../melete/syllabus.js'
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
  listNotesBySubject,
  queueMappingForSubject,
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
import { vaultRootFor } from './vault.service.js'
// Logging
import { logger } from '../logger.js'

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

  return toMeleteSubject( userId, queued, now )
}

type Run = {
  subjectId: string
  model: string
  promptVersionId: number
  usage: { input_tokens: number, output_tokens: number } | undefined
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

// Title and opening of each note still in the vault; one that can't be read is left out
const readNotes = async (
  userId: string,
  subjectId: string,
): Promise< { title: string, opening: string }[] > => {
  const root = vaultRootFor( userId )
  const notes = listNotesBySubject( userId, subjectId )
    .filter( ( { missing_at } ) => missing_at === null )
    .slice( 0, MAX_SYLLABUS_NOTES )

  const read = await Promise.all( notes.map( async ( { path, title } ) => {
    try {
      const { body } = splitFrontMatter( await readFile( join( root, path ), 'utf8' ) )

      return [ { title, opening: noteOpening( body ) } ]
    } catch{
      return []
    }
  } ) )

  return read.flat()
}

// Drafts the syllabus of one subject the loop has taken; a failure is stored on the subject,
// never thrown
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
    let outcome: Awaited< ReturnType< typeof draftSyllabus > >

    try {
      outcome = await draftSyllabus( {
        model,
        system: buildMeleteSystemPrompt( LOCKED_INSTRUCTIONS_MELETE_SYLLABUS, version.guidance ),
        user: buildSyllabusUser( {
          name: subjectName( subject.folder ),
          level: subject.target_level,
          intent: subject.intent,
          notes: await readNotes( userId, subjectId ),
        } ),
      } )
    } catch( error ) {
      failDraft( userId, subjectId, messageOf( error ), {
        ...run,
        usage: error instanceof MeleteError ? error.usage : undefined,
      } )

      return
    }

    const { sections, capped } = processSyllabus( outcome.output )

    if( sections.length === 0 ) {
      failDraft( userId, subjectId, 'No usable syllabus came back', {
        ...run,
        usage: outcome.usage,
      } )

      return
    }

    getDatabase().transaction( () => {
      recordMeleteRun( userId, { ...run, kind: 'syllabus', usage: outcome.usage } )
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

  return toMeleteSubject( userId, approved, now )
}
