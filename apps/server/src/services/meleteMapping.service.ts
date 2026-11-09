// Node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
// Clients
import { mapNote } from '../clients/claude.client.js'
// Errors
import { MeleteError } from '../errors.js'
// Melete
import { buildMapUser, processMap } from '../melete/map.js'
import { LOCKED_INSTRUCTIONS_MELETE_MAP, buildMeleteSystemPrompt } from '../melete/prompts.js'
import { recordMeleteRun } from '../melete/runs.js'
import { bodyHash, splitFrontMatter } from '../melete/scan.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { listConcepts } from '../repositories/meleteConcepts.repository.js'
import { listNoteConcepts, setNoteConcepts } from '../repositories/meleteNoteConcepts.repository.js'
import { findNote, updateNote } from '../repositories/meleteNotes.repository.js'
import { listForNote, setQuestionConcept } from '../repositories/meleteQuestions.repository.js'
import { findSubject } from '../repositories/meleteSubjects.repository.js'
// Services
import { scanLearningRoot } from './meleteScan.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
import { resolveMeleteMapModel } from './settings.service.js'
import { vaultRootFor } from './vault.service.js'
// Logging
import { logger } from '../logger.js'

type RunDetails = {
  noteId: string
  subjectId: string
  model: string
  promptVersionId: number
  usage: { input_tokens: number, output_tokens: number } | undefined
  error?: string
  now: Date
}

const messageOf = ( error: unknown ): string => {
  return error instanceof Error ? error.message : 'Unknown error'
}

const isGone = ( error: unknown ): boolean => {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

const failMapping = ( userId: string, noteId: string, message: string, run?: RunDetails ): void => {
  getDatabase().transaction( () => {
    if( run !== undefined ) {
      recordMeleteRun( userId, { ...run, kind: 'map', error: message } )
    }

    updateNote( userId, noteId, { mapping: 'failed', mapping_error: message } )
  } )()
  logger.warn( { error: message }, 'Mapping failed' )
}

// The scan applies the edit rules and queues the note's questions again; Generate maps it then
const handBackToScan = async ( userId: string, noteId: string, now: Date ): Promise< void > => {
  try {
    await scanLearningRoot( userId, { force: true, now } )
  } catch( error ) {
    logger.warn( { error: messageOf( error ) }, 'Scan after a changed note failed' )
  }

  if( findNote( userId, noteId )?.mapping === 'mapping' ) {
    updateNote( userId, noteId, { mapping: 'idle' } )
  }
}

const readBody = async (
  userId: string,
  path: string,
): Promise< { body: string, hash: string } | 'gone' > => {
  try {
    const text = await readFile( join( vaultRootFor( userId ), path ), 'utf8' )
    const { body } = splitFrontMatter( text )

    return { body, hash: bodyHash( body ) }
  } catch( error ) {
    if( isGone( error ) ) {
      return 'gone'
    }

    throw error
  }
}

// Maps one claimed note onto the approved syllabus (ADR 0089). It only rewrites mappings and
// question labels, never the questions or their cards. A hand-mapped note keeps its concepts and
// only has its questions labelled. A failure is stored on the note, never thrown.
export const mapForNote = async (
  userId: string,
  noteId: string,
  now = new Date(),
): Promise< void > => {
  const note = findNote( userId, noteId )

  if( note === undefined ) {
    logger.warn( 'Queued note not found' )

    return
  }

  const subject = findSubject( userId, note.subject_id )
  const concepts = subject?.syllabus_status === 'approved'
    ? listConcepts( userId, note.subject_id )
    : []
  const live = note.enrolled && note.missing_at === null

  if( subject === undefined || !live || concepts.length === 0 ) {
    updateNote( userId, noteId, { mapping: 'idle' } )

    return
  }

  try {
    const current = await readBody( userId, note.path )

    if( current === 'gone' || current.hash !== note.body_hash ) {
      await handBackToScan( userId, noteId, now )

      return
    }

    // A pin only holds while the hand mapping does: a redraft removes the concepts it named
    const mapped = listNoteConcepts( userId, noteId ).map( ( { concept_id: id } ) => id )
    const fixedIds = note.mapping_pinned && mapped.length > 0 ? mapped : undefined
    const questions = listForNote( userId, noteId ).filter( ( { state } ) => state === 'active' )
    const model = await resolveMeleteMapModel( userId )
    const { version } = resolveMeletePrompt( userId, 'melete_map' )
    const run = { noteId, subjectId: subject.id, model, promptVersionId: version.id, now }
    let outcome: Awaited< ReturnType< typeof mapNote > >

    try {
      outcome = await mapNote( {
        model,
        system: buildMeleteSystemPrompt( LOCKED_INSTRUCTIONS_MELETE_MAP, version.guidance ),
        user: buildMapUser( { concepts, body: current.body, questions, fixedIds } ),
      } )
    } catch( error ) {
      failMapping(
        userId,
        noteId,
        messageOf( error ),
        { ...run, usage: error instanceof MeleteError ? error.usage : undefined },
      )

      return
    }

    const result = processMap( outcome.output, concepts, questions, fixedIds )

    try {
      getDatabase().transaction( () => {
        recordMeleteRun( userId, { ...run, kind: 'map', usage: outcome.usage } )

        // Edited during the call: the scan has queued the note's questions again
        if( findNote( userId, noteId )?.body_hash !== current.hash ) {
          updateNote( userId, noteId, { mapping: 'idle' } )

          return
        }

        if( fixedIds === undefined ) {
          setNoteConcepts( userId, noteId, result.conceptIds, 'claude' )
        }

        for( const { questionId, conceptId } of result.labels ) {
          setQuestionConcept( userId, questionId, conceptId )
        }

        updateNote( userId, noteId, {
          mapping: 'idle',
          mapping_error: null,
          ...fixedIds === undefined && {
            mapping_pinned: false,
            off_syllabus: result.offSyllabus === null ? null : 'flagged',
            off_syllabus_suggestion: result.offSyllabus,
          },
        } )
      } )()
    } catch( error ) {
      failMapping( userId, noteId, messageOf( error ), { ...run, usage: outcome.usage } )
    }
  } catch( error ) {
    failMapping( userId, noteId, messageOf( error ) )
  }
}
