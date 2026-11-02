// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import { GetGmailAccountResponse, ListGmailLabelsResponse } from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
import { currentOrigin } from '../middleware/requestOrigin.js'
// Services
import {
  disconnectAccount,
  finishConnect,
  getAccount,
  listLabels,
  startConnect,
} from '../services/gmail.service.js'

const CallbackQuery = z.object( {
  code: z.string().min( 1 ).optional(),
  state: z.string().min( 1 ).optional(),
  error: z.string().min( 1 ).optional(),
} )

export const getGmailAccount = (
  req: Request,
  res: Response< GetGmailAccountResponse >,
): void => {
  res.status( 200 ).json( { account: getAccount( currentUser( req ).id ) } )
}

export const connectGmail = ( req: Request, res: Response ): void => {
  res.redirect( 302, startConnect( currentUser( req ).id, currentOrigin( req ) ) )
}

export const gmailCallback = async ( req: Request, res: Response ): Promise< void > => {
  const parsed = CallbackQuery.safeParse( req.query )
  const failure = parsed.success
    ? await finishConnect( currentUser( req ).id, parsed.data )
    : 'failed'

  res.redirect(
    302,
    failure === null ? '/settings?gmail=connected' : `/settings?gmail=error&reason=${ failure }`,
  )
}

export const disconnectGmail = async ( req: Request, res: Response ): Promise< void > => {
  await disconnectAccount( currentUser( req ).id )

  res.status( 204 ).end()
}

export const getGmailLabels = async (
  req: Request,
  res: Response< ListGmailLabelsResponse >,
): Promise< void > => {
  res.status( 200 ).json( { labels: await listLabels( currentUser( req ).id ) } )
}
