// Shared
import type { MeleteSyllabus } from '@atlas/shared'

export const SECTION_ONE = '6a1c8f2e-6a4d-4e0b-9c57-1d2e3f4a5b01'
export const SECTION_TWO = '6a1c8f2e-6a4d-4e0b-9c57-1d2e3f4a5b02'
export const SQL_ID = '7b2d9a3f-7b5e-4f1c-8d68-2e3f4a5b6c11'
export const JOINS_ID = '7b2d9a3f-7b5e-4f1c-8d68-2e3f4a5b6c12'
export const WINDOWS_ID = '7b2d9a3f-7b5e-4f1c-8d68-2e3f4a5b6c21'

// Basics (SQL, Joins) and Advanced (Windows)
export const syllabusFixture = (): MeleteSyllabus => ( {
  sections: [
    {
      id: SECTION_ONE,
      name: 'Basics',
      concepts: [
        { id: SQL_ID, name: 'SQL', description: 'Queries' },
        { id: JOINS_ID, name: 'Joins', description: 'Combining tables' },
      ],
    },
    {
      id: SECTION_TWO,
      name: 'Advanced',
      concepts: [ { id: WINDOWS_ID, name: 'Windows', description: 'Frames' } ],
    },
  ],
} )

export const DIFF = { renamed: 1, added: 0, removed: 0, moved: 0 }
