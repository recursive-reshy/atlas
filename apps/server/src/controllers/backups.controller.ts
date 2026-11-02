// Express
import { Request, Response } from 'express'
// Shared
import type { BackupResult } from '@atlas/shared'
// Services
import { runBackup } from '../services/backup.service.js'

export const createBackup = async (
  _req: Request,
  res: Response< BackupResult >,
): Promise< void > => {
  res.status( 201 ).json( await runBackup() )
}
