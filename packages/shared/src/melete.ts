// Packages
import { z } from 'zod'

export const MeleteRating = z.enum( [ 'again', 'hard', 'good', 'easy' ] )
export type MeleteRating = z.infer< typeof MeleteRating >

export const MeleteReviewMode = z.enum( [ 'typed', 'quick' ] )
export type MeleteReviewMode = z.infer< typeof MeleteReviewMode >

export const MeleteGeneration = z.enum( [ 'idle', 'queued', 'generating', 'failed' ] )
export type MeleteGeneration = z.infer< typeof MeleteGeneration >

export const MeleteQuestionState = z.enum( [ 'active', 'dropped', 'retired' ] )
export type MeleteQuestionState = z.infer< typeof MeleteQuestionState >

export const MeleteFsrsState = z.enum( [ 'new', 'learning', 'review', 'relearning' ] )
export type MeleteFsrsState = z.infer< typeof MeleteFsrsState >

export const MeleteTargetLevel = z.enum( [ 'awareness', 'working', 'proficient', 'expert' ] )
export type MeleteTargetLevel = z.infer< typeof MeleteTargetLevel >

export const MeleteSyllabusStatus = z.enum( [ 'none', 'drafting', 'draft', 'approved', 'failed' ] )
export type MeleteSyllabusStatus = z.infer< typeof MeleteSyllabusStatus >

export const MeleteMapping = z.enum( [ 'idle', 'queued', 'mapping', 'failed' ] )
export type MeleteMapping = z.infer< typeof MeleteMapping >

export const MeleteOffSyllabus = z.enum( [ 'flagged', 'dismissed' ] )
export type MeleteOffSyllabus = z.infer< typeof MeleteOffSyllabus >

const SuggestedRating = z.enum( [ 'again', 'hard', 'good' ] )

export const MeleteSubject = z.object( {
  id: z.uuid(),
  name: z.string(),
  folder: z.string(),
  auto_enroll: z.boolean(),
  new_per_day: z.int().min( 0 ).max( 100 ),
  note_count: z.int().min( 0 ),
  enrolled_count: z.int().min( 0 ),
  due_count: z.int().min( 0 ),
  new_available: z.int().min( 0 ),
  new_remaining_today: z.int().min( 0 ),
  target_level: MeleteTargetLevel.nullable(),
  intent: z.string().nullable(),
  syllabus_status: MeleteSyllabusStatus,
  syllabus_error: z.string().nullable(),
  // Null until the syllabus is approved and has concepts
  coverage: z.number().min( 0 ).max( 1 ).nullable(),
  mastery: z.number().min( 0 ).max( 1 ).nullable(),
  concept_count: z.int().min( 0 ).nullable(),
} )
export type MeleteSubject = z.infer< typeof MeleteSubject >

export const MeleteNote = z.object( {
  id: z.uuid(),
  subject_id: z.uuid(),
  path: z.string(),
  title: z.string(),
  enrolled: z.boolean(),
  generation: MeleteGeneration,
  generation_error: z.string().nullable(),
  question_count: z.int().min( 0 ),
  stale: z.boolean(),
  missing: z.boolean(),
  mapping: MeleteMapping,
  mapping_error: z.string().nullable(),
  // A hand-mapped note is skipped by automatic remaps (ADR 0089)
  mapping_pinned: z.boolean(),
  off_syllabus: MeleteOffSyllabus.nullable(),
  off_syllabus_suggestion: z.string().nullable(),
  // Concepts the note is mapped to, in syllabus order
  concept_ids: z.array( z.uuid() ),
} )
export type MeleteNote = z.infer< typeof MeleteNote >

export const MeleteQuestion = z.object( {
  id: z.uuid(),
  note_id: z.uuid(),
  position: z.int().min( 1 ),
  prompt: z.string(),
  answer: z.string(),
  passage: z.string(),
  state: MeleteQuestionState,
  fsrs_state: MeleteFsrsState,
  due: z.iso.datetime().nullable(),
  reps: z.int().min( 0 ),
  lapses: z.int().min( 0 ),
  last_review: z.iso.datetime().nullable(),
} )
export type MeleteQuestion = z.infer< typeof MeleteQuestion >

export const MeleteReviewItem = z.object( {
  question: MeleteQuestion,
  note: z.object( {
    id: z.uuid(),
    title: z.string(),
    path: z.string(),
    subject_name: z.string(),
  } ),
  obsidian_url: z.string().nullable(),
} )
export type MeleteReviewItem = z.infer< typeof MeleteReviewItem >

export const MeleteReviewCounts = z.object( {
  due: z.int().min( 0 ),
  new_remaining: z.int().min( 0 ),
  learning_soon: z.int().min( 0 ),
} )
export type MeleteReviewCounts = z.infer< typeof MeleteReviewCounts >

