// Shared
import type { Me } from '@atlas/shared'

export type SettingsTab = {
  value: 'prompts' | 'models' | 'sources' | 'admin'
  label: string
}

// Prompts and Models serve every module; Sources is Transcriber's; Admin is the admin's.
export const settingsTabs = ( me: Me | null ): SettingsTab[] => {
  if( me === null ) {
    return []
  }

  const sources: SettingsTab[] = me.modules.includes( 'transcriber' )
    ? [ { value: 'sources', label: 'Sources' } ]
    : []
  const admin: SettingsTab[] = me.role === 'admin' ? [ { value: 'admin', label: 'Admin' } ] : []

  return [
    { value: 'prompts', label: 'Prompts' },
    { value: 'models', label: 'Models' },
    ...sources,
    ...admin,
  ]
}
