// Node
import { createHash } from 'node:crypto'
import { readdir, realpath, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
// Clients
import { isInside, isSkippable, resolveExistingFolder } from '../clients/vault.client.js'
// Errors
import { ValidationError } from '../errors.js'

const MAX_FILES_PER_SCAN = 5000

export type ScannedFile = { path: string, mtimeMs: number, size: number }

const FRONT_MATTER_FENCE = /^---[ \t]*$/

export const splitFrontMatter = (
  text: string,
): { frontMatter: string | null, body: string } => {
  const lines = text.split( /(?<=\n)/ )

  if( lines[ 0 ] === undefined || !FRONT_MATTER_FENCE.test( lines[ 0 ].replace( /\r?\n$/, '' ) ) ) {
    return { frontMatter: null, body: text }
  }

  const closing = lines.findIndex( ( line, index ) => {
    return index > 0 && FRONT_MATTER_FENCE.test( line.replace( /\r?\n$/, '' ) )
  } )

  if( closing === -1 ) {
    return { frontMatter: null, body: text }
  }

  return {
    frontMatter: lines.slice( 1, closing ).join( '' ).replace( /\r?\n$/, '' ),
    body: lines.slice( closing + 1 ).join( '' ),
  }
}

// Reads the one `title` key; anything that isn't a plain or quoted string is not a title
export const noteTitle = ( frontMatter: string | null, path: string ): string => {
  const stem = basename( path, '.md' )
  const value = frontMatter?.match( /^title:[ \t]*(.*?)[ \t]*\r?$/m )?.[ 1 ]

  if( value === undefined || value === '' || /^[[{|>&*!]/.test( value ) ) {
    return stem
  }

  const quoted = value.match( /^(["'])(.*)\1$/ )?.[ 2 ]
  const title = ( quoted ?? value ).trim()

  return title === '' ? stem : title
}

export const bodyHash = ( body: string ): string => {
  const normalised = body
    .replace( /\r\n/g, '\n' )
    .split( '\n' )
    .map( ( line ) => line.trimEnd() )
    .join( '\n' )
    .replace( /^\n+/, '' )
    .replace( /\n+$/, '' )

  return createHash( 'sha256' ).update( normalised ).digest( 'hex' )
}

export type SubjectWalk = { files: ScannedFile[], skipped: string[] }

// A folder or note that can't be read is reported in `skipped` and left alone; the subject's own
// folder is the root of the walk, so its errors still throw
export const walkSubject = async (
  vaultPath: string,
  folder: string,
  maxFiles = MAX_FILES_PER_SCAN,
): Promise< SubjectWalk > => {
  const start = await resolveExistingFolder( vaultPath, folder )
  const root = await realpath( vaultPath )
  const files: ScannedFile[] = []
  const skipped: string[] = []

  const walk = async ( directory: string, relative: string ): Promise< void > => {
    const entries = await readdir( directory, { withFileTypes: true } )

    for( const entry of entries ) {
      if( entry.name.startsWith( '.' ) ) {
        continue
      }

      const path = join( directory, entry.name )
      const relativePath = `${ relative }/${ entry.name }`

      if( entry.isDirectory() ) {
        try {
          await walk( path, relativePath )
        } catch( error ) {
          if( !isSkippable( error ) ) {
            throw error
          }

          skipped.push( relativePath )
        }
      } else if( entry.name.endsWith( '.md' ) && ( entry.isFile() || entry.isSymbolicLink() ) ) {
        // A link counts only when it ends at a file inside the vault
        const target = entry.isSymbolicLink() ? await realpath( path ).catch( () => null ) : path

        if( target === null || !isInside( root, target ) ) {
          continue
        }

        const info = await stat( target ).catch( ( error: unknown ) => {
          if( !isSkippable( error ) ) {
            throw error
          }

          skipped.push( relativePath )

          return null
        } )

        if( info === null || !info.isFile() ) {
          continue
        }

        if( files.length >= maxFiles ) {
          throw new ValidationError(
            `Too many notes in "${ folder }" (limit ${ maxFiles } files per scan)`,
          )
        }

        files.push( { path: relativePath, mtimeMs: info.mtimeMs, size: info.size } )
      }
    }
  }

  await walk( start, folder )

  return { files, skipped }
}

export const listSubjectFolders = async (
  vaultPath: string,
  learningRoot: string,
): Promise< string[] > => {
  const directory = await resolveExistingFolder( vaultPath, learningRoot )
  const entries = await readdir( directory, { withFileTypes: true } )

  return entries
    .filter( ( entry ) => entry.isDirectory() && !entry.name.startsWith( '.' ) )
    .map( ( { name } ) => name )
    .sort( ( a, b ) => a.localeCompare( b, undefined, { sensitivity: 'base' } ) )
    .map( ( name ) => ( learningRoot === '' ? name : `${ learningRoot }/${ name }` ) )
}
