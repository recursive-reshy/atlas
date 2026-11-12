// Icons
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutlineOutlined'
// Shared
import type { HealthKind, HealthState } from '@atlas/shared'

export const KIND_LABELS = {
  feed: 'Feed',
  gmail_source: 'Gmail source',
  gmail_connection: 'Gmail',
  calendar_connection: 'Calendar',
  vault_sync: 'Vault sync',
  agent: 'Service',
  transcription: 'Service',
  replication: 'Service',
} as const satisfies Record< HealthKind, string >

export const STATE_LABELS = {
  ok: 'OK',
  failing: 'Failing',
  off: 'Off',
} as const satisfies Record< HealthState, string >

export const STATE_ICONS = {
  ok: CheckCircleIcon,
  failing: ErrorIcon,
  off: RemoveCircleOutlineIcon,
} as const satisfies Record< HealthState, typeof CheckCircleIcon >

export const STATE_COLORS = {
  ok: 'success.main',
  failing: 'error.main',
  off: 'text.secondary',
} as const satisfies Record< HealthState, string >
