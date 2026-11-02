// Express
import type { Request, Response } from 'express'
// Shared
import { ClaimVaultBody, CreateVaultBody } from '@atlas/shared'
import type { Me, VaultChoice } from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import { getMe } from '../services/auth.service.js'
import {
  claimVault,
  createVault,
  listUnclaimedVaults,
} from '../services/vaultOnboarding.service.js'

export const readMe = ( req: Request, res: Response< Me > ): void => {
  res.status( 200 ).json( getMe( currentUser( req ).id ) )
}

export const readVaultChoices = async (
  req: Request,
  res: Response< VaultChoice >,
): Promise< void > => {
  res.status( 200 ).json( await listUnclaimedVaults( currentUser( req ).id ) )
}

export const chooseVault = async ( req: Request, res: Response< Me > ): Promise< void > => {
  const { id } = currentUser( req )

  await claimVault( id, ClaimVaultBody.parse( req.body ).vault_dir )

  res.status( 200 ).json( getMe( id ) )
}

export const makeVault = async ( req: Request, res: Response< Me > ): Promise< void > => {
  const { id } = currentUser( req )

  await createVault( id, CreateVaultBody.parse( req.body ).vault_dir )

  res.status( 201 ).json( getMe( id ) )
}
