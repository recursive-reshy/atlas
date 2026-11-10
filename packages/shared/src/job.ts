// Packages
import { z } from 'zod'
// Source
import { SourceType } from './source.js'
// Summarizer
import { SummaryUsage } from './summarizer.js'

export const JobStatus = z.enum( [
  'queued',
  'fetching',
  'transcribing',
  'summarizing',
  'linking',
  'ready_for_review',
  'summary_failed',
  'saved',
  'failed',
] )
export type JobStatus = z.infer< typeof JobStatus >

export const LinkState = z.enum( [ 'off', 'pending', 'linked', 'failed' ] )
export type LinkState = z.infer< typeof LinkState >

export const LinkRun = z.object( {
  model: z.string(),
  prompt_version: z.int().min( 1 ),
  input_tokens: z.int().min( 0 ).nullable(),
  output_tokens: z.int().min( 0 ).nullable(),
  cache_read_input_tokens: z.int().min( 0 ).nullable(),
  cache_creation_input_tokens: z.int().min( 0 ).nullable(),
  tool_calls: z.int().min( 0 ).nullable(),
  cost_usd: z.number().nullable(),
  outcome: z.enum( [ 'succeeded', 'failed' ] ),
  created_at: z.iso.datetime(),
} )
export type LinkRun = z.infer< typeof LinkRun >

export const LinkUsageSummary = z.object( {
  last_run: LinkRun,
  run_count: z.int().min( 1 ),
  total_input_tokens: z.int(),
  total_output_tokens: z.int(),
  total_cost_usd: z.number().nullable(),
} )
export type LinkUsageSummary = z.infer< typeof LinkUsageSummary >

export const Job = z.object( {
  id: z.uuid(),
  url: z.url(),
  status: JobStatus,
  error: z.string().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  title: z.string().nullable(),
  note_markdown: z.string().nullable(),
  target_folder: z.string().nullable(),
  default_folder: z.string(),
  expires_at: z.iso.datetime().nullable(),
  saved_path: z.string().nullable(),
  summary_model: z.string().nullable(),
  prompt_profile_id: z.uuid().nullable(),
  summary_usage: SummaryUsage.nullable(),
  link_state: LinkState.nullable(),
  link_error: z.string().nullable(),
  link_usage: LinkUsageSummary.nullable(),
  source_type: SourceType,
  feed_id: z.uuid().nullable(),
  feed_name: z.string().nullable(),
  gmail_source_id: z.uuid().nullable(),
  gmail_source_name: z.string().nullable(),
} )
export type Job = z.infer< typeof Job >

// The list leaves the draft out (ADR 0102): the detail read carries it
export const JobListItem = Job.omit( { note_markdown: true } )
export type JobListItem = z.infer< typeof JobListItem >
