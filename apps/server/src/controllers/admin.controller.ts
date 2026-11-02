// Express
import type { Request, Response } from 'express'
// Shared
import { CreateUserBody, DeleteUserBody, UpdateUserBody } from '@atlas/shared'
import type { AdminUser, UsageResponse } from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  changeUser,
  createUser,
  deleteUserAccount,
  getUsage,
  listAdminUsers,
  resetVault,
} from '../services/admin.service.js'

export const getUsers = ( _req: Request, res: Response< AdminUser[] > ): void => {
  res.status( 200 ).json( listAdminUsers() )
}

export const addUser = ( { body }: Request, res: Response< AdminUser > ): void => {
  res.status( 201 ).json( createUser( CreateUserBody.parse( body ), new Date() ) )
}

export const patchUser = ( req: Request, res: Response< AdminUser > ): void => {
  res.status( 200 ).json(
    changeUser( currentUser( req ).id, String( req.params.id ), UpdateUserBody.parse( req.body ) ),
  )
}

export const resetUserVault = ( req: Request, res: Response< AdminUser > ): void => {
  res.status( 200 ).json( resetVault( currentUser( req ).id, String( req.params.id ) ) )
}

export const removeUser = ( req: Request, res: Response ): void => {
  deleteUserAccount(
    currentUser( req ).id,
    String( req.params.id ),
    DeleteUserBody.parse( req.body ).confirm,
  )

  res.status( 204 ).end()
}

export const getUsageReport = ( { query }: Request, res: Response< UsageResponse > ): void => {
  const month = typeof query.month === 'string' ? query.month : undefined

  res.status( 200 ).json( getUsage( month, new Date() ) )
}
