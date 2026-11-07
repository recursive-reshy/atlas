// Shared
import type { GetMeleteNoteResponse, OffSyllabusActionBody } from '@atlas/shared'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { insertConcept, listConcepts } from '../repositories/meleteConcepts.repository.js'
import { setNoteConcepts } from '../repositories/meleteNoteConcepts.repository.js'
import type { NoteRecord } from '../repositories/meleteNotes.repository.js'
import {
  findNote,
  queueMappingFlagged,
  updateNote,
} from '../repositories/meleteNotes.repository.js'
import { listForNote, setQuestionConcept } from '../repositories/meleteQuestions.repository.js'
import { listSections } from '../repositories/meleteSections.repository.js'
import { findSubject } from '../repositories/meleteSubjects.repository.js'
// Services
import { noteView } from './melete.service.js'

const requireNote = ( userId: string, noteId: string ): NoteRecord => {
  const note = findNote( userId, noteId )

  if( note === undefined ) {
    throw new NotFoundError( 'Note not found' )
  }

  return note
}

const requireApproved = ( userId: string, note: NoteRecord ): void => {
  if( findSubject( userId, note.subject_id )?.syllabus_status !== 'approved' ) {
    throw new ConflictError( 'The subject has no approved syllabus' )
  }
}

// The one place a hand mapping is written (ADR 0089): the note is pinned to these concepts, the
// flag goes, and a labels-only Map relabels its questions. With no concepts there is nothing for
// Map to label from, so the questions are unlabelled here.
const pinByHand = ( userId: string, note: NoteRecord, conceptIds: string[] ): void => {
  setNoteConcepts( userId, note.id, conceptIds, 'hand' )

  if( conceptIds.length === 0 ) {
    for( const { id, state } of listForNote( userId, note.id ) ) {
      if( state === 'active' ) {
        setQuestionConcept( userId, id, null )
      }
    }
  }

  const queue = conceptIds.length > 0 && note.enrolled && note.missing_at === null

  updateNote( userId, note.id, {
    mapping: queue ? 'queued' : 'idle',
    mapping_error: null,
    mapping_pinned: true,
    off_syllabus: null,
    off_syllabus_suggestion: null,
  } )
}

export const setNoteConceptsByHand = (
  userId: string,
  noteId: string,
  conceptIds: string[],
): GetMeleteNoteResponse => {
  const note = requireNote( userId, noteId )

  requireApproved( userId, note )

  const wanted = new Set( conceptIds )
  const ordered = listConcepts( userId, note.subject_id )
    .filter( ( { id } ) => wanted.has( id ) )
    .map( ( { id } ) => id )

  if( ordered.length !== wanted.size ) {
    throw new ValidationError( 'A concept is not part of this subject\'s syllabus' )
  }

  getDatabase().transaction( () => pinByHand( userId, note, ordered ) )()

  return noteView( userId, requireNote( userId, noteId ) )
}

export const applyOffSyllabusAction = (
  userId: string,
  noteId: string,
  body: OffSyllabusActionBody,
): GetMeleteNoteResponse => {
  const note = requireNote( userId, noteId )

  if( note.off_syllabus !== 'flagged' ) {
    throw new ConflictError( 'The note is not flagged as off-syllabus' )
  }

  if( body.action === 'dismiss' ) {
    updateNote( userId, noteId, { off_syllabus: 'dismissed' } )

    return noteView( userId, requireNote( userId, noteId ) )
  }

  const name = ( body.name ?? note.off_syllabus_suggestion ?? '' ).trim()

  if( name === '' ) {
    throw new ValidationError( 'Give the new concept a name' )
  }

  const section = listSections( userId, note.subject_id ).find( ( { id } ) => {
    return id === body.section_id
  } )

  if( section === undefined ) {
    throw new NotFoundError( 'Section not found' )
  }

  const concepts = listConcepts( userId, note.subject_id )

  if( concepts.some( ( concept ) => concept.name.toLowerCase() === name.toLowerCase() ) ) {
    throw new ConflictError( 'The syllabus already has a concept with that name' )
  }

  const last = concepts.filter( ( { section_id: id } ) => id === section.id )
    .reduce( ( position, concept ) => Math.max( position, concept.position ), -1 )

  getDatabase().transaction( () => {
    const added = insertConcept( userId, {
      subject_id: note.subject_id,
      section_id: section.id,
      name,
      description: '',
      position: last + 1,
    } )

    pinByHand( userId, note, [ added.id ] )
    // A concept was added, so the other notes that fitted none may fit it now (TRD §4.3)
    queueMappingFlagged( userId, note.subject_id )
  } )()

  return noteView( userId, requireNote( userId, noteId ) )
}
