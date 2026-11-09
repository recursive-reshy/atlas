// Packages
import { describe, it, expect } from 'vitest'
// Auth
import {
  ClaimVaultBody,
  CreateVaultBody,
  Me,
  ModuleId,
  Role,
  UserStatus,
  VaultChoice,
  VAULT_MISSING_MESSAGE,
  VaultDir,
} from './auth.js'

const me = {
  id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
  email: 'naresh@example.com',
  name: 'Naresh',
  role: 'admin',
  modules: [ 'transcriber', 'melete' ],
  vault_dir: 'naresh',
  vault_missing: false,
}

describe( 'ModuleId, Role and UserStatus', () => {
  it( 'accept their values only', () => {
    expect( ModuleId.options ).toEqual( [ 'transcriber', 'melete', 'themis' ] )
    expect( Role.options ).toEqual( [ 'admin', 'member' ] )
    expect( UserStatus.options ).toEqual( [ 'active', 'removed' ] )
    expect( ModuleId.safeParse( 'wealth' ).success ).toBe( false )
    expect( Role.safeParse( 'owner' ).success ).toBe( false )
    expect( UserStatus.safeParse( 'banned' ).success ).toBe( false )
  } )
} )

describe( 'VaultDir', () => {
  it.each( [ 'a', 'naresh', 'my-vault-2', '9', 'a'.repeat( 40 ) ] )( 'accepts %s', ( value ) => {
    expect( VaultDir.parse( value ) ).toBe( value )
  } )

  it.each( [
    '',
    'a'.repeat( 41 ),
    '-a',
    'a-',
    '-',
    'Naresh',
    'my.vault',
    'my_vault',
    'a/b',
    '..',
    '../x',
    'my vault',
  ] )( 'rejects %j', ( value ) => {
    expect( VaultDir.safeParse( value ).success ).toBe( false )
  } )
} )

describe( 'Me', () => {
  it( 'parses a user with a vault', () => {
    expect( Me.parse( me ) ).toEqual( me )
  } )

  it( 'allows a null vault_dir and no modules', () => {
    const member = { ...me, role: 'member', modules: [], vault_dir: null, vault_missing: false }

    expect( Me.parse( member ) ).toEqual( member )
  } )

  it( 'carries a vault that is missing, with the old folder name', () => {
    const missing = { ...me, vault_missing: true }

    expect( Me.parse( missing ) ).toEqual( missing )
  } )

  it( 'requires vault_missing to be a boolean', () => {
    expect( Me.safeParse( { ...me, vault_missing: 'yes' } ).success ).toBe( false )
  } )

  it( 'rejects a bad id, email, role, module or vault_dir', () => {
    expect( Me.safeParse( { ...me, id: 'x' } ).success ).toBe( false )
    expect( Me.safeParse( { ...me, email: 'nope' } ).success ).toBe( false )
    expect( Me.safeParse( { ...me, role: 'owner' } ).success ).toBe( false )
    expect( Me.safeParse( { ...me, modules: [ 'wealth' ] } ).success ).toBe( false )
    expect( Me.safeParse( { ...me, vault_dir: '../x' } ).success ).toBe( false )
  } )

  it( 'requires every field', () => {
    const rest: Record< string, unknown > = { ...me }

    delete rest.vault_dir

    expect( Me.safeParse( rest ).success ).toBe( false )

    const noFlag: Record< string, unknown > = { ...me }

    delete noFlag.vault_missing

    expect( Me.safeParse( noFlag ).success ).toBe( false )
  } )
} )

describe( 'VaultChoice', () => {
  it( 'lists valid folder names', () => {
    const choice = { folders: [ 'brother', 'shared-notes' ], can_create: true }

    expect( VaultChoice.parse( choice ) ).toEqual( choice )
    expect( VaultChoice.parse( { folders: [], can_create: false } ) )
      .toEqual( { folders: [], can_create: false } )
  } )

  it( 'rejects an invalid folder name', () => {
    expect( VaultChoice.safeParse( { folders: [ 'Bad Name' ], can_create: true } ).success )
      .toBe( false )
  } )

  it( 'needs can_create to be a boolean', () => {
    expect( VaultChoice.safeParse( { folders: [] } ).success ).toBe( false )
    expect( VaultChoice.safeParse( { folders: [], can_create: 'yes' } ).success ).toBe( false )
  } )
} )

describe( 'ClaimVaultBody and CreateVaultBody', () => {
  it.each( [ ClaimVaultBody, CreateVaultBody ] )( 'take one valid vault_dir', ( schema ) => {
    expect( schema.parse( { vault_dir: 'brother' } ) ).toEqual( { vault_dir: 'brother' } )
    expect( schema.safeParse( {} ).success ).toBe( false )
    expect( schema.safeParse( { vault_dir: 'a/b' } ).success ).toBe( false )
  } )
} )

describe( 'VAULT_MISSING_MESSAGE', () => {
  it( 'is the text the server sends and the web app matches', () => {
    expect( VAULT_MISSING_MESSAGE ).toBe( 'Your vault folder is missing' )
  } )
} )
