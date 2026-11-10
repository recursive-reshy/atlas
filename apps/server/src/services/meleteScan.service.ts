// Node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
// Clients
import { isSkippable } from '../clients/vault.client.js'
// Errors
import { ConflictError } from '../errors.js'
// Logger
import { logger } from '../logger.js'
// Melete
import {
  ScannedFile,
  SubjectWalk,
  bodyHash,
  listSubjectFolders,
  noteTitle,
  splitFrontMatter,
  walkSubject,
} from '../melete/scan.js'
import { isScanFresh, markScanned, resetScanClock } from '../melete/scanClock.js'
import { rememberSkipped } from '../melete/scanOutcome.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import {
  NoteRecord,
  insertNote,
  listNotesUnder,
  updateNote,
} from '../repositories/meleteNotes.repository.js'
import { retireActiveForNote } from '../repositories/meleteQuestions.repository.js'
import { SubjectRecord, upsertSubject } from '../repositories/meleteSubjects.repository.js'
// Services
import { getLearningRoot } from './settings.service.js'
import { vaultRootFor } from './vault.service.js'
// Worker
import { wakeGenerator } from '../worker/wake.js'

type ScanOptions = { force?: boolean, now?: Date }

type ReadFile = ScannedFile & { subjectFolder: string, hash: string, title: string }

// One scan at a time for each user
const running = new Map< string, Promise< void > >()

export { resetScanClock }

