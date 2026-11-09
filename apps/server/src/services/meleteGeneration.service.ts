// Node
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
// Clients
import { generateApprovedQuestions, generateQuestions } from '../clients/claude.client.js'
// Errors
import { MeleteError } from '../errors.js'
// Melete
import { buildConceptList } from '../melete/conceptRefs.js'
import {
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED,
  buildMeleteSystemPrompt,
} from '../melete/prompts.js'
import { processApprovedQuestions, processQuestions } from '../melete/questions.js'
import { recordMeleteRun } from '../melete/runs.js'
import { bodyHash, noteTitle, splitFrontMatter } from '../melete/scan.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { NoteRecord, findNote, updateNote } from '../repositories/meleteNotes.repository.js'
import { listConcepts } from '../repositories/meleteConcepts.repository.js'
import { setNoteConcepts } from '../repositories/meleteNoteConcepts.repository.js'
import {
  insertQuestions,
  listForNote,
} from '../repositories/meleteQuestions.repository.js'
import { findSubject } from '../repositories/meleteSubjects.repository.js'
import type { ConceptRecord } from '../repositories/meleteConcepts.repository.js'
import type { GeneratedQuestion } from '../repositories/meleteQuestions.repository.js'
// Services
import { scanLearningRoot } from './meleteScan.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
import { resolveMeleteQuestionModel } from './settings.service.js'
import { vaultRootFor } from './vault.service.js'
// Logging
import { logger } from '../logger.js'

const MAX_BODY_CHARACTERS = 60_000

type RunDetails = {
  noteId: string
  model: string
  promptVersionId: number
  usage: { input_tokens: number, output_tokens: number } | undefined
  error?: string
  now: Date
}

type Processed = {
  questions: GeneratedQuestion[]
  usage: { input_tokens: number, output_tokens: number }
  conceptIds: string[]
  offSyllabus: string | null
}

type Request = { model: string, system: string, user: string, body: string }

const generatePlain = async ( { body, ...request }: Request ): Promise< Processed > => {
  const { output, usage } = await generateQuestions( request )

  return { questions: processQuestions( output, body ), usage, conceptIds: [], offSyllabus: null }
}

const generateApproved = async (
  { body, concepts, ...request }: Request & { concepts: ConceptRecord[] },
): Promise< Processed > => {
  const { output, usage } = await generateApprovedQuestions( request )

  return { ...processApprovedQuestions( output, body, concepts ), usage }
}

