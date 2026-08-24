import { Schema, pipe } from 'effect'
import * as Http from 'tea-effect/Http'

// #region schema
// A JSONPlaceholder user carries more than this - address, phone, company.
// Schema.Struct ignores fields you do not list, so the model stays as small as
// the application actually needs.
export const User = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  username: Schema.String,
  email: Schema.String
})

export type User = Schema.Schema.Type<typeof User>

export const NewUser = Schema.Struct({
  name: Schema.String,
  username: Schema.String,
  email: Schema.String
})

export type NewUser = Schema.Schema.Type<typeof NewUser>
// #endregion schema

// #region requests
// JSONPlaceholder is a free public test API. These requests run as they are -
// nothing below is a stand-in for a real endpoint.
const BASE_URL = 'https://jsonplaceholder.typicode.com'

// A request is a value. Building one sends nothing.
export const listUsers = pipe(
  Http.get(`${BASE_URL}/users`, Http.expectJson(Schema.Array(User))),
  Http.withTimeout(5000)
)

// JSONPlaceholder replies with the object you sent plus an id, but does not
// store it: the next listUsers still returns the original ten users.
export const createUser = (user: NewUser) =>
  Http.post(`${BASE_URL}/users`, Http.jsonBody(NewUser, user), Http.expectJson(User))
// #endregion requests

// #region headers
// JSONPlaceholder needs no authentication. This is the shape for an API that does.
// Modifiers are ordinary Request -> Request functions, so a combination you use
// everywhere can be named once and then piped in like any other modifier.
export const authorized = (token: string) => Http.withHeaders([Http.bearerToken(token)])

export const createUserAs = (token: string, user: NewUser) =>
  pipe(createUser(user), authorized(token))
// #endregion headers
