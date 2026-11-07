// Express
import { Router } from 'express'
// Controllers
import {
  deleteTimeEntry,
  getTimeEntries,
  patchTimeEntry,
  postTimeEntry,
} from '../controllers/timeEntries.controller.js'

// Not gated by a module: a user's own time is theirs whatever they have switched on, and the
// module a target needs is checked per target
export const timeEntriesRoutes: Router = Router()

timeEntriesRoutes.get( '/time-entries', getTimeEntries )
timeEntriesRoutes.post( '/time-entries', postTimeEntry )
timeEntriesRoutes.patch( '/time-entries/:id', patchTimeEntry )
timeEntriesRoutes.delete( '/time-entries/:id', deleteTimeEntry )
