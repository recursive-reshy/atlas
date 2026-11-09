// Claude sees concepts as short refs (c1…cN) and the server maps them back to ids, so it can't
// invent an id (ADR 0089)
export type RefConcept = { id: string, name: string, description: string }

export const MAX_NOTE_CONCEPTS = 5

export const conceptRefs = < Concept extends RefConcept >(
  concepts: Concept[],
): ( Concept & { ref: string } )[] => {
  return concepts.map( ( concept, index ) => ( { ...concept, ref: `c${ index + 1 }` } ) )
}

export const buildConceptList = ( concepts: RefConcept[] ): string => {
  return conceptRefs( concepts ).map( ( { ref, name, description } ) => {
    return description === '' ? `${ ref }: ${ name }` : `${ ref }: ${ name } — ${ description }`
  } ).join( '\n' )
}

// Known refs only, each once, in the order given, at most five
export const resolveRefs = ( refs: string[], concepts: RefConcept[] ): string[] => {
  const byRef = new Map( conceptRefs( concepts ).map( ( { ref, id } ) => [ ref, id ] ) )
  const ids = refs.flatMap( ( ref ) => {
    const id = byRef.get( ref.trim().toLowerCase() )

    return id === undefined ? [] : [ id ]
  } )

  return [ ...new Set( ids ) ].slice( 0, MAX_NOTE_CONCEPTS )
}
