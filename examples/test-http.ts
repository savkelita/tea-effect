/**
 * Test Http Module
 *
 * Tests the Http module with JSONPlaceholder API.
 */
import { Effect, Stream, pipe, Schema } from 'effect'
import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient'
import * as Platform from '../src/Platform'
import * as Http from '../src/Http'
import { init, update, subscriptions, renderError } from './HttpUsers'

// Quick direct test of Http module
const testHttpDirectly = Effect.gen(function* () {
  console.log('🧪 Testing Http module directly...')

  const request = Http.get(
    'https://jsonplaceholder.typicode.com/users',
    Http.expectJson(Schema.Array(Schema.Struct({
      id: Schema.Number,
      name: Schema.String,
      username: Schema.String,
      email: Schema.String
    })))
  )

  const result = yield* Http.toTask(request)
  console.log(`✅ Direct HTTP test passed - got ${result.length} users`)
  return result
})

const main = Effect.gen(function* () {
  console.log('🚀 Starting Http module test...\n')

  // First test Http directly
  yield* testHttpDirectly

  // Create the program
  const program = yield* Platform.program(init, update, subscriptions)

  console.log('✅ Program created successfully')

  // Subscribe to model changes in background
  yield* pipe(
    program.model$,
    Stream.tap((model) =>
      Effect.sync(() => {
        console.log('\n📥 Model updated:')
        console.log('   users:', model.users.length)
        console.log('   loading:', model.loading)
        console.log('   error:', model.error ? renderError(model.error) : null)
        if (model.users.length > 0 && model.users.length <= 3) {
          console.log('   user names:', model.users.map(u => u.name).join(', '))
        }
      })
    ),
    Stream.runDrain,
    Effect.fork
  )

  // Wait a bit for initial state
  yield* Effect.sleep('100 millis')

  // 1. Fetch all users
  console.log('\n📨 Dispatching: FetchUsers')
  program.dispatch({ type: 'FetchUsers' })

  // Wait for API response
  console.log('⏳ Waiting for API response...')
  yield* Effect.sleep('2 seconds')

  // 2. Create a new user
  console.log('\n📨 Dispatching: SetNewUserName + CreateUser')
  program.dispatch({ type: 'SetNewUserName', name: 'John Doe' })
  yield* Effect.sleep('100 millis')
  program.dispatch({ type: 'CreateUser' })

  // Wait for API response
  yield* Effect.sleep('2 seconds')

  // 3. Delete the first user
  console.log('\n📨 Dispatching: DeleteUser (id: 1)')
  program.dispatch({ type: 'DeleteUser', id: 1 })

  // Wait for API response
  yield* Effect.sleep('2 seconds')

  // Shutdown
  console.log('\n🛑 Shutting down...')
  yield* program.shutdown

  console.log('✅ Test completed!')
})

// Provide HttpClient layer for Node.js
const HttpClientLive = NodeHttpClient.layer

// Run with scoped to manage resources
Effect.runPromise(
  pipe(
    Effect.scoped(main),
    Effect.provide(HttpClientLive)
  )
)
  .then(() => {
    console.log('\n👋 Done')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
