// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type { AgentStatus, LinkState } from '@atlas/shared'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { LinkingNotice } from './LinkingNotice'

interface SetupOptions {
  linkState?: LinkState | null
  linkError?: string | null
  agentStatus?: AgentStatus | null
  isRunning?: boolean
  error?: string | null
}

const setup = ( {
  linkState = null,
  linkError = null,
  agentStatus = 'ok',
  isRunning = false,
  error = null,
}: SetupOptions = {} ) => {
  const onRun = vi.fn()

  renderWithClient(
    <LinkingNotice
      linkState={ linkState }
      linkError={ linkError }
      agentStatus={ agentStatus }
      isRunning={ isRunning }
      error={ error }
      onRun={ onRun }
    />,
  )

  return { onRun, user: userEvent.setup() }
}

describe( 'LinkingNotice', () => {
  it( 'shows why linking failed, with Retry linking', async () => {
    const { onRun, user } = setup( { linkState: 'failed', linkError: 'Agent service unreachable' } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Agent service unreachable' )

    await user.click( screen.getByRole( 'button', { name: 'Retry linking' } ) )

    expect( onRun ).toHaveBeenCalledOnce()
  } )

  it( 'falls back to a generic message when a failed run has no reason', () => {
    setup( { linkState: 'failed', linkError: null } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Linking failed.' )
  } )

  it.each( [ 'ok', 'unavailable' ] as const )(
    'offers Run linking when linking is off and the agent is %s',
    async ( agentStatus ) => {
      const { onRun, user } = setup( { linkState: 'off', agentStatus } )

      await user.click( screen.getByRole( 'button', { name: 'Run linking' } ) )

      expect( onRun ).toHaveBeenCalledOnce()
    },
  )

  it( 'points to Settings when the agent is not configured', () => {
    setup( { linkState: 'off', agentStatus: 'not_configured' } )

    expect( screen.queryByRole( 'button', { name: 'Run linking' } ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Settings' } ) )
      .toHaveAttribute( 'href', '/settings/models' )
  } )

  it( 'shows nothing about linking while the agent status is unknown', () => {
    setup( { linkState: 'off', agentStatus: null } )

    expect( screen.queryByRole( 'button' ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'link' ) ).not.toBeInTheDocument()
  } )

  it.each( [ 'linked', 'pending', null ] as const )(
    'shows nothing when the link state is %s',
    ( linkState ) => {
      setup( { linkState } )

      expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
      expect( screen.queryByRole( 'button' ) ).not.toBeInTheDocument()
    },
  )

  it( 'disables the button while a run is starting', () => {
    setup( { linkState: 'failed', linkError: 'x', isRunning: true } )

    expect( screen.getByRole( 'button', { name: 'Retry linking' } ) ).toBeDisabled()
  } )

  it( 'shows the error when starting a run failed', () => {
    setup( { linkState: 'off', error: 'Linking isn\'t configured' } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Linking isn\'t configured' )
  } )
} )
