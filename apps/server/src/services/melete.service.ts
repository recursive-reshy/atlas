// Shared
import {
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GetMeleteTodayResponse,
  MeleteNote,
  MeleteQuestion,
  MeleteSubject,
  UpdateMeleteSubjectBody,
} from '@atlas/shared'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Melete
import { dayStart } from '../melete/day.js'
import { obsidianUrl } from '../melete/obsidian.js'
import { newRemaining, reviewCounts } from '../melete/queue.js'
import { listSubjectFolders } from '../melete/scan.js'
import { lastSkipped } from '../melete/scanOutcome.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { listConceptUsage } from '../repositories/meleteConcepts.repository.js'
import { sumSubjectSeconds } from '../repositories/timeEntries.repository.js'
import { periodRange, studyDay } from '../themis/periods.js'
import { findGoal } from '../repositories/themisGoals.repository.js'
import { listNoteConcepts } from '../repositories/meleteNoteConcepts.repository.js'
import {
  NoteRecord,
  findNote,
  listNotesBySubject,
  setEnrolled,
  updateNote,
} from '../repositories/meleteNotes.repository.js'
import {
  QuestionRecord,
  countBySubject,
  findQuestion,
  listForNote,
  retireActiveForNote,
  setState,
} from '../repositories/meleteQuestions.repository.js'
import {
  SubjectRecord,
  findSubject,
  listSubjects,
  updateSubject as updateStoredSubject,
} from '../repositories/meleteSubjects.repository.js'
// Services
import { computeConceptStats, rollUp } from '../melete/mastery.js'
import type { ConceptStat } from '../melete/mastery.js'
import { scanLearningRoot } from './meleteScan.service.js'
import { getLearningRoot, getMasteryDays } from './settings.service.js'
import { vaultDirFor, vaultRootFor } from './vault.service.js'

const requireNote = ( userId: string, id: string ): NoteRecord => {
  const note = findNote( userId, id )

  if( note === undefined ) {
    throw new NotFoundError( 'Note not found' )
  }

  return note
}

const requireSubject = ( userId: string, id: string ): SubjectRecord => {
  const subject = findSubject( userId, id )

  if( subject === undefined ) {
    throw new NotFoundError( 'Subject not found' )
  }

  return subject
}

export const toMeleteQuestion = ( question: QuestionRecord ): MeleteQuestion => ( {
  id: question.id,
  note_id: question.note_id,
  position: question.position,
  prompt: question.prompt,
  answer: question.answer,
  passage: question.passage,
  state: question.state,
  fsrs_state: question.fsrs_state,
  due: question.due,
  reps: question.reps,
  lapses: question.lapses,
  last_review: question.last_review,
} )

const toMeleteNote = (
  userId: string,
  note: NoteRecord,
  questions: QuestionRecord[],
): MeleteNote => {
  const active = questions.filter( ( { state } ) => state === 'active' )

  return {
    id: note.id,
    subject_id: note.subject_id,
    path: note.path,
    title: note.title,
    enrolled: note.enrolled,
    generation: note.generation,
    generation_error: note.generation_error,
    question_count: active.length,
    stale: active.some( ( { body_hash } ) => body_hash !== note.body_hash ),
    missing: note.missing_at !== null,
    mapping: note.mapping,
    mapping_error: note.mapping_error,
    mapping_pinned: note.mapping_pinned,
    off_syllabus: note.off_syllabus,
    off_syllabus_suggestion: note.off_syllabus_suggestion,
    concept_ids: listNoteConcepts( userId, note.id ).map( ( { concept_id: id } ) => id ),
  }
}

export const noteView = ( userId: string, note: NoteRecord ): GetMeleteNoteResponse => {
  const questions = listForNote( userId, note.id )

  return {
    note: toMeleteNote( userId, note, questions ),
    questions: questions.map( toMeleteQuestion ),
    obsidian_url: obsidianUrl( vaultDirFor( userId ), note.path ),
  }
}

// The study day ends where the next one starts: 36 hours on is always inside the next day
const dueToday = ( userId: string, subjectId: string, now: Date ): number => {
  const endOfDay = dayStart( new Date( dayStart( now ).getTime() + 36 * 3_600_000 ) )
  const until = new Date( endOfDay.getTime() - 1 ).toISOString()

  return countBySubject( userId, until ).find( ( counts ) => counts.subject_id === subjectId )
    ?.due ?? 0
}

// An approved syllabus's concepts with their numbers; nothing for any other status (ADR 0090)
export const subjectConceptStats = ( userId: string, subject: SubjectRecord ): ConceptStat[] => {
  if( subject.syllabus_status !== 'approved' ) {
    return []
  }

  return computeConceptStats(
    listConceptUsage( userId, subject.id ).map( ( usage ) => ( {
      id: usage.id,
      sectionId: usage.section_id,
      noteCount: usage.note_count,
      questions: usage.questions,
    } ) ),
    getMasteryDays( userId ),
  )
}

