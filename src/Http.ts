/**
 * Http module provides HTTP request functionality for tea-effect programs.
 *
 * Inspired by [Elm's Http module](https://package.elm-lang.org/packages/elm/http/latest/Http)
 * and [gcanti's elm-ts](https://github.com/gcanti/elm-ts).
 *
 * Uses `@effect/platform` for HTTP and `Schema` for encoding/decoding.
 *
 * @example
 * ```ts
 * import { Http } from 'tea-effect'
 * import { Schema } from 'effect'
 *
 * const User = Schema.Struct({
 *   id: Schema.Number,
 *   name: Schema.String
 * })
 *
 * // Create a request
 * const fetchUsers = Http.get('/api/users', Http.expectJson(Schema.Array(User)))
 *
 * // Convert to Cmd
 * const cmd = Http.send(fetchUsers, {
 *   onSuccess: (users) => ({ type: 'UsersLoaded', users }),
 *   onError: (err) => ({ type: 'UsersFailed', err })
 * })
 * ```
 *
 * @since 0.2.0
 */
import { Effect, Schema, Duration, Stream } from 'effect'
import * as HttpClient from '@effect/platform/HttpClient'
import * as HttpClientRequest from '@effect/platform/HttpClientRequest'
import * as HttpClientError from '@effect/platform/HttpClientError'
import { FetchHttpClient } from '@effect/platform'
import type { Cmd } from './Cmd'
import type { Task } from './Task'

/**
 * Dependencies required for HTTP operations.
 * Note: FetchHttpClient is automatically provided by the library.
 *
 * @since 0.2.0
 * @category model
 */
export type HttpRequirements = never

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * HTTP error types similar to Elm's Http.Error
 *
 * @since 0.2.0
 * @category model
 */
export type HttpError =
  | { readonly _tag: 'BadUrl'; readonly url: string }
  | { readonly _tag: 'Timeout' }
  | { readonly _tag: 'NetworkError'; readonly error: unknown }
  | { readonly _tag: 'BadStatus'; readonly status: number; readonly body: string }
  | { readonly _tag: 'BadBody'; readonly error: unknown }

/**
 * HTTP method type
 *
 * @since 0.2.0
 * @category model
 */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/**
 * HTTP header
 *
 * @since 0.2.0
 * @category model
 */
export interface Header {
  readonly name: string
  readonly value: string
}

/**
 * Expectation for the response body.
 * Contains a Schema decoder for the expected response type.
 *
 * @since 0.2.0
 * @category model
 */
export interface Expect<A> {
  readonly _tag: 'ExpectJson'
  readonly decoder: Schema.Schema<A>
}

/**
 * Request body with optional Schema encoder for runtime validation.
 *
 * @since 0.2.0
 * @category model
 */
export type Body =
  | { readonly _tag: 'EmptyBody' }
  | { readonly _tag: 'JsonBody'; readonly value: unknown; readonly encoder: Schema.Schema<unknown, unknown> | undefined }

/**
 * HTTP Request descriptor.
 * Describes what to fetch, not how to handle the result.
 *
 * @since 0.2.0
 * @category model
 */
export interface Request<A> {
  readonly method: Method
  readonly url: string
  readonly headers: ReadonlyArray<Header>
  readonly body: Body
  readonly expect: Expect<A>
  readonly timeout: number | undefined
  readonly withCredentials: boolean
}

// -------------------------------------------------------------------------------------
// error constructors
// -------------------------------------------------------------------------------------

/**
 * Creates a BadUrl error
 *
 * @since 0.2.0
 * @category errors
 */
export const badUrl = (url: string): HttpError => ({ _tag: 'BadUrl', url })

/**
 * Creates a Timeout error
 *
 * @since 0.2.0
 * @category errors
 */
export const timeout: HttpError = { _tag: 'Timeout' }

/**
 * Creates a NetworkError
 *
 * @since 0.2.0
 * @category errors
 */
export const networkError = (error: unknown): HttpError => ({ _tag: 'NetworkError', error })

/**
 * Creates a BadStatus error
 *
 * @since 0.2.0
 * @category errors
 */
export const badStatus = (status: number, body: string): HttpError => ({ _tag: 'BadStatus', status, body })

/**
 * Creates a BadBody error
 *
 * @since 0.2.0
 * @category errors
 */
export const badBody = (error: unknown): HttpError => ({ _tag: 'BadBody', error })

// -------------------------------------------------------------------------------------
// expectations
// -------------------------------------------------------------------------------------

/**
 * Expect a JSON response decoded with the given Schema.
 *
 * @example
 * ```ts
 * const User = Schema.Struct({ id: Schema.Number, name: Schema.String })
 * const expect = Http.expectJson(User)
 * ```
 *
 * @since 0.2.0
 * @category expectations
 */
