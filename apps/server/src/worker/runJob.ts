// Packages
import path from 'node:path'
// Errors
import { ConflictError } from '../errors.js'
// Services
import {
  completeAcquisition,
  failJob,
  findJob,
  markStatus,
  recordTranscriptionRun,
} from '../services/jobs.service.js'
// Sources
import { adapterFor } from '../sources/index.js'
// Config
import { config } from '../config.js'
// Worker
import { linkJob } from './linkJob.js'
import { summarizeJob } from './summarizeJob.js'

const summarizeThenLink = async ( userId: string, jobId: string ): Promise< void > => {
  await summarizeJob( userId, jobId )

  if( findJob( userId, jobId ).status === 'linking' ) {
    await linkJob( userId, jobId )
  }
}

export const runJob = async ( userId: string, jobId: string ): Promise< void > => {
  const job = findJob( userId, jobId )

  if( job.status === 'linking' ) {
    await linkJob( userId, jobId )

    return
  }

  if( job.status === 'summarizing' ) {
    await summarizeThenLink( userId, jobId )

    return
  }

  try {
    const document = await adapterFor( job.source_type ).acquire( {
      job,
      workDir: path.join( config.workDir, jobId ),
      markStatus: ( status ) => {
        markStatus( userId, jobId, status )
      },
      recordTranscription: ( attempt ) => {
        recordTranscriptionRun( userId, jobId, attempt )
      },
    } )

    completeAcquisition( userId, jobId, document )
  } catch( error ) {
    // A refused status change means the job is not ours to run, not that acquiring failed
    if( error instanceof ConflictError ) {
      throw error
    }

    failJob( userId, jobId, error instanceof Error ? error.message : 'Unknown error' )
  }

  if( findJob( userId, jobId ).status === 'summarizing' ) {
    await summarizeThenLink( userId, jobId )
  }
}
