// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  CalendarRuleResponse,
  CreateCalendarRuleBody,
  ListCalendarRulesResponse,
  UpdateCalendarRuleBody,
} from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  changeCalendarRule,
  createCalendarRule,
  listCalendarRules,
  removeCalendarRule,
} from '../services/calendarRules.service.js'

const Id = z.uuid()

export const getRules = ( req: Request, res: Response< ListCalendarRulesResponse > ): void => {
  res.status( 200 ).json( { rules: listCalendarRules( currentUser( req ).id ) } )
}

export const postRule = ( req: Request, res: Response< CalendarRuleResponse > ): void => {
  const { id, modules } = currentUser( req )

  res.status( 201 ).json( {
    rule: createCalendarRule( id, modules, CreateCalendarRuleBody.parse( req.body ) ),
  } )
}

export const patchRule = ( req: Request, res: Response< CalendarRuleResponse > ): void => {
  const { id, modules } = currentUser( req )

  res.status( 200 ).json( {
    rule: changeCalendarRule(
      id,
      modules,
      Id.parse( req.params.id ),
      UpdateCalendarRuleBody.parse( req.body ),
    ),
  } )
}

export const deleteRuleById = ( req: Request, res: Response ): void => {
  removeCalendarRule( currentUser( req ).id, Id.parse( req.params.id ) )
  res.status( 204 ).end()
}
