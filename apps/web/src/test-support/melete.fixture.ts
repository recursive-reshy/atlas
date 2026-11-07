// Shared
import type {
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GetMeleteTodayResponse,
  MeleteGrade,
  MeleteNote,
  MeleteQuestion,
  MeleteReviewItem,
  MeleteSubject,
} from '@atlas/shared'

export const SUBJECT_ID = '3b1c8f2e-6a4d-4e0b-9c57-1d2e3f4a5b6c'
export const NOTE_ID = '5c2d9a3f-7b5e-4f1c-8d68-2e3f4a5b6c7d'
export const QUESTION_ID = '8e4f1b5a-9d7c-4a3e-b0f9-4a5b6c7d8e9f'

export const meleteSubjectFixture = ( overrides: Partial< MeleteSubject > = {} ): MeleteSubject => {
  return {
    id: SUBJECT_ID,
    name: 'TypeScript',
    folder: 'Learning/TypeScript',
    auto_enroll: false,
    new_per_day: 10,
    note_count: 8,
    enrolled_count: 3,
    due_count: 4,
    new_available: 6,
    new_remaining_today: 5,
    target_level: null,
    intent: null,
    syllabus_status: 'none',
    syllabus_error: null,
    coverage: null,
    mastery: null,
    concept_count: null,
    ...overrides,
  }
}

export const meleteNoteFixture = ( overrides: Partial< MeleteNote > = {} ): MeleteNote => {
  return {
    id: NOTE_ID,
    subject_id: SUBJECT_ID,
    path: 'Learning/TypeScript/Generics.md',
    title: 'Generics',
    enrolled: true,
    generation: 'idle',
    generation_error: null,
    question_count: 4,
    stale: false,
    missing: false,
    mapping: 'idle',
    mapping_error: null,
    mapping_pinned: false,
    off_syllabus: null,
    off_syllabus_suggestion: null,
    concept_ids: [],
    ...overrides,
  }
}

export const meleteQuestionFixture = (
  overrides: Partial< MeleteQuestion > = {},
): MeleteQuestion => {
  return {
    id: QUESTION_ID,
    note_id: NOTE_ID,
    position: 1,
    prompt: 'What does a type parameter do?',
    answer: 'It stands for a type chosen by the caller.',
    passage: 'A type parameter is a placeholder for a type.',
    state: 'active',
    fsrs_state: 'new',
    due: null,
    reps: 0,
    lapses: 0,
    last_review: null,
    ...overrides,
  }
}

export const meleteTodayFixture = (
  overrides: Partial< GetMeleteTodayResponse > = {},
): GetMeleteTodayResponse => {
  return {
    learning_root: 'Learning',
    subjects: [ meleteSubjectFixture() ],
    totals: { due: 4, new_remaining: 5, learning_soon: 0 },
    skipped_paths: [],
    ...overrides,
  }
}

export const meleteSubjectResponseFixture = (
  overrides: Partial< GetMeleteSubjectResponse > = {},
): GetMeleteSubjectResponse => {
  return { subject: meleteSubjectFixture(), notes: [ meleteNoteFixture() ], ...overrides }
}

export const meleteNoteResponseFixture = (
  overrides: Partial< GetMeleteNoteResponse > = {},
): GetMeleteNoteResponse => {
  return {
    note: meleteNoteFixture(),
    questions: [ meleteQuestionFixture() ],
    obsidian_url: null,
    ...overrides,
  }
}

export const OBSIDIAN_URL = 'obsidian://open?vault=Brain&file=Learning%2FTypeScript%2FGenerics'

export const meleteReviewItemFixture = (
  overrides: Partial< MeleteReviewItem > = {},
): MeleteReviewItem => {
  return {
    question: meleteQuestionFixture(),
    note: {
      id: NOTE_ID,
      title: 'Generics',
      path: 'Learning/TypeScript/Generics.md',
      subject_name: 'TypeScript',
    },
    obsidian_url: OBSIDIAN_URL,
    ...overrides,
  }
}

export const meleteGradeFixture = ( overrides: Partial< MeleteGrade > = {} ): MeleteGrade => {
  return {
    verdict: 'partial',
    right: [ 'It is a placeholder for a type' ],
    missed: [ 'The caller chooses the type' ],
    feedback: 'You have the idea but not who picks the type.',
    suggested_rating: 'hard',
    ...overrides,
  }
}
