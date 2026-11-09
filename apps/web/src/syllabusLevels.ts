// Shared
import type { MeleteTargetLevel } from '@atlas/shared'

export const LEVELS: { value: MeleteTargetLevel, label: string, hint: string }[] = [
  {
    value: 'awareness',
    label: 'Awareness',
    hint: 'Know the terms and what the subject is for.',
  },
  {
    value: 'working',
    label: 'Working knowledge',
    hint: 'Use it for everyday tasks with the docs open.',
  },
  {
    value: 'proficient',
    label: 'Proficient',
    hint: 'Solve most problems on your own and explain why.',
  },
  {
    value: 'expert',
    label: 'Expert',
    hint: 'Handle the edge cases and teach it to others.',
  },
]
