/**
 * UserList Example
 *
 * Demonstrates TEA with API calls, error handling, and typed effects.
 */
import { Effect, pipe, Option } from 'effect'
import * as Cmd from '../src/Cmd'
import * as Sub from '../src/Sub'
import * as Task from '../src/Task'

// -------------------------------------------------------------------------------------
// Domain
// -------------------------------------------------------------------------------------

export type User = {
  readonly id: number
  readonly name: string
  readonly email: string
}

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export type Model = {
  readonly users: ReadonlyArray<User>
  readonly loading: boolean
  readonly error: Option.Option<string>
}

export const init: readonly [Model, Cmd.Cmd<Msg>] = [
  {
    users: [],
    loading: false,
    error: Option.none(),
  },
  Cmd.none,
]

// initWithFetch is a function to avoid reference before initialization
export const initWithFetch = (): readonly [Model, Cmd.Cmd<Msg>] => [
  {
    users: [],
    loading: true,
    error: Option.none(),
  },
  fetchUsersCmd,
]

// -------------------------------------------------------------------------------------
// Messages
// -------------------------------------------------------------------------------------

export type Msg =
  | { readonly type: 'FetchUsers' }
  | { readonly type: 'FetchUsersSuccess'; readonly users: ReadonlyArray<User> }
  | { readonly type: 'FetchUsersError'; readonly error: string }
  | { readonly type: 'DeleteUser'; readonly id: number }
  | { readonly type: 'ClearError' }

// -------------------------------------------------------------------------------------
// Commands
// -------------------------------------------------------------------------------------

// API Effect - this could come from a service layer
const fetchUsersEffect: Effect.Effect<ReadonlyArray<User>, Error> = Effect.tryPromise({
  try: async () => {
    const response = await fetch('https://jsonplaceholder.typicode.com/users')
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }
    return response.json()
  },
  catch: (error) => new Error(String(error)),
})

// Convert Effect to Cmd using Task.attemptWith
const fetchUsersCmd: Cmd.Cmd<Msg> = pipe(
  fetchUsersEffect,
  Task.attemptWith({
    onSuccess: (users): Msg => ({ type: 'FetchUsersSuccess', users }),
    onFailure: (error): Msg => ({ type: 'FetchUsersError', error: error.message }),
  })
)

// Delete user command (simulated)
const deleteUserCmd = (id: number): Cmd.Cmd<Msg> =>
  pipe(
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`, {
          method: 'DELETE',
        })
        if (!response.ok) {
          throw new Error(`Failed to delete user ${id}`)
        }
        return id
      },
      catch: (error) => new Error(String(error)),
    }),
    Task.attemptWith({
      onSuccess: (): Msg => ({ type: 'FetchUsers' }), // Refetch after delete
      onFailure: (error): Msg => ({ type: 'FetchUsersError', error: error.message }),
    })
  )

// -------------------------------------------------------------------------------------
// Update
// -------------------------------------------------------------------------------------

export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'FetchUsers':
      return [
        { ...model, loading: true, error: Option.none() },
        fetchUsersCmd,
      ]

    case 'FetchUsersSuccess':
      return [
        { ...model, loading: false, users: msg.users },
        Cmd.none,
      ]

    case 'FetchUsersError':
      return [
        { ...model, loading: false, error: Option.some(msg.error) },
        Cmd.none,
      ]

    case 'DeleteUser':
      return [
        { ...model, loading: true },
        deleteUserCmd(msg.id),
      ]

    case 'ClearError':
      return [
        { ...model, error: Option.none() },
        Cmd.none,
      ]
  }
}

// -------------------------------------------------------------------------------------
// Subscriptions
// -------------------------------------------------------------------------------------

export const subscriptions = (_model: Model): Sub.Sub<Msg> => Sub.none

// -------------------------------------------------------------------------------------
// View Props (framework-agnostic)
// -------------------------------------------------------------------------------------

export const viewProps = (model: Model) => (dispatch: (msg: Msg) => void) => ({
  users: model.users,
  loading: model.loading,
  error: Option.getOrNull(model.error),
  onFetchUsers: () => dispatch({ type: 'FetchUsers' }),
  onDeleteUser: (id: number) => dispatch({ type: 'DeleteUser', id }),
  onClearError: () => dispatch({ type: 'ClearError' }),
})