const isGone = ( error: unknown ): boolean => {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

const messageOf = ( error: unknown ): string => {
  return error instanceof Error ? error.message : 'Unknown error'
}

const recordRun = ( userId: string, details: RunDetails ): number => {
  return recordMeleteRun( userId, { ...details, kind: 'generate' } )
}

const failNote = ( userId: string, noteId: string, message: string, run?: RunDetails ): void => {
  getDatabase().transaction( () => {
    if( run !== undefined ) {
      recordRun( userId, { ...run, error: message } )
    }

    updateNote( userId, noteId, { generation: 'failed', generation_error: message } )
  } )()
  logger.warn( { error: message }, 'Question generation failed' )
}

// The scan applies the edit and missing rules; a note it leaves `generating` has nothing to make
const handBackToScan = async ( userId: string, noteId: string, now: Date ): Promise< void > => {
  try {
    await scanLearningRoot( userId, { force: true, now } )
  } catch( error ) {
    logger.warn( { error: messageOf( error ) }, 'Scan after a changed note failed' )
  }

  if( findNote( userId, noteId )?.generation === 'generating' ) {
    updateNote( userId, noteId, { generation: 'idle' } )
  }
}

const readCurrent = async (
  userId: string,
  note: NoteRecord,
): Promise< { body: string, hash: string, title: string } | 'gone' > => {
  try {
    const text = await readFile( join( vaultRootFor( userId ), note.path ), 'utf8' )
    const { frontMatter, body } = splitFrontMatter( text )

    return { body, hash: bodyHash( body ), title: noteTitle( frontMatter, note.path ) }
  } catch( error ) {
    if( isGone( error ) ) {
      return 'gone'
    }

    throw error
  }
}

// Makes the questions for one claimed note; a failure is stored on the note, never thrown
export const generateForNote = async (
  userId: string,
  noteId: string,
  now = new Date(),
): Promise< void > => {
  const note = findNote( userId, noteId )

  if( note === undefined ) {
    logger.warn( 'Queued note not found' )

    return
  }

  if( !note.enrolled || note.missing_at !== null ) {
    updateNote( userId, noteId, { generation: 'idle' } )

    return
  }

  try {
    const current = await readCurrent( userId, note )

    if( current === 'gone' || current.hash !== note.body_hash ) {
      await handBackToScan( userId, noteId, now )

      return
    }

    const hasQuestions = listForNote( userId, noteId ).some( ( { state, body_hash: hash } ) => {
      return state === 'active' && hash === current.hash
    } )

    if( hasQuestions ) {
      updateNote( userId, noteId, { generation: 'idle' } )

      return
    }

    const model = await resolveMeleteQuestionModel( userId )
    const { version } = resolveMeletePrompt( userId, 'melete_questions' )
    const run = { noteId, model, promptVersionId: version.id, now }

    if( current.body.length > MAX_BODY_CHARACTERS ) {
      failNote(
        userId,
        noteId,
        `Note is too long for question generation (${ current.body.length } characters, `
          + `limit ${ MAX_BODY_CHARACTERS }). Split it into smaller notes.`,
        { ...run, usage: undefined },
      )

      return
    }

    const subject = findSubject( userId, note.subject_id )
    const subjectName = basename( subject?.folder ?? '' )
    const concepts = subject?.syllabus_status === 'approved'
      ? listConcepts( userId, subject.id )
      : []
    const approved = concepts.length > 0
    const header = `Subject: ${ subjectName }\nTitle: ${ current.title }`
    let processed: Processed

    try {
      processed = approved
        ? await generateApproved( {
          model,
          system: buildMeleteSystemPrompt(
            LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED,
            version.guidance,
          ),
          user: [
            header,
            `\n## Concepts\n${ buildConceptList( concepts ) }`,
            `\n## Note\n${ current.body }`,
          ].join( '\n' ),
          body: current.body,
          concepts,
        } )
        : await generatePlain( {
          model,
          system: buildMeleteSystemPrompt( LOCKED_INSTRUCTIONS_MELETE_QUESTIONS, version.guidance ),
          user: `${ header }\n\n${ current.body }`,
          body: current.body,
        } )
    } catch( error ) {
      failNote(
        userId,
        noteId,
        messageOf( error ),
        { ...run, usage: error instanceof MeleteError ? error.usage : undefined },
      )

      return
    }

    const { questions, usage, conceptIds, offSyllabus } = processed

    if( questions.length === 0 ) {
      failNote( userId, noteId, 'No usable questions came back', { ...run, usage } )

      return
    }

    try {
      getDatabase().transaction( () => {
        const runId = recordRun( userId, { ...run, usage } )
        const latest = findNote( userId, noteId )

        // Edited during the call: these questions are stale, and the scan has queued the note
        // again if it is enrolled
        if( latest?.body_hash !== current.hash ) {
          if( latest?.generation === 'generating' ) {
            updateNote( userId, noteId, { generation: 'idle' } )
          }

          return
        }

        insertQuestions( userId, noteId, runId, current.hash, questions )

        // The content changed, so the mapping is Claude's again, hand pins included (ADR 0089)
        if( approved ) {
          setNoteConcepts( userId, noteId, conceptIds, 'claude' )
        }

        updateNote( userId, noteId, {
          generation: 'idle',
          generation_error: null,
          ...approved && {
            mapping: 'idle',
            mapping_error: null,
            mapping_pinned: false,
            off_syllabus: offSyllabus === null ? null : 'flagged',
            off_syllabus_suggestion: offSyllabus,
          },
        } )
      } )()
    } catch( error ) {
      failNote( userId, noteId, messageOf( error ), { ...run, usage } )
    }
  } catch( error ) {
    failNote( userId, noteId, messageOf( error ) )
  }
}