const isGone = ( error: unknown ): boolean => {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

const readNote = async (
  vaultRoot: string,
  subjectFolder: string,
  file: ScannedFile,
): Promise< ReadFile | 'gone' | 'unreadable' > => {
  try {
    const text = await readFile( join( vaultRoot, file.path ), 'utf8' )
    const { frontMatter, body } = splitFrontMatter( text )

    return {
      ...file,
      subjectFolder,
      hash: bodyHash( body ),
      title: noteTitle( frontMatter, file.path ),
    }
  } catch( error ) {
    // Removed between the walk and the read; the next scan sorts it out
    if( isGone( error ) ) {
      return 'gone'
    }

    if( isSkippable( error ) ) {
      return 'unreadable'
    }

    throw error
  }
}

const applyScan = (
  userId: string,
  learningRoot: string,
  subjectFolders: string[],
  seen: Set< string >,
  changed: ReadFile[],
  skipped: string[],
  now: string,
): boolean => {
  // Whether any note was queued for generation, so the caller can wake the generator
  let queued = false
  const subjects = new Map< string, SubjectRecord >(
    subjectFolders.map( ( folder ) => [ folder, upsertSubject( userId, folder ) ] ),
  )
  const stored = listNotesUnder( userId, learningRoot )
  const live = new Map( stored.filter( ( note ) => note.missing_at === null )
    .map( ( note ) => [ note.path, note ] ) )
  const claimed = new Set< string >()

  // A note the scan could not reach says nothing about whether it is still there
  const underSkipped = ( path: string ): boolean => {
    return skipped.some( ( folder ) => path === folder || path.startsWith( `${ folder }/` ) )
  }

  const subjectOf = ( file: ReadFile ): SubjectRecord => {
    const subject = subjects.get( file.subjectFolder )

    if( subject === undefined ) {
      throw new Error( `Subject ${ file.subjectFolder } was not stored` )
    }

    return subject
  }

  // The questions stop being valid the moment the body changes
  const updateContent = ( note: NoteRecord, file: ReadFile ): void => {
    const edited = file.hash !== note.body_hash

    updateNote( userId, note.id, {
      path: file.path,
      subject_id: subjectOf( file ).id,
      title: file.title,
      body_hash: file.hash,
      mtime_ms: file.mtimeMs,
      size: file.size,
      missing_at: null,
      ...( edited && note.enrolled
        ? { generation: 'queued' as const, generation_error: null }
        : {} ),
    } )

    if( edited && note.enrolled ) {
      retireActiveForNote( userId, note.id )
      queued = true
    }
  }

  const arrivals: ReadFile[] = []

  for( const file of changed ) {
    const note = live.get( file.path )

    if( note === undefined ) {
      arrivals.push( file )
    } else {
      claimed.add( note.id )
      updateContent( note, file )
    }
  }

  const arrivalsPerHash = new Map< string, number >()

  for( const file of arrivals ) {
    arrivalsPerHash.set( file.hash, ( arrivalsPerHash.get( file.hash ) ?? 0 ) + 1 )
  }

  // A move needs one note that has gone and one file that has appeared with its body
  const movedFrom = ( file: ReadFile ): NoteRecord | undefined => {
    if( arrivalsPerHash.get( file.hash ) !== 1 ) {
      return undefined
    }

    const candidates = stored.filter( ( note ) => {
      return note.body_hash === file.hash
        && !claimed.has( note.id )
        && !underSkipped( note.path )
        && ( note.missing_at !== null || !seen.has( note.path ) )
    } )

    return candidates.length === 1 ? candidates[ 0 ] : undefined
  }

  for( const file of arrivals ) {
    const comeBack = stored.find( ( note ) => {
      return note.path === file.path && note.missing_at !== null && !claimed.has( note.id )
    } )
    const existing = comeBack ?? movedFrom( file )

    if( existing !== undefined ) {
      claimed.add( existing.id )
      updateContent( existing, file )
    } else {
      const subject = subjectOf( file )

      insertNote( userId, {
        subject_id: subject.id,
        path: file.path,
        title: file.title,
        body_hash: file.hash,
        mtime_ms: file.mtimeMs,
        size: file.size,
        enrolled: subject.auto_enroll,
        enrolled_at: subject.auto_enroll ? now : null,
        generation: subject.auto_enroll ? 'queued' : 'idle',
      } )

      queued ||= subject.auto_enroll
    }
  }

  for( const note of live.values() ) {
    if( !seen.has( note.path ) && !claimed.has( note.id ) && !underSkipped( note.path ) ) {
      updateNote( userId, note.id, { missing_at: now } )
    }
  }

  return queued
}

const runScan = async ( userId: string, learningRoot: string, now: Date ): Promise< void > => {
  const vaultRoot = vaultRootFor( userId )
  const subjectFolders = await listSubjectFolders( vaultRoot, learningRoot )
  const known = new Map( listNotesUnder( userId, learningRoot )
    .filter( ( note ) => note.missing_at === null )
    .map( ( note ) => [ note.path, note ] ) )
  const seen = new Set< string >()
  const changed: ReadFile[] = []
  const skipped = new Set< string >()

  for( const subjectFolder of subjectFolders ) {
    let walk: SubjectWalk

    try {
      walk = await walkSubject( vaultRoot, subjectFolder )
    } catch( error ) {
      // The subject's own folder can't be entered: all of it is one skipped path
      if( !isSkippable( error ) ) {
        throw error
      }

      skipped.add( subjectFolder )

      continue
    }

    walk.skipped.forEach( ( path ) => skipped.add( path ) )

    for( const file of walk.files ) {
      const note = known.get( file.path )

      if( note?.mtime_ms === file.mtimeMs && note.size === file.size ) {
        seen.add( file.path )
        continue
      }

      const read = await readNote( vaultRoot, subjectFolder, file )

      if( read === 'unreadable' ) {
        skipped.add( file.path )
      } else if( read !== 'gone' ) {
        seen.add( file.path )
        changed.push( read )
      }
    }
  }

  const skippedPaths = [ ...skipped ].sort()

  const queued = getDatabase().transaction( () => {
    return applyScan(
      userId,
      learningRoot,
      subjectFolders,
      seen,
      changed,
      skippedPaths,
      now.toISOString(),
    )
  } )()

  if( queued ) {
    wakeGenerator()
  }

  rememberSkipped( userId, skippedPaths )

  if( skippedPaths.length > 0 ) {
    logger.warn(
      {
        user_id: userId,
        learning_root: learningRoot,
        skipped_count: skippedPaths.length,
        skipped: skippedPaths,
      },
      'Scan skipped paths it could not read',
    )
  }

  markScanned( userId, now )
}

// Scans at most every 30 seconds unless forced, and one at a time (ADR 0057)
export const scanLearningRoot = async (
  userId: string,
  { force = false, now = new Date() }: ScanOptions = {},
): Promise< void > => {
  const learningRoot = getLearningRoot( userId )

  if( learningRoot === null ) {
    throw new ConflictError( 'Choose a learning root first' )
  }

  const inFlight = running.get( userId )

  if( inFlight !== undefined ) {
    return inFlight
  }

  if( !force && isScanFresh( userId, now ) ) {
    return undefined
  }

  const scan = runScan( userId, learningRoot, now ).finally( () => {
    running.delete( userId )
  } )

  running.set( userId, scan )

  return scan
}
