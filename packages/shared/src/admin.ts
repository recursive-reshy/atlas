// Packages
import { z } from 'zod'
// Auth
import {
  ModuleId,
  Role,
  UserStatus,
  VaultDir,
} from './auth.js'

export const AdminUser = z.object( {
  id: z.uuid(),
  email: z.email(),
  name: z.string().min( 1 ),
  role: Role,
  status: UserStatus,
  modules: z.array( ModuleId ),
  vault_dir: VaultDir.nullable(),
  last_signin_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
} )
export type AdminUser = z.infer< typeof AdminUser >

export const CreateUserBody = z.object( {
  email: z.email().toLowerCase(),
  name: z.string().min( 1 ).max( 80 ),
  modules: z.array( ModuleId ),
} )
export type CreateUserBody = z.infer< typeof CreateUserBody >

export const UpdateUserBody = z.object( {
  name: z.string().min( 1 ).max( 80 ).optional(),
  modules: z.array( ModuleId ).optional(),
  status: UserStatus.optional(),
} ).refine(
  ( body ) => Object.values( body ).some( ( value ) => value !== undefined ),
  { message: 'Provide name, modules or status' },
)
export type UpdateUserBody = z.infer< typeof UpdateUserBody >

// Must equal the user's email.
export const DeleteUserBody = z.object( {
  confirm: z.string(),
} )
export type DeleteUserBody = z.infer< typeof DeleteUserBody >

export const UsageCategory = z.enum( [
  'summary',
  'linking',
  'melete',
  'extraction',
  'transcription',
] )
export type UsageCategory = z.infer< typeof UsageCategory >

export const UsageTotals = z.object( {
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative().nullable(),
  runs: z.number().int().nonnegative(),
} )
export type UsageTotals = z.infer< typeof UsageTotals >

const CategoryTotals = z.object( {
  summary: UsageTotals,
  linking: UsageTotals,
  melete: UsageTotals,
  extraction: UsageTotals,
  transcription: UsageTotals,
} )

export const UserUsage = z.object( {
  user_id: z.uuid(),
  month: CategoryTotals,
  all_time: CategoryTotals,
  transcription: z.object( {
    month_seconds: z.number().nonnegative(),
    all_time_seconds: z.number().nonnegative(),
  } ),
} )
export type UserUsage = z.infer< typeof UserUsage >

export const UsageResponse = z.object( {
  month: z.string().regex( /^\d{4}-(0[1-9]|1[0-2])$/ ),
  time_zone: z.string().min( 1 ),
  users: z.array( UserUsage ),
} )
export type UsageResponse = z.infer< typeof UsageResponse >
