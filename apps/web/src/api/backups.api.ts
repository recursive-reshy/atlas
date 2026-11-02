// Shared
import { BackupResult } from '@atlas/shared'
// App
import { request } from './request'

export const runBackup = async (): Promise< BackupResult > => {
  return request( '/api/backups', BackupResult, { method: 'POST' } )
}
