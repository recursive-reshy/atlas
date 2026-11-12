// App
import { useMe } from '#src/app/useMe'
import { useMeleteToday } from '#src/features/melete/hooks/useMeleteToday'
import { useThemisOverview } from './useThemisOverview'

export interface TimeTarget {
  id: string
  name: string
}

export interface TimeTargets {
  subjects: TimeTarget[]
  goals: TimeTarget[]
}

// What time can be counted against: the user's subjects (with Melete) and goals (with Themis)
export function useTimeTargets(): TimeTargets {
  const modules = useMe().me?.modules ?? []
  const hasMelete = modules.includes( 'melete' )
  const hasThemis = modules.includes( 'themis' )
  const { today } = useMeleteToday( hasMelete )
  const { overview } = useThemisOverview( 'week', hasThemis )

  return {
    subjects: hasMelete ? today?.subjects ?? [] : [],
    goals: hasThemis
      ? overview?.areas.flatMap( ( { goals } ) => goals ).map( ( { goal } ) => goal ) ?? []
      : [],
  }
}
