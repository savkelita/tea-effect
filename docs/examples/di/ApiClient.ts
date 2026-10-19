import { Context, Effect, Layer } from 'effect'
import * as Http from 'tea-effect/Http'
import { listUsers, type User } from '../http/api'

// #region service
// A service is a key plus the shape behind it. The key is the type your commands
// will ask for; nothing here says how it is implemented.
export class ApiClient extends Context.Service<
  ApiClient,
  {
    readonly listUsers: Effect.Effect<ReadonlyArray<User>, Http.HttpError>
  }
>()('ApiClient') {}
// #endregion service

// #region live
// The real implementation: the JSONPlaceholder request from the HTTP guide.
export const ApiClientLive = Layer.succeed(
  ApiClient,
  ApiClient.of({
    listUsers: Http.toTask(listUsers)
  })
)
// #endregion live

// #region test
// A test swaps the implementation and changes nothing else. No mocking library,
// no module interception - the same key, a different value behind it.
export const ApiClientTest = (users: ReadonlyArray<User>) =>
  Layer.succeed(
    ApiClient,
    ApiClient.of({
      listUsers: Effect.succeed(users)
    })
  )
// #endregion test
