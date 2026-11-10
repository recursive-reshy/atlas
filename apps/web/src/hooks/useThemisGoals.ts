// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { GetThemisGoalResponse, ThemisGoalListItem } from '@atlas/shared'
// App
import { getThemisGoal, getThemisGoals } from '../api/themis.api'
import { themisKeys } from '../lib/queryKeys'

export interface ThemisGoalState {
  detail: GetThemisGoalResponse | null
  isLoading: boolean
  error: string | null
}

export interface ThemisGoalsState {
  goals: ThemisGoalListItem[] | null
  isLoading: boolean
  error: string | null
}

export function useThemisGoal( id: string ): ThemisGoalState {
  const { data, error, isPending } = useQuery( {
    queryKey: themisKeys.goal( id ),
    queryFn: () => getThemisGoal( id ),
  } )

  return {
    detail: data ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}

// Every goal whatever its status (ADR 0095)
export function useThemisGoals(): ThemisGoalsState {
  const { data, error, isPending } = useQuery( {
    queryKey: themisKeys.goals,
    queryFn: getThemisGoals,
  } )

  return {
    goals: data?.goals ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