// Null until the syllabus is approved and has concepts (ADR 0090); computed on every read
const subjectNumbers = (
  userId: string,
  subject: SubjectRecord,
): Pick< MeleteSubject, 'coverage' | 'mastery' | 'concept_count' > => {
  const none = { coverage: null, mastery: null, concept_count: null }

  if( subject.syllabus_status !== 'approved' ) {
    return none
  }

  const stats = subjectConceptStats( userId, subject )
  const totals = rollUp( stats )

  return totals === null ? none : { ...totals, concept_count: stats.length }
}

// Measured and logged time on the study days of the current Monday to Sunday week (ADR 0091)
const secondsThisWeek = ( userId: string, subjectId: string, now: Date ): number => {
  const { from, to } = periodRange( 'week', studyDay( now ) )

  return sumSubjectSeconds( userId, subjectId, from, to )
}

export const subjectName = ( folder: string ): string => folder.split( '/' ).at( -1 ) ?? folder

export const toMeleteSubject = (
  userId: string,
  subject: SubjectRecord,
  now: Date,
): MeleteSubject => {
  const notes = listNotesBySubject( userId, subject.id )
    .filter( ( { missing_at } ) => missing_at === null )
  const counts = countBySubject( userId, now.toISOString() ).find( ( { subject_id } ) => {
    return subject_id === subject.id
  } )
  const newAvailable = counts?.new_available ?? 0

  return {
    id: subject.id,
    name: subjectName( subject.folder ),
    folder: subject.folder,
    auto_enroll: subject.auto_enroll,
    new_per_day: subject.new_per_day,
    note_count: notes.length,
    enrolled_count: notes.filter( ( { enrolled } ) => enrolled ).length,
    due_count: counts?.due ?? 0,
    new_available: newAvailable,
    new_remaining_today: Math.min( newRemaining( userId, subject, now ), newAvailable ),
    target_level: subject.target_level,
    intent: subject.intent,
    syllabus_status: subject.syllabus_status,
    syllabus_error: subject.syllabus_error,
    ...subjectNumbers( userId, subject ),
    due_today: dueToday( userId, subject.id, now ),
    seconds_this_week: secondsThisWeek( userId, subject.id, now ),
    goal_id: subject.goal_id,
  }
}

const subjectView = (
  userId: string,
  subject: SubjectRecord,
  now: Date,
): GetMeleteSubjectResponse => ( {
  subject: toMeleteSubject( userId, subject, now ),
  notes: listNotesBySubject( userId, subject.id ).map( ( note ) => {
    return toMeleteNote( userId, note, listForNote( userId, note.id ) )
  } ),
} )

// A subject belongs to the learning root only while it is a direct child folder of it
export const requireSubjectInRoot = (
  userId: string,
  id: string,
  learningRoot: string,
): SubjectRecord => {
  const subject = requireSubject( userId, id )

  if( subject.folder.split( '/' ).slice( 0, -1 ).join( '/' ) !== learningRoot ) {
    throw new NotFoundError( 'Subject not found' )
  }

  return subject
}

const queueGeneration = ( userId: string, noteId: string ): void => {
  updateNote( userId, noteId, { generation: 'queued', generation_error: null } )
}

// Questions made from an older body are retired, and a note with none left to review is queued
const enrol = ( userId: string, note: NoteRecord, at: string ): void => {
  if( note.enrolled ) {
    return
  }

  setEnrolled( userId, [ note.id ], true, at )

  const current = listForNote( userId, note.id ).some( ( { state, body_hash } ) => {
    return state === 'active' && body_hash === note.body_hash
  } )

  if( !current && ( note.generation === 'idle' || note.generation === 'failed' ) ) {
    retireActiveForNote( userId, note.id )
    queueGeneration( userId, note.id )
  }
}

// Questions and cards are kept; a note still waiting in the queue is taken out of it
const unenrol = ( userId: string, note: NoteRecord, at: string ): void => {
  setEnrolled( userId, [ note.id ], false, at )

  if( note.generation === 'queued' ) {
    updateNote( userId, note.id, { generation: 'idle' } )
  }
}

export const setNoteEnrolled = (
  userId: string,
  id: string,
  enrolled: boolean,
  now = new Date(),
): GetMeleteNoteResponse => {
  const note = requireNote( userId, id )

  if( note.missing_at !== null ) {
    throw new ConflictError( 'The note is missing from the vault' )
  }

  getDatabase().transaction( () => {
    if( enrolled ) {
      enrol( userId, note, now.toISOString() )
    } else {
      unenrol( userId, note, now.toISOString() )
    }
  } )()

  return noteView( userId, requireNote( userId, id ) )
}

