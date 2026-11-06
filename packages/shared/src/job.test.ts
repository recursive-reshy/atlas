// Packages
import { describe, it, expect } from 'vitest'
// Job
import {
  Job,
  JobStatus,
  LinkRun,
  LinkState,
  LinkUsageSummary,
} from './job.js'

const validJob = {
  id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
  url: 'https://www.youtube.com/watch?v=abc',
  status: 'queued',
  error: null,
  created_at: '2026-10-14T10:00:00.000Z',
  updated_at: '2026-10-14T10:00:00.000Z',
  title: null,
  note_markdown: null,
  target_folder: null,
  default_folder: 'Inbox',
  expires_at: null,
  saved_path: null,
  summary_model: null,
  prompt_profile_id: null,
  summary_usage: null,
  link_state: null,
  link_error: null,
  link_usage: null,
  source_type: 'video',
  feed_id: null,
  feed_name: null,
  gmail_source_id: null,
  gmail_source_name: null,
}

describe( 'JobStatus', () => {
  it.each( [
    'queued',
    'fetching',
    'transcribing',
    'summarizing',
    'linking',
    'ready_for_review',
    'summary_failed',
    'saved',
    'failed',
  ] )(
    'accepts %s',
    ( status ) => {
      expect( JobStatus.safeParse( status ).success ).toBe( true )
    },
  )

  it.each( [ 'downloading', 'converting' ] )( 'no longer accepts %s (ADR 0081)', ( status ) => {
    expect( JobStatus.safeParse( status ).success ).toBe( false )
  } )

  it( 'rejects an unknown status', () => {
    expect( JobStatus.safeParse( 'paused' ).success ).toBe( false )
  } )

  it( 'no longer accepts done', () => {
    expect( JobStatus.safeParse( 'done' ).success ).toBe( false )
  } )
} )

describe( 'Job', () => {
  it( 'accepts a valid job', () => {
    expect( Job.safeParse( validJob ).success ).toBe( true )
  } )

  it( 'accepts an error string', () => {
    expect( Job.safeParse( { ...validJob, status: 'failed', error: 'boom' } ).success ).toBe( true )
  } )

  it( 'rejects a non-UUID id', () => {
    expect( Job.safeParse( { ...validJob, id: 'job-1' } ).success ).toBe( false )
  } )

  it( 'rejects an unknown status', () => {
    expect( Job.safeParse( { ...validJob, status: 'paused' } ).success ).toBe( false )
  } )

  it( 'accepts an article job from a feed', () => {
    const fromFeed = {
      ...validJob,
      source_type: 'article',
      feed_id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5c',
      feed_name: 'A blog',
    }

    expect( Job.safeParse( fromFeed ).success ).toBe( true )
  } )

  it( 'accepts an article job from a Gmail source', () => {
    const fromGmail = {
      ...validJob,
      source_type: 'article',
      gmail_source_id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5d',
      gmail_source_name: 'Lenny',
    }

    expect( Job.safeParse( fromGmail ).success ).toBe( true )
  } )

  it.each( [
    'link_state',
    'link_error',
    'link_usage',
    'source_type',
    'feed_id',
    'feed_name',
    'gmail_source_id',
    'gmail_source_name',
  ] )( 'rejects a missing %s', ( field ) => {
    const without: Record< string, unknown > = { ...validJob }
    delete without[ field ]

    expect( Job.safeParse( without ).success ).toBe( false )
  } )

  it( 'rejects an unknown source_type and a feed_id that is not a uuid', () => {
    expect( Job.safeParse( { ...validJob, source_type: 'email' } ).success ).toBe( false )
    expect( Job.safeParse( { ...validJob, feed_id: 'x' } ).success ).toBe( false )
    expect( Job.safeParse( { ...validJob, gmail_source_id: 'x' } ).success ).toBe( false )
  } )

  it( 'rejects a non-URL url', () => {
    expect( Job.safeParse( { ...validJob, url: 'nope' } ).success ).toBe( false )
  } )

  it( 'rejects a non-ISO created_at', () => {
    expect( Job.safeParse( { ...validJob, created_at: 'yesterday' } ).success ).toBe( false )
  } )

  it( 'rejects a missing error field', () => {
    const withoutError: Partial< typeof validJob > = { ...validJob }
    delete withoutError.error

    expect( Job.safeParse( withoutError ).success ).toBe( false )
  } )

  it( 'accepts a note and a target folder once they are set', () => {
    const drafted = { ...validJob, note_markdown: '---\n---\n', target_folder: 'Learning/AI' }

    expect( Job.safeParse( drafted ).success ).toBe( true )
  } )

  it.each( [ 'note_markdown', 'target_folder', 'default_folder' ] as const )(
    'rejects a missing %s',
    ( key ) => {
      const without: Partial< typeof validJob > = { ...validJob }
      delete without[ key ]

      expect( Job.safeParse( without ).success ).toBe( false )
    },
  )

  it( 'accepts a reviewed job with an expiry and a saved path', () => {
    const summarized = {
      ...validJob,
      status: 'ready_for_review',
      title: 'A talk',
      note_markdown: '---\ntitle: "A talk"\n---\n\nText\n',
      expires_at: '2026-10-15T10:00:00.000Z',
      saved_path: 'Mnemosyne/A talk.md',
    }

    expect( Job.safeParse( summarized ).success ).toBe( true )
  } )

  it.each( [ 'title', 'expires_at', 'saved_path' ] )(
    'rejects a missing %s field',
    ( field ) => {
      const without: Record< string, unknown > = { ...validJob }
      delete without[ field ]

      expect( Job.safeParse( without ).success ).toBe( false )
    },
  )

  it( 'rejects a non-ISO expires_at', () => {
    expect( Job.safeParse( { ...validJob, expires_at: 'tomorrow' } ).success ).toBe( false )
  } )

  it( 'no longer carries the 0.2.0 summary fields', () => {
    const parsed = Job.parse( { ...validJob, summary_markdown: 'old', suggested_tags: [ 'x' ] } )

    expect( parsed ).not.toHaveProperty( 'summary_markdown' )
    expect( parsed ).not.toHaveProperty( 'suggested_tags' )
  } )
} )

