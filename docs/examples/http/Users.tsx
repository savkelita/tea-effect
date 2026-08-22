import * as Cmd from 'tea-effect/Cmd'
import * as Http from 'tea-effect/Http'
import type * as TeaReact from 'tea-effect/React'
import { listUsers, type User } from './api'

// #region model
export type Model =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Loaded'; readonly users: ReadonlyArray<User> }
  | { readonly _tag: 'Failed'; readonly error: Http.HttpError }
// #endregion model

export type Msg =
  | { readonly type: 'LoadRequested' }
  | { readonly type: 'UsersReceived'; readonly users: ReadonlyArray<User> }
  | { readonly type: 'RequestFailed'; readonly error: Http.HttpError }

export const init: readonly [Model, Cmd.Cmd<Msg>] = [{ _tag: 'Idle' }, Cmd.none]

// #region update
// Message constructors, so the handlers below read as names rather than literals.
const UsersReceived = (users: ReadonlyArray<User>): Msg => ({ type: 'UsersReceived', users })
const RequestFailed = (error: Http.HttpError): Msg => ({ type: 'RequestFailed', error })

export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'LoadRequested':
      // Already in flight - ignore. The model makes this check obvious.
      if (model._tag === 'Loading') {
        return [model, Cmd.none]
      }
      return [
        { _tag: 'Loading' },
        // Both outcomes become messages, so this Cmd cannot fail: its `E` is `never`.
        Http.send(listUsers, { onSuccess: UsersReceived, onError: RequestFailed })
      ]

    case 'UsersReceived':
      return [{ _tag: 'Loaded', users: msg.users }, Cmd.none]

    case 'RequestFailed':
      return [{ _tag: 'Failed', error: msg.error }, Cmd.none]
  }
}
// #endregion update

// #region errors
// Every branch is required: `HttpError` is a closed union, so adding a case to it
// is a compile error here rather than a silently unhandled failure.
export const describeError = (error: Http.HttpError): string => {
  switch (error._tag) {
    case 'BadUrl':
      return `Invalid URL: ${error.url}`

    case 'Timeout':
      return 'The request timed out'

    case 'NetworkError':
      return 'Network error - check your connection'

    case 'BadStatus':
      return `The server responded with ${error.status}`

    case 'BadBody':
      // The response arrived but did not match the schema.
      return 'The server sent data we could not read'

    case 'BadRequestBody':
      // Encoding failed, so no request was ever sent.
      return 'We could not encode the request'
  }
}
// #endregion errors

export const view =
  (model: Model): TeaReact.Html<Msg> =>
  (dispatch) => {
    switch (model._tag) {
      case 'Idle':
        return <button onClick={() => dispatch({ type: 'LoadRequested' })}>Load users</button>

      case 'Loading':
        return <p>Loading...</p>

      case 'Loaded':
        return (
          <ul>
            {model.users.map((user) => (
              <li key={user.id}>{user.name}</li>
            ))}
          </ul>
        )

      case 'Failed':
        return (
          <div>
            <p>{describeError(model.error)}</p>
            <button onClick={() => dispatch({ type: 'LoadRequested' })}>Try again</button>
          </div>
        )
    }
  }
