// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  CreatePromptProfileBody,
  ListPromptProfilesResponse,
  ListPromptVersionsResponse,
  PromptProfileResponse,
  PromptPurpose,
  RenamePromptProfileBody,
  SavePromptVersionBody,
} from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  createProfile,
  deleteProfile,
  listProfiles,
  listVersions,
  renameProfile,
  resetProfile,
  restoreVersion,
  saveVersion,
} from '../services/prompts.service.js'

const VersionId = z.coerce.number().int().positive()
const ListPurpose = z.enum( [ ...PromptPurpose.options, 'all' ] ).default( 'summary' )

export const getProfiles = (
  req: Request,
  res: Response< ListPromptProfilesResponse >,
): void => {
  const purpose = ListPurpose.parse( req.query.purpose )

  res.status( 200 ).json( { profiles: listProfiles( currentUser( req ).id, purpose ) } )
}

export const postProfile = (
  req: Request,
  res: Response< PromptProfileResponse >,
): void => {
  const profile = createProfile( currentUser( req ).id, CreatePromptProfileBody.parse( req.body ) )

  res.status( 201 ).json( { profile } )
}

export const patchProfile = (
  req: Request,
  res: Response< PromptProfileResponse >,
): void => {
  const { name } = RenamePromptProfileBody.parse( req.body )

  res.status( 200 ).json( {
    profile: renameProfile( currentUser( req ).id, String( req.params.id ), name ),
  } )
}

export const removeProfile = ( req: Request, res: Response ): void => {
  deleteProfile( currentUser( req ).id, String( req.params.id ) )

  res.status( 204 ).end()
}

export const getVersions = (
  req: Request,
  res: Response< ListPromptVersionsResponse >,
): void => {
  res.status( 200 ).json( {
    versions: listVersions( currentUser( req ).id, String( req.params.id ) ),
  } )
}

export const postVersion = (
  req: Request,
  res: Response< PromptProfileResponse >,
): void => {
  const { guidance } = SavePromptVersionBody.parse( req.body )

  res.status( 200 ).json( {
    profile: saveVersion( currentUser( req ).id, String( req.params.id ), guidance ),
  } )
}

export const postRestore = (
  req: Request,
  res: Response< PromptProfileResponse >,
): void => {
  const versionId = VersionId.parse( req.params.versionId )

  res.status( 200 ).json( {
    profile: restoreVersion( currentUser( req ).id, String( req.params.id ), versionId ),
  } )
}

export const postReset = ( req: Request, res: Response< PromptProfileResponse > ): void => {
  res.status( 200 ).json( {
    profile: resetProfile( currentUser( req ).id, String( req.params.id ) ),
  } )
}
