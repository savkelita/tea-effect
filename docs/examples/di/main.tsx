import { Effect, ManagedRuntime, Runtime } from 'effect'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as Sub from 'tea-effect/Sub'
import * as TeaReact from 'tea-effect/React'
import { ApiClient, ApiClientLive } from './ApiClient'
import * as Users from './Users'

const view =
  (model: Users.Model): TeaReact.Html<Users.Msg> =>
  (dispatch) =>
    model._tag === 'Loaded' ? (
      <ul>
        {model.users.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    ) : (
      <button onClick={() => dispatch({ type: 'LoadRequested' })}>Load</button>
    )

// #region whole-app
// When tea-effect owns the root, provide the layer to the Effect that runs the
// program. `R` is discharged there, and `runPromise` accepts it.
export const main = () => {
  const root = createRoot(document.getElementById('app')!)

  return Effect.runPromise(
    TeaReact.run(TeaReact.program(Users.init, Users.update, view), (dom) =>
      root.render(dom)
    ).pipe(Effect.provide(ApiClientLive))
  )
}
// #endregion whole-app

// #region hook
// Inside an existing React tree it is `useProgram` instead, and that wants a
// Runtime rather than a Layer. Build it once, at module level.
const AppRuntime = ManagedRuntime.make(ApiClientLive)

// ApiClientLive is built synchronously, so the runtime can be too. A layer that
// opens a connection or reads configuration would need `AppRuntime.runtime()`,
// which is a Promise.
const runtime: Runtime.Runtime<ApiClient> = Effect.runSync(AppRuntime)

const useProgram = TeaReact.makeUseProgram(React)

export const UsersFeature = () => {
  // Because `R` is not `never`, TypeScript requires the runtime argument here.
  // Forgetting it is a compile error, not a failure at runtime.
  const { model, dispatch } = useProgram(Users.init, Users.update, () => Sub.none, {
    runtime
  })

  return model._tag === 'Loaded' ? (
    <ul>
      {model.users.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  ) : (
    <button onClick={() => dispatch({ type: 'LoadRequested' })}>Load</button>
  )
}
// #endregion hook