export const expectJson = <A>(decoder: Schema.Schema<A>): Expect<A> => ({
  _tag: 'ExpectJson',
  decoder
})

/**
 * Expect a string response.
 *
 * @since 0.2.0
 * @category expectations
 */
export const expectString: Expect<string> = expectJson(Schema.String)

/**
 * Expect any JSON value (no validation).
 *
 * @since 0.2.0
 * @category expectations
 */
export const expectWhatever: Expect<unknown> = expectJson(Schema.Unknown)

// -------------------------------------------------------------------------------------
// body constructors
// -------------------------------------------------------------------------------------

/**
 * Empty body for requests that don't send data.
 *
 * @since 0.2.0
 * @category body
 */
export const emptyBody: Body = {
  _tag: 'EmptyBody'
}

/**
 * JSON body with Schema encoder for runtime validation.
 * The value is encoded/validated before sending.
 *
 * @example
 * ```ts
 * const CreateUser = Schema.Struct({ name: Schema.String, email: Schema.String })
 * const body = Http.jsonBody(CreateUser, { name: 'John', email: 'john@example.com' })
 * ```
 *
 * @since 0.2.0
 * @category body
 */
export const jsonBody = <A, I>(
  schema: Schema.Schema<A, I>,
  value: A
): Body => ({
  _tag: 'JsonBody',
  value,
  encoder: schema as Schema.Schema<unknown, unknown>
})

/**
 * Raw JSON body without Schema validation.
 * Use this when you don't need runtime validation.
 *
 * @example
 * ```ts
 * const body = Http.rawBody({ name: 'John' })
 * ```
 *
 * @since 0.2.0
 * @category body
 */
export const rawBody = <A>(value: A): Body => ({
  _tag: 'JsonBody',
  value,
  encoder: undefined
})

// -------------------------------------------------------------------------------------
// request constructors
// -------------------------------------------------------------------------------------

/**
 * Creates a GET request.
 *
 * @example
 * ```ts
 * const fetchUsers = Http.get('/api/users', Http.expectJson(UsersSchema))
 * ```
 *
 * @since 0.2.0
 * @category constructors
 */
export const get = <A>(url: string, expect: Expect<A>): Request<A> => ({
  method: 'GET',
  url,
  headers: [],
  body: emptyBody,
  expect,
  timeout: undefined,
  withCredentials: false
})

/**
 * Creates a POST request with Schema-validated body.
 *
 * @example
 * ```ts
 * const CreateUser = Schema.Struct({ name: Schema.String })
 * const createUser = Http.post('/api/users', Http.jsonBody(CreateUser, { name: 'John' }), Http.expectJson(UserSchema))
 * ```
 *
 * @since 0.2.0
 * @category constructors
 */
export const post = <A>(url: string, body: Body, expect: Expect<A>): Request<A> => ({
  method: 'POST',
  url,
  headers: [],
  body,
  expect,
  timeout: undefined,
  withCredentials: false
})

/**
 * Creates a PUT request with Schema-validated body.
 *
 * @since 0.2.0
 * @category constructors
 */
export const put = <A>(url: string, body: Body, expect: Expect<A>): Request<A> => ({
  method: 'PUT',
  url,
  headers: [],
  body,
  expect,
  timeout: undefined,
  withCredentials: false
})

/**
 * Creates a PATCH request with Schema-validated body.
 *
 * @since 0.2.0
 * @category constructors
 */
export const patch = <A>(url: string, body: Body, expect: Expect<A>): Request<A> => ({
  method: 'PATCH',
  url,
  headers: [],
  body,
  expect,
  timeout: undefined,
  withCredentials: false
})

/**
 * Creates a DELETE request.
 *
 * @since 0.2.0
 * @category constructors
 */
export const del = <A>(url: string, expect: Expect<A>): Request<A> => ({
  method: 'DELETE',
  url,
  headers: [],
  body: emptyBody,
  expect,
  timeout: undefined,
  withCredentials: false
})

/**
 * Creates a custom request with full control.
 *
 * @since 0.2.0
 * @category constructors
 */
export const request = <A>(config: {
  readonly method: Method
  readonly url: string
  readonly headers?: ReadonlyArray<Header>
  readonly body?: Body
  readonly expect: Expect<A>
  readonly timeout?: number
  readonly withCredentials?: boolean
}): Request<A> => ({
  method: config.method,
  url: config.url,
  headers: config.headers ?? [],
  body: config.body ?? emptyBody,
  expect: config.expect,
  timeout: config.timeout,
  withCredentials: config.withCredentials ?? false
})