export const MeleteGrade = z.object( {
  verdict: z.enum( [ 'correct', 'partial', 'incorrect' ] ),
  right: z.array( z.string() ).max( 6 ),
  missed: z.array( z.string() ).max( 6 ),
  feedback: z.string().min( 1 ).max( 600 ),
  suggested_rating: SuggestedRating,
} )
export type MeleteGrade = z.infer< typeof MeleteGrade >

export const MeleteQuestionsOutput = z.object( {
  questions: z.array( z.object( {
    prompt: z.string().min( 1 ).max( 500 ),
    answer: z.string().min( 1 ).max( 1500 ),
    passage: z.string().max( 1500 ),
  } ) ).min( 1 ).max( 10 ),
} )
export type MeleteQuestionsOutput = z.infer< typeof MeleteQuestionsOutput >

// Generate for an approved syllabus (ADR 0089): concept refs (c1…), not ids, so Claude can't
// invent one
export const MeleteApprovedQuestionsOutput = z.object( {
  concepts: z.array( z.string() ).max( 5 ),
  off_syllabus: z.object( { suggested_concept: z.string().max( 200 ) } ).nullable(),
  questions: z.array( z.object( {
    prompt: z.string().min( 1 ).max( 500 ),
    answer: z.string().min( 1 ).max( 1500 ),
    passage: z.string().max( 1500 ),
    concept: z.string(),
  } ) ).min( 1 ).max( 10 ),
} )
export type MeleteApprovedQuestionsOutput = z.infer< typeof MeleteApprovedQuestionsOutput >

// Map: where the note belongs in the syllabus and which concept each of its questions tests;
// questions are numbered from 1 in the order they were sent (ADR 0089)
export const MeleteMapOutput = z.object( {
  concepts: z.array( z.string() ).max( 5 ),
  off_syllabus: z.object( { suggested_concept: z.string().max( 200 ) } ).nullable(),
  labels: z.array( z.object( { question: z.int().min( 1 ), concept: z.string() } ) ).max( 50 ),
} )
export type MeleteMapOutput = z.infer< typeof MeleteMapOutput >

export const MeleteGradeOutput = MeleteGrade
export type MeleteGradeOutput = MeleteGrade

export const GetMeleteTodayResponse = z.object( {
  learning_root: z.string().nullable(),
  subjects: z.array( MeleteSubject ),
  totals: MeleteReviewCounts,
  // Vault paths the last scan could not read; [] when none or before the first scan
  skipped_paths: z.array( z.string() ),
} )
export type GetMeleteTodayResponse = z.infer< typeof GetMeleteTodayResponse >

export const GetMeleteSubjectResponse = z.object( {
  subject: MeleteSubject,
  notes: z.array( MeleteNote ),
} )
export type GetMeleteSubjectResponse = z.infer< typeof GetMeleteSubjectResponse >

export const UpdateMeleteSubjectBody = z.object( {
  auto_enroll: z.boolean().optional(),
  new_per_day: z.int().min( 0 ).max( 100 ).optional(),
  target_level: MeleteTargetLevel.optional(),
  intent: z.string().max( 500 ).nullable().optional(),
} ).refine(
  ( body ) => Object.values( body ).some( ( value ) => value !== undefined ),
  { message: 'Provide auto_enroll, new_per_day, target_level or intent' },
)
export type UpdateMeleteSubjectBody = z.infer< typeof UpdateMeleteSubjectBody >

export const EnrollSubjectBody = z.object( { enrolled: z.boolean() } )
export type EnrollSubjectBody = z.infer< typeof EnrollSubjectBody >

export const UpdateMeleteNoteBody = z.object( { enrolled: z.boolean() } )
export type UpdateMeleteNoteBody = z.infer< typeof UpdateMeleteNoteBody >

// A hand mapping (ADR 0089): the note is pinned to exactly these concepts
export const UpdateNoteConceptsBody = z.object( { concept_ids: z.array( z.uuid() ).max( 10 ) } )
export type UpdateNoteConceptsBody = z.infer< typeof UpdateNoteConceptsBody >

export const OffSyllabusActionBody = z.discriminatedUnion( 'action', [
  z.object( { action: z.literal( 'dismiss' ) } ),
  z.object( {
    action: z.literal( 'add_concept' ),
    section_id: z.uuid(),
    // The note's suggestion when left out
    name: z.string().trim().min( 1 ).max( 200 ).optional(),
  } ),
] )
export type OffSyllabusActionBody = z.infer< typeof OffSyllabusActionBody >

