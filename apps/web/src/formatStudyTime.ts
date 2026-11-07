// Whole minutes, rounded, with hours from 60 minutes: "0 min", "45 min", "1 h 5 min"
export const formatStudyTime = ( seconds: number ): string => {
  const minutes = Math.round( seconds / 60 )
  const hours = Math.floor( minutes / 60 )
  const rest = minutes % 60

  if( hours === 0 ) {
    return `${ rest } min`
  }

  return rest === 0 ? `${ hours } h` : `${ hours } h ${ rest } min`
}
