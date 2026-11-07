// Packages
import { z } from 'zod'

export const ModuleId = z.enum( [ 'transcriber', 'melete', 'themis' ] )
export type ModuleId = z.infer< typeof ModuleId >

export const Role = z.enum( [ 'admin', 'member' ] )
export type Role = z.infer< typeof Role >

export const UserStatus = z.enum( [ 'active', 'removed' ] )
export type UserStatus = z.infer< typeof UserStatus >

// 1–40 characters, lower-case letters, digits and hyphens, no leading or trailing hyphen.
export const VaultDir = z.string().regex( /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/ )
export type VaultDir = z.infer< typeof VaultDir >

// What the server answers (409) when a user's vault folder is gone, and what the web app matches
// to send them back to the vault page (ADR 0070).
export const VAULT_MISSING_MESSAGE = 'Your vault folder is missing'

// For the admin, `modules` is always every ModuleId. `vault_missing` is true when `vault_dir` is
// set but its folder no longer exists; `vault_dir` then keeps the old name (ADR 0070).
export const Me = z.object( {
  id: z.uuid(),
  email: z.email(),
  name: z.string().min( 1 ),
  role: Role,
  modules: z.array( ModuleId ),
  vault_dir: VaultDir.nullable(),
  vault_missing: z.boolean(),
} )
export type Me = z.infer< typeof Me >

// can_create is false where the admin sets vaults up (VAULT_CREATE_ENABLED, ADR 0075)
export const VaultChoice = z.object( {
  folders: z.array( VaultDir ),
  can_create: z.boolean(),
} )
export type VaultChoice = z.infer< typeof VaultChoice >

export const ClaimVaultBody = z.object( {
  vault_dir: VaultDir,
} )
export type ClaimVaultBody = z.infer< typeof ClaimVaultBody >

export const CreateVaultBody = z.object( {
  vault_dir: VaultDir,
} )
export type CreateVaultBody = z.infer< typeof CreateVaultBody >
