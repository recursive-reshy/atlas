// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useModels } from '#src/features/settings/hooks/useModels'
import { modelsState } from '#src/test-support/hookStates'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { BUSINESS_ID } from '#src/features/jobs/fixtures/summarizer.fixture'
import { SummaryInfo } from './SummaryInfo'

vi.mock( '#src/features/settings/hooks/useModels' )

const usage = ( overrides: Record< string, unknown > = {} ) => ( {
  last_run: {
    model: 'claude-sonnet-5-5',
    profile_id: BUSINESS_ID,
    profile_name: 'Business ideas',
    prompt_version: 3,
    input_tokens: 31_200,
    output_tokens: 1_400,
    cost_usd: 0.1243,
    outcome: 'succeeded' as const,
    created_at: '2026-10-17T10:00:00.000Z',
  },
  run_count: 1,
  total_input_tokens: 31_200,
  total_output_tokens: 1_400,
  total_cost_usd: 0.1243,
  ...overrides,
} )

beforeEach( () => {
  vi.mocked( useModels ).mockReturnValue( modelsState() )
} )

describe( 'SummaryInfo', () => {
  it( 'shows how the summary was made, with the model\'s display name', () => {
    renderWithClient( <SummaryInfo usage={ usage() } /> )

    expect( screen.getByText(
      'Claude Sonnet 5.5 · Business ideas v3 · 31.2k in / 1.4k out · ~US$0.12',
    ) ).toBeInTheDocument()
  } )

  it( 'falls back to the model id when the model is not listed', () => {
    const retired = usage()
    retired.last_run.model = 'claude-retired-1'
    renderWithClient( <SummaryInfo usage={ retired } /> )

    expect( screen.getByText( /^claude-retired-1 · Business ideas v3/ ) ).toBeInTheDocument()
  } )

  it( 'falls back to the model id while the model list is loading', () => {
    vi.mocked( useModels ).mockReturnValue(
      modelsState( { models: [], source: null, isLoading: true } ),
    )
    renderWithClient( <SummaryInfo usage={ usage() } /> )

    expect( screen.getByText( /^claude-sonnet-5-5 · Business ideas v3/ ) ).toBeInTheDocument()
  } )

  it( 'adds the attempts and the total when there was more than one', () => {
    renderWithClient( <SummaryInfo usage={ usage( { run_count: 2, total_cost_usd: 0.25 } ) } /> )

    expect( screen.getByText( '2 attempts, ~US$0.25 total' ) ).toBeInTheDocument()
  } )

  it( 'shows no attempts line for a single attempt', () => {
    renderWithClient( <SummaryInfo usage={ usage() } /> )

    expect( screen.queryByText( /attempts/ ) ).not.toBeInTheDocument()
  } )

  describe( 'linking usage', () => {
    const linkUsage = ( overrides: Record< string, unknown > = {} ) => ( {
      last_run: {
        model: 'claude-haiku-5-5',
        prompt_version: 2,
        input_tokens: 12_000,
        output_tokens: 800,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        tool_calls: 6,
        cost_usd: null,
        outcome: 'succeeded' as const,
        created_at: '2026-10-17T10:00:00.000Z',
      },
      run_count: 1,
      total_input_tokens: 12_000,
      total_output_tokens: 800,
      total_cost_usd: null,
      ...overrides,
    } )

    it( 'shows the linking run under the summary, with the model\'s display name', () => {
      vi.mocked( useModels ).mockReturnValue( modelsState( {
        models: [
          { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
          { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' },
        ],
      } ) )
      renderWithClient( <SummaryInfo usage={ usage() } linkUsage={ linkUsage() } /> )

      expect( screen.getByText(
        'Linking · Claude Haiku 5.5 · prompt v2 · 6 tool calls · 12.0k in / 0.8k out',
      ) ).toBeInTheDocument()
      expect( screen.getByText( /^Claude Sonnet 5.5 · Business ideas v3/ ) ).toBeInTheDocument()
    } )

    it( 'shows the attempts of linking when there was more than one', () => {
      renderWithClient(
        <SummaryInfo usage={ usage() } linkUsage={ linkUsage( { run_count: 2 } ) } />,
      )

      expect( screen.getByText( '2 attempts' ) ).toBeInTheDocument()
    } )

    it( 'shows linking alone when the summary has no usage', () => {
      renderWithClient( <SummaryInfo usage={ null } linkUsage={ linkUsage() } /> )

      expect( screen.getByText( /^Linking · claude-haiku-5-5 · prompt v2/ ) ).toBeInTheDocument()
    } )

    it( 'renders nothing without any usage', () => {
      const { container } = renderWithClient( <SummaryInfo usage={ null } linkUsage={ null } /> )

      expect( container ).toBeEmptyDOMElement()
    } )

    it( 'shows no linking line without link usage', () => {
      renderWithClient( <SummaryInfo usage={ usage() } linkUsage={ null } /> )

      expect( screen.queryByText( /^Linking/ ) ).not.toBeInTheDocument()
    } )
  } )
} )
