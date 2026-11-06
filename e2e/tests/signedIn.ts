import { test as base } from '@playwright/test'
import type { APIRequestContext, BrowserContext } from '@playwright/test'

export { expect } from '@playwright/test'

const ADMIN_EMAIL = 'admin@e2e.test'

type TestSignIn = {
  email: string
  modules?: string[]
  vault_dir?: string
}

// Signs the context in through the test-only route (TRD §11.4); its cookie lands in the context
export const signIn = async (
  context: BrowserContext | APIRequestContext,
  body: TestSignIn,
): Promise< void > => {
  const request = 'request' in context ? context.request : context
  const response = await request.post( '/api/test/session', { data: body } )

  if( response.status() !== 204 ) {
    throw new Error( `Test sign-in failed with ${ response.status() }: ${ await response.text() }` )
  }
}

// Every test starts signed in as the admin, with the vault run.sh made for them. Specs that act
// as someone else build their own context with `signIn`.
export const test = base.extend( {
  context: async ( { context }, use ) => {
    await signIn( context, { email: ADMIN_EMAIL, vault_dir: 'admin' } )
    await use( context )
  },
} )
