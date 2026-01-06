/**
 * Test Runtime
 *
 * Simple test to verify TEA runtime works correctly.
 */
import { Effect, Stream, pipe } from 'effect'
import * as Platform from '../src/Platform'
import { init, update, subscriptions, Model, Msg } from './UserList'

const main = Effect.gen(function* () {
  console.log('🚀 Starting TEA runtime test...\n')

  // Create the program
  const program = yield* Platform.program(init, update, subscriptions)

  console.log('✅ Program created successfully')
  console.log('📤 Initial model:', JSON.stringify(program, null, 2))

  // Subscribe to model changes in background
  const modelSubscription = yield* pipe(
    program.model$,
    Stream.tap((model) =>
      Effect.sync(() => {
        console.log('\n📥 Model updated:')
        console.log('   users:', model.users.length)
        console.log('   loading:', model.loading)
        console.log('   error:', model.error._tag)
      })
    ),
    Stream.runDrain,
    Effect.fork
  )

  // Wait a bit for initial state
  yield* Effect.sleep('100 millis')

  // Dispatch FetchUsers message
  console.log('\n📨 Dispatching: FetchUsers')
  program.dispatch({ type: 'FetchUsers' })

  // Wait for API response
  console.log('⏳ Waiting for API response...')
  yield* Effect.sleep('3 seconds')

  // Shutdown
  console.log('\n🛑 Shutting down...')
  yield* program.shutdown

  console.log('✅ Test completed!')
})

// Run with scoped to manage resources
Effect.runPromise(Effect.scoped(main))
  .then(() => {
    console.log('\n👋 Done')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
