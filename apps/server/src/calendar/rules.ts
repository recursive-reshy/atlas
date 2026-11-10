// A rule as the matcher reads it; the full record carries more
export type MatchableRule = {
  id: string
  phrase: string
  position: number
  subject_id: string | null
  goal_id: string | null
}

// The first rule by position whose phrase the title contains, ignoring case (ADR 0108). The
// phrase is plain text, never a pattern.
export const matchRule = < Rule extends MatchableRule >(
  title: string,
  rules: Rule[],
): Rule | undefined => {
  const lowered = title.toLowerCase()

  return [ ...rules ]
    .sort( ( a, b ) => a.position - b.position )
    .find( ( { phrase } ) => {
      const wanted = phrase.trim().toLowerCase()

      return wanted !== '' && lowered.includes( wanted )
    } )
}
