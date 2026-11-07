// Shared
import type { GetMeleteGapsResponse, SuggestMeleteResourcesResponse } from '@atlas/shared'

export const BASICS_ID = '1a2b3c4d-0000-4000-8000-000000000001'
export const ADVANCED_ID = '1a2b3c4d-0000-4000-8000-000000000002'
export const GENERICS_ID = '1a2b3c4d-0000-4000-8000-000000000011'
export const NARROWING_ID = '1a2b3c4d-0000-4000-8000-000000000012'
export const UNIONS_ID = '1a2b3c4d-0000-4000-8000-000000000013'

// Basics: Generics is solid, Narrowing weak. Advanced: Unions is not covered.
export const gapsFixture = (
  overrides: Partial< GetMeleteGapsResponse > = {},
): GetMeleteGapsResponse => {
  return {
    coverage: 2 / 3,
    mastery: 0.5,
    sections: [
      {
        id: BASICS_ID,
        name: 'Basics',
        coverage: 1,
        mastery: 0.75,
        concepts: [
          {
            id: GENERICS_ID,
            name: 'Generics',
            description: 'Types with parameters',
            bucket: 'solid',
            mastery: 0.9,
            note_count: 2,
            question_count: 4,
          },
          {
            id: NARROWING_ID,
            name: 'Narrowing',
            description: '',
            bucket: 'weak',
            mastery: 0.3,
            note_count: 1,
            question_count: 2,
          },
        ],
      },
      {
        id: ADVANCED_ID,
        name: 'Advanced',
        coverage: 0,
        mastery: 0,
        concepts: [ {
          id: UNIONS_ID,
          name: 'Unions',
          description: 'Either-or types',
          bucket: 'uncovered',
          mastery: 0,
          note_count: 0,
          question_count: 0,
        } ],
      },
    ],
    next_step: { kind: 'cover', concept_id: UNIONS_ID },
    ...overrides,
  }
}

export const suggestionsFixture = (): SuggestMeleteResourcesResponse => ( {
  suggestions: [
    {
      title: 'Effective TypeScript',
      by: 'Dan Vanderkam',
      kind: 'book',
      why: 'Short, practical items on unions and narrowing.',
      query: 'effective typescript book',
    },
    {
      title: 'TypeScript Handbook: Narrowing',
      by: 'Microsoft',
      kind: 'docs',
      why: 'The official reference.',
      query: 'typescript handbook narrowing',
    },
    {
      title: 'Total TypeScript: unions',
      by: 'Matt Pocock',
      kind: 'video',
      why: 'A short walk-through.',
      query: 'matt pocock unions typescript',
    },
  ],
} )
