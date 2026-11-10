// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  ApproveCalendarDraftResponse,
  ApproveMatchedResponse,
  CalendarDraftResponse,
  ListCalendarDraftsResponse,
  UpdateCalendarDraftBody,
} from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  approveCalendarDraft,
  approveMatchedDrafts,
  changeCalendarDraft,
  dismissCalendarDraft,
  listCalendarDrafts,
} from '../services/calendarDrafts.service.js'

const Id = z.uuid()

export const getDrafts = ( req: Request, res: Response< ListCalendarDraftsResponse > ): void => {
  res.status( 200 ).json( { drafts: listCalendarDrafts( currentUser( req ).id ) } )
}

export const patchDraft = ( req: Request, res: Response< CalendarDraftResponse > ): void => {
  const { id, modules } = currentUser( req )

  res.status( 200 ).json( { draft: changeCalendarDraft(
    id,
    modules,
    Id.parse( req.params.id ),
    UpdateCalendarDraftBody.parse( req.body ),
  ) } )
}

export const postApprove = (
  req: Request,
  res: Response< ApproveCalendarDraftResponse >,
): void => {
  res.status( 200 )
    .json( approveCalendarDraft( currentUser( req ).id, Id.parse( req.params.id ) ) )
}

export const postApproveMatched = (
  req: Request,
  res: Response< ApproveMatchedResponse >,
): void => {
  res.status( 200 ).json( { approved: approveMatchedDrafts( currentUser( req ).id ) } )
}

export const postDismiss = ( req: Request, res: Response ): void => {
  dismissCalendarDraft( currentUser( req ).id, Id.parse( req.params.id ) )
  res.status( 204 ).end()
}
