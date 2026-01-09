/**
 * HttpUsers Example
 *
 * Demonstrates the Http module with JSONPlaceholder API.
 * Shows Schema validation, GET/POST/DELETE requests, and error handling.
 */
import { Schema } from 'effect'
import * as Cmd from '../src/Cmd'
import * as Sub from '../src/Sub'
import * as Http from '../src/Http'

// -------------------------------------------------------------------------------------
// Domain (with Schema validation)
// -------------------------------------------------------------------------------------

export const User = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  username: Schema.String,
  email: Schema.String
})

export type User = Schema.Schema.Type<typeof User>

// For creating new users
export const CreateUserInput = Schema.Struct({
  name: Schema.String,
  username: Schema.String,
  email: Schema.String
})

export type CreateUserInput = Schema.Schema.Type<typeof CreateUserInput>

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export type Model = {
  readonly users: ReadonlyArray<User>
  readonly loading: boolean
  readonly error: Http.HttpError | null
  readonly newUserName: string
}

export const init: readonly [Model, Cmd.Cmd<Msg, never, Http.HttpRequirements>] = [
  {
    users: [],
    loading: false,
    error: null,
    newUserName: ''
  },
  Cmd.none
]

// Init with automatic fetch
export const initWithFetch = (): readonly [Model, Cmd.Cmd<Msg, never, Http.HttpRequirements>] => [
  {
    users: [],
    loading: true,
    error: null,
    newUserName: ''
  },
  fetchUsersCmd
]

// -------------------------------------------------------------------------------------
// Messages
// -------------------------------------------------------------------------------------

export type Msg =
  | { readonly type: 'FetchUsers' }
  | { readonly type: 'UsersLoaded'; readonly users: ReadonlyArray<User> }
  | { readonly type: 'UsersFailed'; readonly error: Http.HttpError }
  | { readonly type: 'SetNewUserName'; readonly name: string }
  | { readonly type: 'CreateUser' }
  | { readonly type: 'UserCreated'; readonly user: User }
  | { readonly type: 'DeleteUser'; readonly id: number }
  | { readonly type: 'UserDeleted'; readonly id: number }
  | { readonly type: 'ClearError' }

// -------------------------------------------------------------------------------------
// Http Requests
// -------------------------------------------------------------------------------------

const BASE_URL = 'https://jsonplaceholder.typicode.com'

// GET /users - Fetch all users
const fetchUsersRequest = Http.get(
  `${BASE_URL}/users`,
  Http.expectJson(Schema.Array(User))
)

// POST /users - Create a new user
const createUserRequest = (input: CreateUserInput) =>
  Http.post(
    `${BASE_URL}/users`,
    input,
    Http.expectJson(User)
  )

// DELETE /users/:id - Delete a user
const deleteUserRequest = (id: number) =>
  Http.del(
    `${BASE_URL}/users/${id}`,
    Http.expectWhatever // DELETE returns empty object
  )

// -------------------------------------------------------------------------------------
// Commands
// -------------------------------------------------------------------------------------

const fetchUsersCmd: Cmd.Cmd<Msg, never, Http.HttpRequirements> = Http.send(fetchUsersRequest, {
  onSuccess: (users): Msg => ({ type: 'UsersLoaded', users }),
  onError: (error): Msg => ({ type: 'UsersFailed', error })
})

const createUserCmd = (name: string): Cmd.Cmd<Msg, never, Http.HttpRequirements> =>
  Http.send(createUserRequest({ name, username: name.toLowerCase().replace(/\s/g, ''), email: `${name.toLowerCase().replace(/\s/g, '')}@example.com` }), {
    onSuccess: (user): Msg => ({ type: 'UserCreated', user }),
    onError: (error): Msg => ({ type: 'UsersFailed', error })
  })

const deleteUserCmd = (id: number): Cmd.Cmd<Msg, never, Http.HttpRequirements> =>
  Http.send(deleteUserRequest(id), {
    onSuccess: (): Msg => ({ type: 'UserDeleted', id }),
    onError: (error): Msg => ({ type: 'UsersFailed', error })
  })

// -------------------------------------------------------------------------------------
// Update
// -------------------------------------------------------------------------------------

export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg, never, Http.HttpRequirements>] => {
  switch (msg.type) {
    case 'FetchUsers':
      return [
        { ...model, loading: true, error: null },
        fetchUsersCmd
      ]

    case 'UsersLoaded':
      return [
        { ...model, loading: false, users: msg.users },
        Cmd.none
      ]

    case 'UsersFailed':
      return [
        { ...model, loading: false, error: msg.error },
        Cmd.none
      ]

    case 'SetNewUserName':
      return [
        { ...model, newUserName: msg.name },
        Cmd.none
      ]

    case 'CreateUser':
      if (!model.newUserName.trim()) {
        return [model, Cmd.none]
      }
      return [
        { ...model, loading: true },
        createUserCmd(model.newUserName)
      ]

    case 'UserCreated':
      // Note: JSONPlaceholder doesn't actually persist, but returns the created user
      return [
        {
          ...model,
          loading: false,
          users: [...model.users, msg.user],
          newUserName: ''
        },
        Cmd.none
      ]

    case 'DeleteUser':
      return [
        { ...model, loading: true },
        deleteUserCmd(msg.id)
      ]

    case 'UserDeleted':
      // Note: JSONPlaceholder doesn't actually persist, but we update local state
      return [
        {
          ...model,
          loading: false,
          users: model.users.filter(u => u.id !== msg.id)
        },
        Cmd.none
      ]

    case 'ClearError':
      return [
        { ...model, error: null },
        Cmd.none
      ]
  }
}

// -------------------------------------------------------------------------------------
// Subscriptions
// -------------------------------------------------------------------------------------

export const subscriptions = (_model: Model): Sub.Sub<Msg> => Sub.none

// -------------------------------------------------------------------------------------
// Error Helpers
// -------------------------------------------------------------------------------------

export const renderError = (error: Http.HttpError): string => {
  switch (error._tag) {
    case 'BadUrl':
      return `Invalid URL: ${error.url}`
    case 'Timeout':
      return 'Request timed out'
    case 'NetworkError':
      return 'Network error - check your connection'
    case 'BadStatus':
      return `Server error: ${error.status}`
    case 'BadBody':
      return 'Failed to parse response'
  }
}

// -------------------------------------------------------------------------------------
// View Props (framework-agnostic)
// -------------------------------------------------------------------------------------

export const viewProps = (model: Model) => (dispatch: (msg: Msg) => void) => ({
  users: model.users,
  loading: model.loading,
  error: model.error ? renderError(model.error) : null,
  newUserName: model.newUserName,
  onFetchUsers: () => dispatch({ type: 'FetchUsers' }),
  onSetNewUserName: (name: string) => dispatch({ type: 'SetNewUserName', name }),
  onCreateUser: () => dispatch({ type: 'CreateUser' }),
  onDeleteUser: (id: number) => dispatch({ type: 'DeleteUser', id }),
  onClearError: () => dispatch({ type: 'ClearError' })
})