// -------------------------------------------------------------------------------------
// request modifiers
// -------------------------------------------------------------------------------------

/**
 * Adds a header to the request.
 *
 * @example
 * ```ts
 * const req = pipe(
 *   Http.get('/api/users', Http.expectJson(UsersSchema)),
 *   Http.withHeader('Authorization', 'Bearer token')
 * )
 * ```
 *
 * @since 0.2.0
 * @category modifiers
 */
export const withHeader = (name: string, value: string) =>
  <A>(req: Request<A>): Request<A> => ({
    ...req,
    headers: [...req.headers, { name, value }]
  })

/**
 * Adds multiple headers to the request.
 *
 * @since 0.2.0
 * @category modifiers
 */
export const withHeaders = (headers: ReadonlyArray<Header>) =>
  <A>(req: Request<A>): Request<A> => ({
    ...req,
    headers: [...req.headers, ...headers]
  })

/**
 * Sets a timeout for the request.
 *
 * @since 0.2.0
 * @category modifiers
 */
export const withTimeout = (ms: number) =>
  <A>(req: Request<A>): Request<A> => ({
    ...req,
    timeout: ms
  })

/**
 * Enables credentials (cookies) for cross-origin requests.
 *
 * @since 0.2.0
 * @category modifiers
 */
export const withCredentials = <A>(req: Request<A>): Request<A> => ({
  ...req,
  withCredentials: true
})

// -------------------------------------------------------------------------------------
// header helpers
// -------------------------------------------------------------------------------------

/**
 * Creates a header.
 *
 * @since 0.2.0
 * @category headers
 */
export const header = (name: string, value: string): Header => ({ name, value })

/**
 * Creates a Content-Type header.
 *
 * @since 0.2.0
 * @category headers
 */
export const contentType = (value: string): Header => header('Content-Type', value)

/**
 * Creates an Authorization header.
 *
 * @since 0.2.0
 * @category headers
 */
export const authorization = (value: string): Header => header('Authorization', value)

/**
 * Creates a Bearer token Authorization header.
 *
 * @since 0.2.0
 * @category headers
 */
export const bearerToken = (token: string): Header => authorization(`Bearer ${token}`)

// -------------------------------------------------------------------------------------
// internal helpers
// -------------------------------------------------------------------------------------

const mapHttpClientError = (error: HttpClientError.HttpClientError): HttpError => {
  if (error._tag === 'RequestError') {
    return networkError(error.cause)
  }
  if (error._tag === 'ResponseError') {
    if (error.reason === 'Decode') {
      return badBody(error.cause)
    }
    if (error.reason === 'StatusCode') {
      return badStatus(error.response.status, '')
    }
    return networkError(error.cause)
  }
  return networkError(error)
}

// -------------------------------------------------------------------------------------
// execution
// -------------------------------------------------------------------------------------

/**
 * Converts a Request to a Task (Effect) that requires HttpClient.
 * Use this for testing with mock HttpClient layers.
 *
 * @example
 * ```ts
 * // For testing with mock client
 * const task = Http.toTaskRaw(Http.get('/api/users', Http.expectJson(UsersSchema)))
 * // task: Task<Users[], HttpError, HttpClient.HttpClient>
 *
 * // Provide mock layer in tests
 * task.pipe(Effect.provide(MockHttpClient))
 * ```
 *
 * @since 0.2.0
 * @category execution
 */
export const toTaskRaw = <A>(req: Request<A>): Task<A, HttpError, HttpClient.HttpClient> => {
  const execute = Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient

    // Build request based on method
    const methodFn = {
      GET: HttpClientRequest.get,
      POST: HttpClientRequest.post,
      PUT: HttpClientRequest.put,
      PATCH: HttpClientRequest.patch,
      DELETE: HttpClientRequest.del,
      HEAD: HttpClientRequest.head,
      OPTIONS: HttpClientRequest.options
    }[req.method]

    let httpReq = methodFn(req.url)

    // Add headers
    for (const h of req.headers) {
      httpReq = HttpClientRequest.setHeader(httpReq, h.name, h.value)
    }

    // Add body for methods that support it
    if (req.body._tag === 'JsonBody' && req.method !== 'GET' && req.method !== 'HEAD') {
      // Encode body if encoder is provided
      const bodyValue = req.body.encoder
        ? yield* Schema.encode(req.body.encoder)(req.body.value)
        : req.body.value
      httpReq = yield* HttpClientRequest.bodyJson(httpReq, bodyValue)
    }

    // Execute request
    const response = yield* client.execute(httpReq)

    // Check status
    if (response.status >= 400) {
      const body = yield* response.text
      return yield* Effect.fail(badStatus(response.status, body))
    }

    // Decode response
    const json = yield* response.json
    const decoded = yield* Schema.decodeUnknown(req.expect.decoder)(json)

    return decoded
  })

  // Apply timeout if specified
  const withTimeout = req.timeout !== undefined
    ? execute.pipe(
        Effect.timeoutFail({
          duration: Duration.millis(req.timeout),
          onTimeout: () => timeout
        })
      )
    : execute

  return withTimeout.pipe(
    Effect.catchAll((error) => {
      // Handle our own HttpError
      if (typeof error === 'object' && error !== null && '_tag' in error) {
        const err = error as { _tag: string }
        if (err._tag === 'BadStatus' || err._tag === 'BadBody' ||
            err._tag === 'BadUrl' || err._tag === 'Timeout' || err._tag === 'NetworkError') {
          return Effect.fail(error as HttpError)
        }
        // Map Effect Platform errors
        if (err._tag === 'RequestError' || err._tag === 'ResponseError') {
          return Effect.fail(mapHttpClientError(error as HttpClientError.HttpClientError))
        }
      }
      return Effect.fail(badBody(error))
    }),
    Effect.scoped
  )
}

