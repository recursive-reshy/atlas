// Packages
import {
  describe,
  it,
  expect,
  vi,
} from 'vitest'
// Worker
import {
  onGeneratorWake,
  onWorkerWake,
  wakeGenerator,
  wakeWorker,
} from './wake.js'

describe( 'wake', () => {
  it( 'tells the worker, not the generator, after the caller\'s code has run', async () => {
    const worker = vi.fn()
    const generator = vi.fn()
    const offWorker = onWorkerWake( worker )
    const offGenerator = onGeneratorWake( generator )

    wakeWorker()
    expect( worker ).not.toHaveBeenCalled()

    await Promise.resolve()

    expect( worker ).toHaveBeenCalledTimes( 1 )
    expect( generator ).not.toHaveBeenCalled()

    wakeGenerator()
    await Promise.resolve()

    expect( generator ).toHaveBeenCalledTimes( 1 )

    offWorker()
    offGenerator()
  } )

  it( 'stops telling a listener that has unsubscribed', async () => {
    const worker = vi.fn()

    onWorkerWake( worker )()
    wakeWorker()
    await Promise.resolve()

    expect( worker ).not.toHaveBeenCalled()
  } )
} )
