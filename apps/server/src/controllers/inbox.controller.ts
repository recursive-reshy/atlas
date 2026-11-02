// Express
import { Request, Response } from 'express'
// Shared
import {
  DismissInboxBody,
  ListInboxResponse,
  SummarizeInboxBody,
  SummarizeInboxResponse,
} from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import { dismissItems, listInbox, summarizeItems } from '../services/inbox.service.js'

export const getInbox = ( req: Request, res: Response< ListInboxResponse > ): void => {
  res.status( 200 ).json( { items: listInbox( currentUser( req ).id ) } )
}

export const summarizeInbox = async (
  req: Request,
  res: Response< SummarizeInboxResponse >,
): Promise< void > => {
  const body = SummarizeInboxBody.parse( req.body )

  res.status( 200 ).json( await summarizeItems( currentUser( req ).id, body ) )
}

export const dismissInbox = ( req: Request, res: Response ): void => {
  dismissItems( currentUser( req ).id, DismissInboxBody.parse( req.body ).items )

  res.status( 204 ).end()
}
