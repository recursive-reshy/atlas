// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  ListTimeEntriesQuery,
  ListTimeEntriesResponse,
  LogTimeBody,
  TimeEntryResponse,
  UpdateTimeEntryBody,
} from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  changeTimeEntry,
  listEntries,
  logTime,
  removeTimeEntry,
} from '../services/time.service.js'

const Id = z.uuid()

export const postTimeEntry = ( req: Request, res: Response< TimeEntryResponse > ): void => {
  const { id, modules } = currentUser( req )

  res.status( 201 ).json( { entry: logTime( id, modules, LogTimeBody.parse( req.body ) ) } )
}

export const patchTimeEntry = ( req: Request, res: Response< TimeEntryResponse > ): void => {
  const entry = changeTimeEntry(
    currentUser( req ).id,
    Id.parse( req.params.id ),
    UpdateTimeEntryBody.parse( req.body ),
  )

  res.status( 200 ).json( { entry } )
}

export const deleteTimeEntry = ( req: Request, res: Response ): void => {
  removeTimeEntry( currentUser( req ).id, Id.parse( req.params.id ) )
  res.status( 204 ).end()
}

export const getTimeEntries = (
  req: Request,
  res: Response< ListTimeEntriesResponse >,
): void => {
  const { from, to } = ListTimeEntriesQuery.parse( req.query )

  res.status( 200 ).json( { entries: listEntries( currentUser( req ).id, from, to ) } )
}
