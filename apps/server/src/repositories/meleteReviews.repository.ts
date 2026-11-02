// Packages
import { z } from 'zod'
// Shared
import { MeleteRating, MeleteReviewMode } from '@atlas/shared'
// Repositories
import { getDatabase } from './database.js'

export const NewReview = z.object( {
  question_id: z.string(),
  reviewed_at: z.string(),
  mode: MeleteReviewMode,
  rating: MeleteRating,
  suggested_rating: z.enum( [ 'again', 'hard', 'good' ] ).nullable(),
  answer: z.string().nullable(),
  grade_run_id: z.int().nullable(),
  was_new: z.boolean(),
  before_state: z.string(),
} )
export type NewReview = z.infer< typeof NewReview >

export const insertReview = ( userId: string, review: NewReview ): number => {
  const { lastInsertRowid } = getDatabase()
    .prepare( `INSERT INTO melete_reviews (
        user_id, question_id, reviewed_at, mode, rating, suggested_rating, answer, grade_run_id,
        was_new, before_state
      ) VALUES (
        @user_id, @question_id, @reviewed_at, @mode, @rating, @suggested_rating, @answer,
        @grade_run_id, @was_new, @before_state
      )` )
    .run( { ...review, was_new: review.was_new ? 1 : 0, user_id: userId } )

  return Number( lastInsertRowid )
}

export const countNewReviewedSince = (
  userId: string,
  subjectId: string,
  since: string,
): number => {
  const row = getDatabase()
    .prepare( `SELECT COUNT(*) AS count
      FROM melete_reviews r
        JOIN melete_questions q ON q.id = r.question_id
        JOIN melete_notes n ON n.id = q.note_id
      WHERE r.user_id = ? AND n.subject_id = ? AND r.was_new = 1 AND r.reviewed_at >= ?` )
    .get( userId, subjectId, since ) as { count: number }

  return row.count
}
