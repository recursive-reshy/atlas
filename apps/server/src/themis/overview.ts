// Melete
import { rollUp } from '../melete/mastery.js'
import type { ConceptStat } from '../melete/mastery.js'

// A learning goal's progress: coverage and mastery over every concept of its linked subjects,
// each concept counting once (ADR 0092), so a big subject weighs more than a small one
export const pooledLearning = (
  groups: ConceptStat[][],
): { coverage: number | null, mastery: number | null, concept_count: number } => {
  const stats = groups.flat()
  const totals = rollUp( stats )

  return {
    coverage: totals?.coverage ?? null,
    mastery: totals?.mastery ?? null,
    concept_count: stats.length,
  }
}