export const setSubjectEnrolled = async (
  userId: string,
  id: string,
  enrolled: boolean,
  now = new Date(),
): Promise< GetMeleteSubjectResponse > => {
  requireSubject( userId, id )
  await scanLearningRoot( userId, { force: true, now } )

  getDatabase().transaction( () => {
    const live = listNotesBySubject( userId, id )
      .filter( ( { missing_at } ) => missing_at === null )

    for( const note of live ) {
      if( enrolled ) {
        enrol( userId, note, now.toISOString() )
      } else {
        unenrol( userId, note, now.toISOString() )
      }
    }
  } )()

  return subjectView( userId, requireSubject( userId, id ), now )
}

export const regenerateNote = ( userId: string, id: string ): GetMeleteNoteResponse => {
  const note = requireNote( userId, id )

  if( note.missing_at !== null ) {
    throw new ConflictError( 'The note is missing from the vault' )
  }

  if( !note.enrolled ) {
    throw new ConflictError( 'Enrol the note before regenerating its questions' )
  }

  if( note.generation === 'queued' || note.generation === 'generating' ) {
    throw new ConflictError( 'Questions are already being generated for this note' )
  }

  getDatabase().transaction( () => {
    retireActiveForNote( userId, id )
    queueGeneration( userId, id )
  } )()

  return noteView( userId, requireNote( userId, id ) )
}

export const retryGeneration = ( userId: string, id: string ): GetMeleteNoteResponse => {
  const note = requireNote( userId, id )

  if( note.generation === 'failed' ) {
    queueGeneration( userId, id )
  } else if( note.mapping === 'failed' ) {
    updateNote( userId, id, { mapping: 'queued', mapping_error: null } )
  } else {
    throw new ConflictError( 'Only a note whose generation or mapping failed can be retried' )
  }

  return noteView( userId, requireNote( userId, id ) )
}

export const dropQuestion = ( userId: string, id: string ): MeleteQuestion => {
  const question = findQuestion( userId, id )

  if( question === undefined ) {
    throw new NotFoundError( 'Question not found' )
  }

  if( question.state !== 'active' ) {
    throw new ConflictError( 'Only an active question can be dropped' )
  }

  setState( userId, [ id ], 'dropped' )

  return toMeleteQuestion( { ...question, state: 'dropped' } )
}

export const updateSubject = (
  userId: string,
  id: string,
  changes: UpdateMeleteSubjectBody,
  now = new Date(),
): MeleteSubject => {
  requireSubject( userId, id )

  if( changes.goal_id !== undefined && changes.goal_id !== null ) {
    const goal = findGoal( userId, changes.goal_id )

    if( goal === undefined ) {
      throw new NotFoundError( 'Goal not found' )
    }

    if( goal.status !== 'active' ) {
      throw new ValidationError( 'Only an active goal can be linked' )
    }
  }

  // A blank intent is no intent
  const intent = changes.intent === undefined || changes.intent === null
    ? changes.intent
    : changes.intent.trim() || null
  const updated = updateStoredSubject( userId, id, { ...changes, intent } )

  if( updated === undefined ) {
    throw new NotFoundError( 'Subject not found' )
  }

  return toMeleteSubject( userId, updated, now )
}

// The subjects whose folder is still a direct child of the learning root
export const listSubjectsInRoot = async (
  userId: string,
  learningRoot: string,
): Promise< SubjectRecord[] > => {
  const folders = new Set( await listSubjectFolders( vaultRootFor( userId ), learningRoot ) )

  return listSubjects( userId ).filter( ( { folder } ) => folders.has( folder ) )
}

export const getToday = async (
  userId: string,
  now = new Date(),
): Promise< GetMeleteTodayResponse > => {
  const learningRoot = getLearningRoot( userId )

  if( learningRoot === null ) {
    return {
      learning_root: null,
      subjects: [],
      totals: { due: 0, new_remaining: 0, learning_soon: 0 },
      skipped_paths: [],
    }
  }

  await scanLearningRoot( userId, { now } )

  const records = await listSubjectsInRoot( userId, learningRoot )
  const subjects = records
    .map( ( subject ) => toMeleteSubject( userId, subject, now ) )
    .sort( ( a, b ) => a.name.localeCompare( b.name, undefined, { sensitivity: 'base' } ) )

  return {
    learning_root: learningRoot,
    subjects,
    totals: reviewCounts( userId, records, now ),
    skipped_paths: lastSkipped( userId ),
  }
}

export const getSubject = async (
  userId: string,
  id: string,
  now = new Date(),
): Promise< GetMeleteSubjectResponse > => {
  await scanLearningRoot( userId, { now } )

  const learningRoot = getLearningRoot( userId )

  if( learningRoot === null ) {
    throw new ConflictError( 'Choose a learning root first' )
  }

  return subjectView( userId, requireSubjectInRoot( userId, id, learningRoot ), now )
}

export const getNote = ( userId: string, id: string ): GetMeleteNoteResponse => {
  return noteView( userId, requireNote( userId, id ) )
}
