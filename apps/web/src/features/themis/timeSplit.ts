// App
import { formatStudyTime } from '#src/lib/formatStudyTime'

interface TimeSplit {
  measured: number
  logged: number
  calendar: number
}

// The text beside a time bar, so the three shades are never colour alone. Calendar is left out
// when there is none, as most users have no calendar connected.
export const timeSplitCaption = ( { measured, logged, calendar }: TimeSplit ): string => {
  const parts = [
    `${ formatStudyTime( measured ) } measured`,
    `${ formatStudyTime( logged ) } logged`,
    ...( calendar > 0 ? [ `${ formatStudyTime( calendar ) } calendar` ] : [] ),
  ]

  return parts.join( ' · ' )
}
