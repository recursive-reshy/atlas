// App
import { send } from '../lib/request'

export const signOut = async (): Promise< void > => {
  await send( '/api/auth/signout', { method: 'POST' } )
}