/**
 * Converts a Request to a Task (Effect) that can fail with HttpError.
 * FetchHttpClient is automatically provided - no manual configuration needed.
 *
 * For testing with mock clients, use `toTaskRaw` instead.
 *
 * @example
 * ```ts
 * const task = Http.toTask(Http.get('/api/users', Http.expectJson(UsersSchema)))
 * // task: Task<Users[], HttpError>
 * ```
 *
 * @since 0.2.0
 * @category execution
 */
export const toTask = <A>(req: Request<A>): Task<A, HttpError, HttpRequirements> =>
  toTaskRaw(req).pipe(Effect.provide(FetchHttpClient.layer))

/**
 * Sends an HTTP request and converts it to a Cmd that requires HttpClient.
 * Use this for testing with mock HttpClient layers.
 *
 * @example
 * ```ts
 * // For testing
 * const cmd = Http.sendRaw(fetchUsers, {
 *   onSuccess: (users) => ({ type: 'UsersLoaded', users }),
 *   onError: (err) => ({ type: 'UsersFailed', err })
 * })
 * // cmd: Cmd<Msg, never, HttpClient.HttpClient>
 * ```
 *
 * @since 0.2.0
 * @category execution
 */
export const sendRaw = <A, Msg>(
  req: Request<A>,
  handlers: {
    readonly onSuccess: (a: A) => Msg
    readonly onError: (error: HttpError) => Msg
  }
): Cmd<Msg, never, HttpClient.HttpClient> =>
  Stream.fromEffect(
    Effect.match(toTaskRaw(req), {
      onSuccess: (a) => handlers.onSuccess(a),
      onFailure: (error) => handlers.onError(error)
    })
  )

/**
 * Sends an HTTP request and converts it to a Cmd.
 * FetchHttpClient is automatically provided.
 *
 * For testing with mock clients, use `sendRaw` instead.
 *
 * @example
 * ```ts
 * const fetchUsers = Http.get('/api/users', Http.expectJson(UsersSchema))
 *
 * const cmd = Http.send(fetchUsers, {
 *   onSuccess: (users) => ({ type: 'UsersLoaded', users }),
 *   onError: (err) => ({ type: 'UsersFailed', err })
 * })
 * ```
 *
 * @since 0.2.0
 * @category execution
 */
export const send = <A, Msg>(
  req: Request<A>,
  handlers: {
    readonly onSuccess: (a: A) => Msg
    readonly onError: (error: HttpError) => Msg
  }
): Cmd<Msg, never, HttpRequirements> =>
  Stream.fromEffect(
    Effect.match(toTask(req), {
      onSuccess: (a) => handlers.onSuccess(a),
      onFailure: (error) => handlers.onError(error)
    })
  )

/**
 * Sends an HTTP request with separate success and error handler functions.
 * Alternative API for send.
 *
 * @example
 * ```ts
 * const cmd = Http.sendBy(
 *   (users) => ({ type: 'UsersLoaded', users }),
 *   (err) => ({ type: 'UsersFailed', err })
 * )(Http.get('/api/users', Http.expectJson(UsersSchema)))
 * ```
 *
 * @since 0.2.0
 * @category execution
 */
export const sendBy = <A, Msg>(
  onSuccess: (a: A) => Msg,
  onError: (error: HttpError) => Msg
) =>
  (req: Request<A>): Cmd<Msg, never, HttpRequirements> =>
    send(req, { onSuccess, onError })