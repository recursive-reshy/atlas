// Packages
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type {
  GetSettingsResponse,
  Settings,
  UpdateSettingsBody,
} from '@atlas/shared'
// App
import { getSettings, updateSettings } from '../api/settings.api'
import { meleteKeys, settingsKeys } from '#src/lib/queryKeys'

export interface SettingsState {
  settings: Settings | null
  lockedInstructions: GetSettingsResponse[ 'locked_instructions' ] | null
  linkerLockedInstructions: string | null
  syllabusLockedInstructions: string | null
  agentStatus: GetSettingsResponse[ 'agent_status' ] | null
  isLoading: boolean
  error: string | null
  updateSettings: UseMutationResult< GetSettingsResponse, Error, UpdateSettingsBody >
}

export function useSettings(): SettingsState {
  const queryClient = useQueryClient()
  const { data, error, isPending } = useQuery( {
    queryKey: settingsKeys.all,
    queryFn: getSettings,
  } )
  const update = useMutation( {
    mutationFn: ( body: UpdateSettingsBody ) => updateSettings( body ),
    onSuccess: async ( response ) => {
      queryClient.setQueryData( settingsKeys.all, response )
      // The learning root is a setting, and Melete's pages depend on it.
      await queryClient.invalidateQueries( { queryKey: meleteKeys.all } )
    },
  } )

  return {
    settings: data?.settings ?? null,
    lockedInstructions: data?.locked_instructions ?? null,
    linkerLockedInstructions: data?.linker_locked_instructions ?? null,
    syllabusLockedInstructions: data?.syllabus_locked_instructions ?? null,
    agentStatus: data?.agent_status ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
    updateSettings: update,
  }
}
