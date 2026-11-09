// Shared
import type { GetMeleteGapsResponse } from '@atlas/shared'
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Melete
import { computeConceptStats, nextStep, rollUp } from '../melete/mastery.js'
// Repositories
import { listConceptUsage, listConcepts } from '../repositories/meleteConcepts.repository.js'
import { listSections } from '../repositories/meleteSections.repository.js'
import { findSubject } from '../repositories/meleteSubjects.repository.js'
// Services
import { getMasteryDays } from './settings.service.js'

// Where the learner stands against the approved syllabus (ADR 0090), computed on read
export const getGaps = ( userId: string, subjectId: string ): GetMeleteGapsResponse => {
  const subject = findSubject( userId, subjectId )

  if( subject === undefined ) {
    throw new NotFoundError( 'Subject not found' )
  }

  if( subject.syllabus_status !== 'approved' ) {
    throw new ConflictError( 'The subject has no approved syllabus' )
  }

  const concepts = listConcepts( userId, subjectId )
  const stats = computeConceptStats(
    listConceptUsage( userId, subjectId ).map( ( usage ) => ( {
      id: usage.id,
      sectionId: usage.section_id,
      noteCount: usage.note_count,
      questions: usage.questions,
    } ) ),
    getMasteryDays( userId ),
  )
  const total = rollUp( stats )

  return {
    coverage: total?.coverage ?? null,
    mastery: total?.mastery ?? null,
    sections: listSections( userId, subjectId ).map( ( section ) => {
      const own = stats.filter( ( { section_id: id } ) => id === section.id )
      const roll = rollUp( own )

      return {
        id: section.id,
        name: section.name,
        coverage: roll?.coverage ?? null,
        mastery: roll?.mastery ?? null,
        concepts: own.map( ( stat ) => {
          const concept = concepts.find( ( { id } ) => id === stat.id )

          return {
            id: stat.id,
            name: concept?.name ?? '',
            description: concept?.description ?? '',
            bucket: stat.bucket,
            mastery: stat.mastery,
            note_count: stat.note_count,
            question_count: stat.question_count,
          }
        } ),
      }
    } ),
    next_step: nextStep( stats ),
  }
}
