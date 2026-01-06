/**
 * Test Counter Runtime
 */
import { Effect, Stream, pipe } from 'effect'
import * as Platform from '../src/Platform'
import { init, update, subscriptions, Increment, Decrement, Reset } from './Counter'

const main = Effect.gen(function* () {
  console.log('🔢 Counter Test\n')

  const program = yield* Platform.program(init, update, subscriptions)

  // Subscribe to model changes
  yield* pipe(
    program.model$,
    Stream.tap((model) => Effect.sync(() => console.log(`Count: ${model.count}`))),
    Stream.runDrain,
    Effect.fork
  )

  yield* Effect.sleep('50 millis')

  console.log('\n📨 Increment x3')
  program.dispatch(Increment)
  program.dispatch(Increment)
  program.dispatch(Increment)

  yield* Effect.sleep('100 millis')

  console.log('\n📨 Decrement')
  program.dispatch(Decrement)

  yield* Effect.sleep('100 millis')

  console.log('\n📨 Reset')
  program.dispatch(Reset)

  yield* Effect.sleep('100 millis')

  yield* program.shutdown
  console.log('\n✅ Done')
})

Effect.runPromise(Effect.scoped(main)).catch(console.error)
