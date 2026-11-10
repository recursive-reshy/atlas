// Node
import { EventEmitter } from 'node:events'

// ADR 0100: services tell the loops that work is waiting, so a pass starts at once; the loops
// still poll, so a missed wake only delays work
const emitter = new EventEmitter()

// Delivered in a microtask, so a listener never runs inside the caller's database transaction
const wake = ( loop: 'worker' | 'generator' ): void => {
  queueMicrotask( () => emitter.emit( loop ) )
}

const listen = ( loop: 'worker' | 'generator', listener: () => void ): ( () => void ) => {
  emitter.on( loop, listener )

  return () => {
    emitter.off( loop, listener )
  }
}

export const wakeWorker = (): void => wake( 'worker' )

export const wakeGenerator = (): void => wake( 'generator' )

export const onWorkerWake = ( listener: () => void ): ( () => void ) => listen( 'worker', listener )

export const onGeneratorWake = ( listener: () => void ): ( () => void ) => {
  return listen( 'generator', listener )
}
