// Node
import { realpathSync, statSync } from 'node:fs'
import {
  access,
  constants,
  mkdir,
  readdir,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises'
import {
  dirname,
  join,
  resolve,
  sep,
} from 'node:path'
// Shared
import { FolderNode, noteBasename, parseFolderPath } from '@atlas/shared'
// Errors
import { ValidationError } from '../errors.js'

const MAX_ATTEMPTS = 1000

export const isInside = ( root: string, candidate: string ): boolean => {
  return candidate === root || candidate.startsWith( `${ root }${ sep }` )
}

const realpathOfNearestAncestor = async ( path: string ): Promise< string > => {
  try {
    return await realpath( path )
  } catch( error ) {
    const isMissing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    const parent = dirname( path )

    if( !isMissing || parent === path ) {
      throw error
    }

    return realpathOfNearestAncestor( parent )
  }
}

export const resolveFolder = async (
  vaultPath: string,
  relativeFolder: string,
): Promise< string > => {
  let segments: string[]

  try {
    segments = parseFolderPath( relativeFolder )
  } catch( error ) {
    throw new ValidationError( error instanceof Error ? error.message : 'Invalid folder' )
  }

  const root = await realpath( vaultPath )
  const target = resolve( root, ...segments )
  const outside = new ValidationError( `Folder "${ relativeFolder }" is outside the vault` )

  try {
    if( !isInside( root, await realpathOfNearestAncestor( target ) ) ) {
      throw outside
    }

    await mkdir( target, { recursive: true } )
  } catch( error ) {
    const code = ( error as NodeJS.ErrnoException ).code

    if( code === 'EEXIST' || code === 'ENOTDIR' ) {
      throw new ValidationError( `A file is in the way of folder "${ relativeFolder }"` )
    }

    throw error
  }

  const created = await realpath( target )

  if( !isInside( root, created ) ) {
    throw outside
  }

  return created
}

// Unlike resolveFolder this never creates anything, so Melete can check the vault read-only
export const resolveExistingFolder = async (
  vaultPath: string,
  relativeFolder: string,
): Promise< string > => {
  let segments: string[]

  try {
    segments = parseFolderPath( relativeFolder )
  } catch( error ) {
    throw new ValidationError( error instanceof Error ? error.message : 'Invalid folder' )
  }

  const root = await realpath( vaultPath )
  let target: string

  try {
    target = await realpath( resolve( root, ...segments ) )
  } catch( error ) {
    const isMissing = error instanceof Error && 'code' in error
      && ( error.code === 'ENOENT' || error.code === 'ENOTDIR' )

    if( isMissing ) {
      throw new ValidationError( 'Folder doesn\'t exist in the vault' )
    }

    throw error
  }

  if( !isInside( root, target ) ) {
    throw new ValidationError( `Folder "${ relativeFolder }" is outside the vault` )
  }

  if( !( await stat( target ) ).isDirectory() ) {
    throw new ValidationError( 'Folder doesn\'t exist in the vault' )
  }

  return target
}

// Synchronous so job reads can use it; like resolveExistingFolder it creates nothing
export const existingFolderSync = ( vaultPath: string, relativeFolder: string ): boolean => {
  try {
    const root = realpathSync( vaultPath )
    const target = realpathSync( resolve( root, ...parseFolderPath( relativeFolder ) ) )

    return isInside( root, target ) && statSync( target ).isDirectory()
  } catch{
    return false
  }
}

const SKIPPABLE_CODES = [ 'EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'ELOOP' ]

// No permission, gone or changed since it was listed, or a link loop; anything else is a real fault
export const isSkippable = ( error: unknown ): boolean => {
  return error instanceof Error && 'code' in error
    && typeof error.code === 'string' && SKIPPABLE_CODES.includes( error.code )
}

export const listFolderTree = async (
  vaultPath: string,
  relativeFolder = '',
  onSkip?: ( path: string, code: string ) => void,
): Promise< FolderNode[] > => {
  const list = async ( folder: string ): Promise< FolderNode[] > => {
    const entries = await readdir( join( vaultPath, folder ), { withFileTypes: true } )

    const folders = entries
      .filter( ( entry ) => entry.isDirectory() && !entry.name.startsWith( '.' ) )
      .sort( ( a, b ) => {
        return a.name.localeCompare( b.name, undefined, { sensitivity: 'base' } )
      } )

    return Promise.all( folders.map( async ( { name } ) => {
      const path = folder === '' ? name : `${ folder }/${ name }`

      try {
        return { name, path, children: await list( path ) }
      } catch( error ) {
        // The folder stays in the tree; only what is inside it is lost
        if( !isSkippable( error ) ) {
          throw error
        }

        onSkip?.( path, ( error as NodeJS.ErrnoException ).code ?? 'UNKNOWN' )

        return { name, path, children: [] }
      }
    } ) )
  }

  return list( relativeFolder )
}

export const writeNote = async (
  vaultPath: string,
  folder: string,
  title: string,
  content: string,
): Promise< string > => {
  const directory = await resolveFolder( vaultPath, folder )

  const basename = noteBasename( title )

  for( let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1 ) {
    const name = `${ attempt === 1 ? basename : `${ basename } (${ attempt })` }.md`

    try {
      await writeFile( join( directory, name ), content, { flag: 'wx' } )

      return folder === '' ? name : `${ folder }/${ name }`
    } catch( error ) {
      const isClash = error instanceof Error && 'code' in error && error.code === 'EEXIST'

      if( !isClash ) {
        throw error
      }
    }
  }

  throw new Error( `Could not find a free file name for "${ basename }" in the vault` )
}

export const assertVaultWritable = async ( vaultPath: string ): Promise< void > => {
  let isFolder: boolean

  try {
    isFolder = ( await stat( vaultPath ) ).isDirectory()
  } catch( error ) {
    throw new Error(
      `VAULTS_PATH ${ vaultPath } does not exist or cannot be read. `
      + 'Mount the folder that holds the vaults there (VAULTS_HOST_PATH in Docker).',
      { cause: error },
    )
  }

  if( !isFolder ) {
    throw new Error( `VAULTS_PATH ${ vaultPath } is not a folder` )
  }

  try {
    await access( vaultPath, constants.W_OK )
  } catch( error ) {
    throw new Error( `VAULTS_PATH ${ vaultPath } is not writable`, { cause: error } )
  }
}
