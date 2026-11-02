// Packages
import { describe, it, expect } from 'vitest'
// Admin
import {
  AdminUser,
  CreateUserBody,
  DeleteUserBody,
  UpdateUserBody,
  UsageCategory,
  UsageResponse,
  UsageTotals,
  UserUsage,
} from './admin.js'

const adminUser = {
  id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
  email: 'brother@example.com',
  name: 'Brother',
  role: 'member',
  status: 'active',
  modules: [ 'melete' ],
  vault_dir: null,
  last_signin_at: null,
  created_at: '2026-10-24T10:00:00.000Z',
}

const totals = { input_tokens: 10, output_tokens: 5, cost_usd: 0.01, runs: 1 }
const empty = { input_tokens: 0, output_tokens: 0, cost_usd: null, runs: 0 }
const categories = {
  summary: totals,
  linking: empty,
  melete: empty,
  extraction: empty,
  transcription: empty,
}

describe( 'AdminUser', () => {
  it( 'parses a member who has not signed in', () => {
    expect( AdminUser.parse( adminUser ) ).toEqual( adminUser )
  } )

  it( 'parses a user with a vault and a sign-in time', () => {
    const user = { ...adminUser, vault_dir: 'brother', last_signin_at: '2026-10-24T11:00:00.000Z' }

    expect( AdminUser.parse( user ) ).toEqual( user )
  } )

  it( 'rejects a bad status, vault_dir or date', () => {
    expect( AdminUser.safeParse( { ...adminUser, status: 'banned' } ).success ).toBe( false )
    expect( AdminUser.safeParse( { ...adminUser, vault_dir: 'A/B' } ).success ).toBe( false )
    expect( AdminUser.safeParse( { ...adminUser, created_at: 'yesterday' } ).success ).toBe( false )
  } )
} )

describe( 'CreateUserBody', () => {
  it( 'lower-cases the email', () => {
    expect( CreateUserBody.parse( { email: 'Brother@Example.COM', name: 'B', modules: [] } ).email )
      .toBe( 'brother@example.com' )
  } )

  it( 'rejects a bad email, an empty or long name and an unknown module', () => {
    const valid = { email: 'a@b.co', name: 'B', modules: [] }
    const parses = ( body: object ): boolean => CreateUserBody.safeParse( body ).success

    expect( parses( valid ) ).toBe( true )
    expect( parses( { ...valid, email: 'x' } ) ).toBe( false )
    expect( parses( { ...valid, name: '' } ) ).toBe( false )
    expect( parses( { ...valid, name: 'n'.repeat( 81 ) } ) ).toBe( false )
    expect( parses( { ...valid, name: 'n'.repeat( 80 ) } ) ).toBe( true )
    expect( parses( { ...valid, modules: [ 'x' ] } ) ).toBe( false )
  } )
} )

describe( 'UpdateUserBody', () => {
  it.each( [
    { name: 'New name' },
    { modules: [ 'transcriber' ] },
    { modules: [] },
    { status: 'removed' },
  ] )( 'accepts %j', ( body ) => {
    expect( UpdateUserBody.parse( body ) ).toEqual( body )
  } )

  it( 'rejects an empty body and bad values', () => {
    expect( UpdateUserBody.safeParse( {} ).success ).toBe( false )
    expect( UpdateUserBody.safeParse( { status: 'banned' } ).success ).toBe( false )
    expect( UpdateUserBody.safeParse( { name: '' } ).success ).toBe( false )
  } )
} )

describe( 'DeleteUserBody', () => {
  it( 'needs a confirm string', () => {
    expect( DeleteUserBody.parse( { confirm: 'a@b.co' } ) ).toEqual( { confirm: 'a@b.co' } )
    expect( DeleteUserBody.safeParse( {} ).success ).toBe( false )
  } )
} )

describe( 'UsageCategory', () => {
  it( 'lists the four categories', () => {
    expect( UsageCategory.options ).toEqual( [
      'summary',
      'linking',
      'melete',
      'extraction',
      'transcription',
    ] )
  } )
} )

describe( 'UsageTotals', () => {
  it( 'allows a null cost', () => {
    expect( UsageTotals.parse( empty ) ).toEqual( empty )
  } )

  it( 'rejects negative or fractional counts', () => {
    expect( UsageTotals.safeParse( { ...totals, runs: -1 } ).success ).toBe( false )
    expect( UsageTotals.safeParse( { ...totals, input_tokens: 1.5 } ).success ).toBe( false )
  } )
} )

describe( 'UserUsage and UsageResponse', () => {
  const usage = {
    user_id: adminUser.id,
    month: categories,
    all_time: categories,
    transcription: { month_seconds: 60, all_time_seconds: 600 },
  }

  it( 'parses a user with all four categories', () => {
    expect( UserUsage.parse( usage ) ).toEqual( usage )
  } )

  it( 'rejects a missing category', () => {
    const partial = { summary: totals, linking: empty, melete: empty }

    expect( UserUsage.safeParse( { ...usage, month: partial } ).success ).toBe( false )
  } )

  it( 'parses a response and checks the month format', () => {
    const response = { month: '2026-10', time_zone: 'Asia/Singapore', users: [ usage ] }

    expect( UsageResponse.parse( response ) ).toEqual( response )
    expect( UsageResponse.safeParse( { ...response, month: '2026-13' } ).success ).toBe( false )
    expect( UsageResponse.safeParse( { ...response, month: '2026-1' } ).success ).toBe( false )
  } )
} )
