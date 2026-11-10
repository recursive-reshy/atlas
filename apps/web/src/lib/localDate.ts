const pad = ( value: number ): string => String( value ).padStart( 2, '0' )

// The calendar date on the device, as YYYY-MM-DD (not UTC, so late evening is still today)
export const localDate = ( date: Date ): string => {
  return `${ date.getFullYear() }-${ pad( date.getMonth() + 1 ) }-${ pad( date.getDate() ) }`
}

export const daysBefore = ( date: Date, days: number ): string => {
  const earlier = new Date( date )

  earlier.setDate( earlier.getDate() - days )

  return localDate( earlier )
}
