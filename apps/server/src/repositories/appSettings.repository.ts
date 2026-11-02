// Shared
import { AppSettingKey } from '@atlas/shared'
// Repositories
import { getDatabase } from './database.js'

export const getAppSetting = ( key: AppSettingKey ): unknown => {
  const row = getDatabase()
    .prepare( 'SELECT value FROM app_settings WHERE key = ?' )
    .get( key ) as { value: string } | undefined

  return row === undefined ? undefined : JSON.parse( row.value ) as unknown
}

export const setAppSetting = ( key: AppSettingKey, value: unknown ): void => {
  getDatabase()
    .prepare( `INSERT INTO app_settings ( key, value ) VALUES ( ?, ? )
      ON CONFLICT ( key ) DO UPDATE SET value = excluded.value` )
    .run( key, JSON.stringify( value ) )
}