export const GetMeleteNoteResponse = z.object( {
  note: MeleteNote,
  questions: z.array( MeleteQuestion ),
  obsidian_url: z.string().nullable(),
} )
export type GetMeleteNoteResponse = z.infer< typeof GetMeleteNoteResponse >

export const GetNextReviewResponse = z.object( {
  item: MeleteReviewItem.nullable(),
  counts: MeleteReviewCounts,
} )
export type GetNextReviewResponse = z.infer< typeof GetNextReviewResponse >

export const GradeAnswerBody = z.object( { answer: z.string().max( 4000 ) } )
export type GradeAnswerBody = z.infer< typeof GradeAnswerBody >

export const GradeAnswerResponse = z.discriminatedUnion( 'outcome', [
  z.object( { outcome: z.literal( 'graded' ), grade: MeleteGrade, run_id: z.int() } ),
  z.object( { outcome: z.literal( 'skipped' ), reason: z.literal( 'blank' ) } ),
  z.object( {
    outcome: z.literal( 'failed' ),
    reason: z.string(),
    run_id: z.int().nullable(),
  } ),
] )
export type GradeAnswerResponse = z.infer< typeof GradeAnswerResponse >

export const RecordReviewBody = z.object( {
  rating: MeleteRating,
  mode: MeleteReviewMode,
  answer: z.string().max( 4000 ).optional(),
  grade_run_id: z.int().optional(),
  suggested_rating: SuggestedRating.optional(),
} )
export type RecordReviewBody = z.infer< typeof RecordReviewBody >

export const RecordReviewResponse = z.object( {
  question: MeleteQuestion,
  counts: MeleteReviewCounts,
} )
export type RecordReviewResponse = z.infer< typeof RecordReviewResponse >

// A syllabus is sections of concepts, two levels only; at most 80 concepts (ADR 0089)
export const MELETE_MAX_CONCEPTS = 80

const ConceptName = z.string().trim().min( 1 ).max( 200 )
const ConceptDescription = z.string().trim().max( 400 )
const SectionName = z.string().trim().min( 1 ).max( 200 )

export const MeleteConcept = z.object( {
  id: z.uuid(),
  name: ConceptName,
  description: ConceptDescription,
} )
export type MeleteConcept = z.infer< typeof MeleteConcept >

export const MeleteSection = z.object( {
  id: z.uuid(),
  name: SectionName,
  concepts: z.array( MeleteConcept ),
} )
export type MeleteSection = z.infer< typeof MeleteSection >

export const MeleteSyllabus = z.object( { sections: z.array( MeleteSection ) } )
export type MeleteSyllabus = z.infer< typeof MeleteSyllabus >

// What the editor sends back: existing ids kept, new rows without one
export const MeleteSyllabusEdit = z.object( {
  sections: z.array( z.object( {
    id: z.uuid().optional(),
    name: SectionName,
    concepts: z.array( z.object( {
      id: z.uuid().optional(),
      name: ConceptName,
      description: ConceptDescription,
    } ) ).min( 1 ),
  } ) ),
} ).refine(
  ( { sections } ) => {
    return sections.reduce( ( total, { concepts } ) => total + concepts.length, 0 )
      <= MELETE_MAX_CONCEPTS
  },
  { message: `A syllabus has at most ${ MELETE_MAX_CONCEPTS } concepts` },
)
export type MeleteSyllabusEdit = z.infer< typeof MeleteSyllabusEdit >

export const MeleteSyllabusDiff = z.object( {
  renamed: z.int().min( 0 ),
  added: z.int().min( 0 ),
  removed: z.int().min( 0 ),
  moved: z.int().min( 0 ),
} )
export type MeleteSyllabusDiff = z.infer< typeof MeleteSyllabusDiff >

// Claude's draft: names only, no ids
export const MeleteSyllabusOutput = z.object( {
  sections: z.array( z.object( {
    name: z.string(),
    concepts: z.array( z.object( { name: z.string(), description: z.string() } ) ),
  } ) ).min( 1 ),
} )
export type MeleteSyllabusOutput = z.infer< typeof MeleteSyllabusOutput >

export const SaveMeleteSyllabusResponse = z.object( {
  syllabus: MeleteSyllabus,
  diff: MeleteSyllabusDiff,
} )
export type SaveMeleteSyllabusResponse = z.infer< typeof SaveMeleteSyllabusResponse >

export const ApproveMeleteSyllabusResponse = z.object( { subject: MeleteSubject } )
export type ApproveMeleteSyllabusResponse = z.infer< typeof ApproveMeleteSyllabusResponse >

// Remap all: how many notes were queued for Map
export const RemapMeleteSyllabusResponse = z.object( { queued: z.int().min( 0 ) } )
export type RemapMeleteSyllabusResponse = z.infer< typeof RemapMeleteSyllabusResponse >
