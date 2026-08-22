import { Effect, pipe } from 'effect'
import * as Cmd from 'tea-effect/Cmd'
import * as Http from 'tea-effect/Http'
import * as Task from 'tea-effect/Task'
import { ApiClient } from './ApiClient'
import type { User } from '../http/api'

export type Model =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Loaded'; readonly users: ReadonlyArray<User> }
  | { readonly _tag: 'Failed'; readonly error: Http.HttpError }

export type Msg =
  | { readonly type: 'LoadRequested' }
  | { readonly type: 'UsersReceived'; readonly users: ReadonlyArray<User> }
  | { readonly type: 'RequestFailed'; readonly error: Http.HttpError }

// #region cmd
// Asking for the service is an ordinary Effect. The result is a command whose
// `R` says ApiClient - the requirement is now part of the type, and the program
// will not compile until something provides it.
const loadUsers: Cmd.Cmd<Msg, never, ApiClient> = pipe(
  Effect.flatMap(ApiClient, (api) => api.listUsers),
  Task.attemptWith({
    onSuccess: (users: ReadonlyArray<User>): Msg => ({ type: 'UsersReceived', users }),
    onFailure: (error: Http.HttpError): Msg => ({ type: 'RequestFailed', error })
  })
)
// #endregion cmd

export const init: readonly [Model, Cmd.Cmd<Msg, never, ApiClient>] = [
  { _tag: 'Idle' },
  Cmd.none
]

// #region update
// `update` itself is untouched by dependency injection: it still just returns a
// command. Only the command's type carries the requirement.
export const update = (
  msg: Msg,
  model: Model
): readonly [Model, Cmd.Cmd<Msg, never, ApiClient>] => {
  switch (msg.type) {
    case 'LoadRequested':
      return model._tag === 'Loading' ? [model, Cmd.none] : [{ _tag: 'Loading' }, loadUsers]

    case 'UsersReceived':
      return [{ _tag: 'Loaded', users: msg.users }, Cmd.none]

    case 'RequestFailed':
      return [{ _tag: 'Failed', error: msg.error }, Cmd.none]
  }
}
// #endregion update