describe( 'Job summary fields', () => {
  const usage = {
    last_run: {
      model: 'claude-sonnet-5-5',
      profile_id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
      profile_name: 'Business ideas',
      prompt_version: 1,
      input_tokens: 100,
      output_tokens: 20,
      cost_usd: 0.01,
      outcome: 'succeeded',
      created_at: '2026-10-17T10:00:00.000Z',
    },
    run_count: 1,
    total_input_tokens: 100,
    total_output_tokens: 20,
    total_cost_usd: 0.01,
  }

  it( 'accepts a model, a profile and usage', () => {
    const job = {
      ...validJob,
      summary_model: 'claude-sonnet-5-5',
      prompt_profile_id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
      summary_usage: usage,
    }

    expect( Job.safeParse( job ).success ).toBe( true )
  } )

  it.each( [ 'summary_model', 'prompt_profile_id', 'summary_usage' ] )(
    'requires %s to be present',
    ( field ) => {
      const without: Record< string, unknown > = { ...validJob }
      delete without[ field ]

      expect( Job.safeParse( without ).success ).toBe( false )
    },
  )

  it( 'rejects a profile id that is not a uuid', () => {
    expect( Job.safeParse( { ...validJob, prompt_profile_id: 'x' } ).success ).toBe( false )
  } )
} )

const linkRun = {
  model: 'claude-haiku-5-5',
  prompt_version: 1,
  input_tokens: 1200,
  output_tokens: 300,
  cache_read_input_tokens: 800,
  cache_creation_input_tokens: 0,
  tool_calls: 4,
  cost_usd: null,
  outcome: 'succeeded',
  created_at: '2026-10-21T10:00:00.000Z',
}

describe( 'LinkState', () => {
  it.each( [ 'off', 'pending', 'linked', 'failed' ] )( 'accepts %s', ( state ) => {
    expect( LinkState.safeParse( state ).success ).toBe( true )
  } )

  it( 'rejects an unknown state', () => {
    expect( LinkState.safeParse( 'running' ).success ).toBe( false )
  } )
} )

describe( 'Job link fields', () => {
  it.each( [ 'off', 'pending', 'linked', 'failed' ] )( 'accepts link_state %s', ( state ) => {
    expect( Job.safeParse( { ...validJob, link_state: state } ).success ).toBe( true )
  } )

  it( 'rejects an unknown link_state', () => {
    expect( Job.safeParse( { ...validJob, link_state: 'running' } ).success ).toBe( false )
  } )

  it( 'accepts a link error and link usage', () => {
    const usage = {
      last_run: linkRun,
      run_count: 1,
      total_input_tokens: 1200,
      total_output_tokens: 300,
      total_cost_usd: null,
    }

    expect( Job.safeParse( {
      ...validJob,
      link_state: 'failed',
      link_error: 'Timed out',
      link_usage: usage,
    } ).success ).toBe( true )
  } )
} )

describe( 'LinkRun and LinkUsageSummary', () => {
  it( 'accepts a succeeded run without a price', () => {
    expect( LinkRun.safeParse( linkRun ).success ).toBe( true )
  } )

  it( 'accepts a priced run', () => {
    expect( LinkRun.safeParse( { ...linkRun, cost_usd: 0.002 } ).success ).toBe( true )
  } )

  it( 'rejects an unknown outcome and a prompt version below 1', () => {
    expect( LinkRun.safeParse( { ...linkRun, outcome: 'pending' } ).success ).toBe( false )
    expect( LinkRun.safeParse( { ...linkRun, prompt_version: 0 } ).success ).toBe( false )
  } )

  it( 'rejects negative token counts', () => {
    expect( LinkRun.safeParse( { ...linkRun, input_tokens: -1 } ).success ).toBe( false )
  } )

  it( 'accepts usage and needs at least one run', () => {
    const usage = {
      last_run: linkRun,
      run_count: 2,
      total_input_tokens: 2400,
      total_output_tokens: 600,
      total_cost_usd: 0.004,
    }

    expect( LinkUsageSummary.safeParse( usage ).success ).toBe( true )
    expect( LinkUsageSummary.safeParse( { ...usage, run_count: 0 } ).success ).toBe( false )
  } )
} )
