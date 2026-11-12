// Packages
import { z } from 'zod'

// App services have one answer for everyone; a user's own sources belong to that user.
export const AppHealthKind = z.enum( [
  'agent',
  'transcription',
  'replication',
] )
export type AppHealthKind = z.infer< typeof AppHealthKind >

export const UserHealthKind = z.enum( [
  'feed',
  'gmail_source',
  'gmail_connection',
  'calendar_connection',
  'vault_sync',
] )
export type UserHealthKind = z.infer< typeof UserHealthKind >

export const HealthKind = z.enum( [
  ...UserHealthKind.options,
  ...AppHealthKind.options,
] )
export type HealthKind = z.infer< typeof HealthKind >

export const HealthState = z.enum( [ 'ok', 'failing', 'off' ] )
export type HealthState = z.infer< typeof HealthState >

// Singleton subjects (the app kinds) use the id "default"; a connection's is its user's ID.
export const StatusRow = z.object( {
  kind: HealthKind,
  id: z.string().min( 1 ),
  name: z.string().min( 1 ),
  state: HealthState,
  last_checked_at: z.iso.datetime().nullable(),
  last_success_at: z.iso.datetime().nullable(),
  last_error: z.string().nullable(),
  failing_since: z.iso.datetime().nullable(),
  detail: z.string().nullable(),
} )
export type StatusRow = z.infer< typeof StatusRow >

export const GetStatusResponse = z.object( {
  rows: z.array( StatusRow ),
  failing_count: z.number().int().nonnegative(),
} )
export type GetStatusResponse = z.infer< typeof GetStatusResponse >

export const HealthError = z.object( {
  at: z.iso.datetime(),
  message: z.string(),
} )
export type HealthError = z.infer< typeof HealthError >

export const GetHealthErrorsResponse = z.object( {
  errors: z.array( HealthError ),
} )
export type GetHealthErrorsResponse = z.infer< typeof GetHealthErrorsResponse >

// Written by the vault sync container (deploy/sync/sync.sh) as <vault_dir>.json; read only by
// the server (ADR 0075).
export const VaultSyncStatusFile = z.object( {
  state: z.enum( [ 'starting', 'running', 'failed' ] ),
  since: z.iso.datetime(),
  heartbeat_at: z.iso.datetime(),
  last_error: z.string().nullable(),
  cli_version: z.string(),
} )
export type VaultSyncStatusFile = z.infer< typeof VaultSyncStatusFile >
