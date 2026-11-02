// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  CreateGmailSourceBody,
  GmailSourceResponse,
  ListGmailSourcesResponse,
  PreviewGmailSourceBody,
  PreviewGmailSourceResponse,
  UpdateGmailSourceBody,
} from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  checkAllSources,
  checkSource,
  createSource,
  deleteSource,
  listGmailSources,
  previewSource,
  updateSource,
} from '../services/gmailSources.service.js'

const SourceId = z.uuid()

const DeleteQuery = z.object( {
  remove_inbox_items: z.enum( [ 'true', 'false' ] ).default( 'false' ),
} )

export const getGmailSources = async (
  req: Request,
  res: Response< ListGmailSourcesResponse >,
): Promise< void > => {
  res.status( 200 ).json( { sources: await listGmailSources( currentUser( req ).id ) } )
}

export const previewGmailSource = async (
  req: Request,
  res: Response< PreviewGmailSourceResponse >,
): Promise< void > => {
  const { match } = PreviewGmailSourceBody.parse( req.body )

  res.status( 200 ).json( await previewSource( currentUser( req ).id, match ) )
}

export const addGmailSource = async (
  req: Request,
  res: Response< GmailSourceResponse >,
): Promise< void > => {
  const source = await createSource(
    currentUser( req ).id,
    CreateGmailSourceBody.parse( req.body ),
  )

  res.status( 201 ).json( { source } )
}

export const patchGmailSource = async (
  req: Request,
  res: Response< GmailSourceResponse >,
): Promise< void > => {
  const source = await updateSource(
    currentUser( req ).id,
    SourceId.parse( req.params.id ),
    UpdateGmailSourceBody.parse( req.body ),
  )

  res.status( 200 ).json( { source } )
}

export const removeGmailSource = ( req: Request, res: Response ): void => {
  const { remove_inbox_items } = DeleteQuery.parse( req.query )

  deleteSource(
    currentUser( req ).id,
    SourceId.parse( req.params.id ),
    { removeInboxItems: remove_inbox_items === 'true' },
  )

  res.status( 204 ).end()
}

export const checkOneGmailSource = async (
  req: Request,
  res: Response< GmailSourceResponse >,
): Promise< void > => {
  const source = await checkSource( currentUser( req ).id, SourceId.parse( req.params.id ) )

  res.status( 200 ).json( { source } )
}

export const checkEveryGmailSource = async (
  req: Request,
  res: Response< ListGmailSourcesResponse >,
): Promise< void > => {
  res.status( 200 ).json( { sources: await checkAllSources( currentUser( req ).id ) } )
}
