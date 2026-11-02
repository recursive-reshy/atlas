// Node
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// One vaults folder per Vitest worker. Several test files empty it, and with a shared folder one
// worker deleted the vaults another was using; now that a vault must exist to be used (ADR 0070)
// that would fail tests at random. Must run before anything imports the config.
const worker = process.env.VITEST_POOL_ID ?? '0'

process.env.VAULTS_PATH = join( tmpdir(), `atlas-test-vaults-${ worker }` )
