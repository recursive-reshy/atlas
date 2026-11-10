const CENTS = 0.01
const SECONDS_PER_MINUTE = 60

export const formatCost = ( cost: number | null ): string => {
  if( cost === null ) {
    return '—'
  }

  if( cost > 0 && cost < CENTS ) {
    return '<$0.01'
  }

  return `$${ cost.toFixed( 2 ) }`
}

// null when no cost is known, so a user with no priced runs shows a dash rather than $0.00.
export const sumCost = ( costs: ( number | null )[] ): number | null => {
  const known = costs.filter( ( cost ) => cost !== null )

  return known.length === 0 ? null : known.reduce( ( sum, cost ) => sum + cost, 0 )
}

export const formatMinutes = ( seconds: number ): string => {
  return `${ Math.round( seconds / SECONDS_PER_MINUTE ) } min`
}
