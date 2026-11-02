// Shared
import type { MeleteReviewCounts } from '@atlas/shared'
// Melete
import { dayStart } from './day.js'
// Repositories
import {
  countBySubject,
  listLearningSoon,
} from '../repositories/meleteQuestions.repository.js'
import { countNewReviewedSince } from '../repositories/meleteReviews.repository.js'
import type { SubjectRecord } from '../repositories/meleteSubjects.repository.js'

// Anki's learn-ahead limit: an Again comes back within the session
export const LEARN_AHEAD_MS = 20 * 60_000

// New questions a subject may still serve today; a served but unrated one isn't used up yet
export const newRemaining = ( userId: string, subject: SubjectRecord, now: Date ): number => {
  const used = countNewReviewedSince( userId, subject.id, dayStart( now ).toISOString() )

  return Math.max( subject.new_per_day - used, 0 )
}

// Learning cards coming up within the learn-ahead limit, not yet due
export const countLearningSoon = ( userId: string, subjectIds: string[], now: Date ): number => {
  return listLearningSoon( userId, {
    subjectIds,
    until: new Date( now.getTime() + LEARN_AHEAD_MS ).toISOString(),
  } ).filter( ( { due } ) => due !== null && due > now.toISOString() ).length
}

export const reviewCounts = (
  userId: string,
  subjects: SubjectRecord[],
  now: Date,
): MeleteReviewCounts => {
  const ids = new Set( subjects.map( ( { id } ) => id ) )
  const counts = countBySubject( userId, now.toISOString() ).filter( ( { subject_id } ) => {
    return ids.has( subject_id )
  } )

  return {
    due: counts.reduce( ( sum, { due } ) => sum + due, 0 ),
    new_remaining: subjects.reduce( ( sum, subject ) => {
      const available = counts.find( ( { subject_id } ) => subject_id === subject.id )
        ?.new_available ?? 0

      return sum + Math.min( newRemaining( userId, subject, now ), available )
    }, 0 ),
    learning_soon: countLearningSoon( userId, [ ...ids ], now ),
  }
}
