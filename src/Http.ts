/**
 * Http module provides HTTP request functionality for tea-effect programs.
 *
 * Inspired by [Elm's Http module](https://package.elm-lang.org/packages/elm/http/latest/Http)
 * and [gcanti's elm-ts](https://github.com/gcanti/elm-ts).
 *
 * Uses `effect/http` for HTTP and `Schema` for encoding/decoding.
 *
 * @example
 * ```ts
 * import { Schema } from 'effect'
 * import * as Http from 'tea-effect/Http'
 *
 * const User = Schema.Struct({
 *   id: Schema.Number,
 *   name: Schema.String
 * })
 * type User = Schema.Schema.Type<typeof User>
 *
 * type Msg =
 *   | { readonly type: 'UsersLoaded'; readonly users: ReadonlyArray<User> }
 *   | { readonly type: 'UsersFailed'; readonly error: Http.HttpError }
 *
 * // A request is a value - nothing is sent yet.
 * const fetchUsers = Http.get('/api/users', Http.expectJson(Schema.Array(User)))
 *
 * // Both outcomes become messages, so this Cmd cannot fail: its `E` is `never`.
 * const cmd = Http.send(fetchUsers, {
 *   onSuccess: (users): Msg => ({ type: 'UsersLoaded', users }),
 *   onError: (error): Msg => ({ type: 'UsersFailed', error })
 * })
 * ```
 *
 * @since 0.2.0
 */
import { Context, Effect, Option, Schema, Duration, Stream, pipe } from 'effect'
import { FetchHttpClient, HttpBody, HttpClient, HttpClientError, HttpClientRequest } from 'effect/http'
import type { HttpClientResponse } from 'effect/http'
import type { Cmd } from './Cmd'
import type { Task } from './Task'

/**
 * Dependencies required for HTTP operations.
 * Note: FetchHttpClient is automatically provided by the library.
 *
 * @since 0.2.0
 * @category Model
 */
export type HttpRequirements = never

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * HTTP error types similar to Elm's Http.Error
 *
 * @since 0.2.0
 * @category Model
 */
export type HttpError =
  | { readonly _tag: 'BadUrl'; readonly url: string }
  | { readonly _tag: 'Timeout' }
  | { readonly _tag: 'NetworkError'; readonly error: unknown }
  | { readonly _tag: 'BadStatus'; readonly status: number; readonly body: string }
  | { readonly _tag: 'BadBody'; readonly error: unknown }
  | { readonly _tag: 'BadRequestBody'; readonly error: unknown }

/**
 * HTTP method type
 *
 * @since 0.2.0
 * @category Model
 */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/**
 * HTTP header
 *
 * @since 0.2.0
 * @category Model
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
 * @category Model
 */
export type Expect<A> =
  | { readonly _tag: 'ExpectJson'; readonly decoder: Schema.Decoder<A> }
  | { readonly _tag: 'ExpectString'; readonly decoder: Schema.Decoder<A> }
  | { readonly _tag: 'ExpectFile'; readonly decoder: Schema.Decoder<A> }

/**
 * Request body with optional Schema encoder for runtime validation.
 *
 * @since 0.2.0
 * @category Model
 */
export type Body =
  | { readonly _tag: 'EmptyBody' }
  | { readonly _tag: 'JsonBody'; readonly value: unknown; readonly encoder: Schema.Encoder<unknown> | undefined }
  | { readonly _tag: 'StringBody'; readonly mime: string; readonly value: string }
  | { readonly _tag: 'BytesBody'; readonly mime: string; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly _tag: 'FileBody'; readonly file: Blob }
  | { readonly _tag: 'MultipartBody'; readonly parts: ReadonlyArray<Part> }

/**
 * One field of a multipart body.
 *
 * @since 0.10.0
 * @category Model
 */
export type Part =
  | { readonly _tag: 'StringPart'; readonly name: string; readonly value: string }
  | { readonly _tag: 'FilePart'; readonly name: string; readonly file: Blob }
  | { readonly _tag: 'BytesPart'; readonly name: string; readonly mime: string; readonly bytes: Uint8Array<ArrayBuffer> }

/**
 * HTTP Request descriptor.
 * Describes what to fetch, not how to handle the result.
 *
 * @since 0.2.0
 * @category Model
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
 * @category Errors
 */
export const badUrl = (url: string): HttpError => ({ _tag: 'BadUrl', url })

/**
 * Creates a Timeout error
 *
 * @since 0.2.0
 * @category Errors
 */
export const timeout: HttpError = { _tag: 'Timeout' }

/**
 * Creates a NetworkError
 *
 * @since 0.2.0
 * @category Errors
 */
export const networkError = (error: unknown): HttpError => ({ _tag: 'NetworkError', error })

/**
 * Creates a BadStatus error
 *
 * @since 0.2.0
 * @category Errors
 */
export const badStatus = (status: number, body: string): HttpError => ({ _tag: 'BadStatus', status, body })

/**
 * Creates a BadBody error
 *
 * @since 0.2.0
 * @category Errors
 */
export const badBody = (error: unknown): HttpError => ({ _tag: 'BadBody', error })

/**
 * Creates a BadRequestBody error (request payload failed to encode; no request
 * was sent). Distinct from BadBody, which is a response-decoding failure.
 *
 * @since 0.2.0
 * @category Errors
 */
export const badRequestBody = (error: unknown): HttpError => ({ _tag: 'BadRequestBody', error })

// -------------------------------------------------------------------------------------
// expectations
// -------------------------------------------------------------------------------------

/**
 * Expect a JSON response decoded with the given Schema.
 *
 * @example
 * ```ts
 * import { Schema } from 'effect'
 * import * as Http from 'tea-effect/Http'
 *
 * const User = Schema.Struct({ id: Schema.Number, name: Schema.String })
 *
 * const expectUser = Http.expectJson(User)
 * ```
 *
 * @since 0.2.0
 * @category Expectations
 */
export const expectJson = <A>(decoder: Schema.Decoder<A>): Expect<A> => ({
  _tag: 'ExpectJson',
  decoder
})

/**
 * Expect a string response.
 *
 * @since 0.2.0
 * @category Expectations
 */
export const expectString: Expect<string> = {
  _tag: 'ExpectString',
  decoder: Schema.String
}

/**
 * Expect any JSON value (no validation).
 *
 * @since 0.2.0
 * @category Expectations
 */
export const expectWhatever: Expect<unknown> = expectJson(Schema.Unknown)

const isFile = (u: unknown): u is File => typeof File !== 'undefined' && u instanceof File

/**
 * Expect a file: the response body as bytes, wrapped in a `File`.
 *
 * The name comes from `Content-Disposition` - `filename*` first, so a UTF-8 name
 * such as `izveštaj.pdf` survives, then `filename` - and, when the header is
 * missing, from the last segment of the URL. The type is the response's
 * `Content-Type`.
 *
 * Errors do not change: a status outside 2xx is still `BadStatus` with the body
 * as text, so a server can answer a failed export with its usual JSON errors.
 *
 * Hand the request to `File.Download.send` to save the file without it passing
 * through a message.
 *
 * @example
 * ```ts
 * import * as Http from 'tea-effect/Http'
 *
 * const report = Http.get('/api/reports/42', Http.expectFile)
 * // report: Http.Request<File>
 * ```
 *
 * @since 0.10.0
 * @category Expectations
 */
export const expectFile: Expect<File> = {
  _tag: 'ExpectFile',
  decoder: Schema.declare(isFile)
}

// -------------------------------------------------------------------------------------
// body constructors
// -------------------------------------------------------------------------------------

/**
 * Empty body for requests that don't send data.
 *
 * @since 0.2.0
 * @category Body
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
 * import { Schema } from 'effect'
 * import * as Http from 'tea-effect/Http'
 *
 * const CreateUser = Schema.Struct({ name: Schema.String, email: Schema.String })
 *
 * const body = Http.jsonBody(CreateUser, { name: 'John', email: 'john@example.com' })
 * ```
 *
 * @since 0.2.0
 * @category Body
 */
export const jsonBody = <A, I>(
  schema: Schema.Codec<A, I>,
  value: A
): Body => ({
  _tag: 'JsonBody',
  value,
  encoder: schema
})

/**
 * Raw JSON body without Schema validation.
 * Use this when you don't need runtime validation.
 *
 * @example
 * ```ts
 * import * as Http from 'tea-effect/Http'
 *
 * // No schema: the value is serialised as-is, with no encoding step.
 * const body = Http.rawBody({ name: 'John' })
 * ```
 *
 * @since 0.2.0
 * @category Body
 */
export const rawBody = <A>(value: A): Body => ({
  _tag: 'JsonBody',
  value,
  encoder: undefined
})

/**
 * Text with the given MIME type as the body - CSV, XML or plain text, say.
 *
 * @example
 * ```ts
 * import * as Http from 'tea-effect/Http'
 *
 * const body = Http.stringBody('text/csv', 'id,name\n1,Ana\n')
 * ```
 *
 * @since 0.10.0
 * @category Body
 */
export const stringBody = (mime: string, value: string): Body => ({ _tag: 'StringBody', mime, value })

/**
 * Bytes with the given MIME type as the body.
 *
 * @example
 * ```ts
 * import * as Http from 'tea-effect/Http'
 *
 * const body = (pdf: Uint8Array<ArrayBuffer>) => Http.bytesBody('application/pdf', pdf)
 * ```
 *
 * @since 0.10.0
 * @category Body
 */
export const bytesBody = (mime: string, bytes: Uint8Array<ArrayBuffer>): Body => ({ _tag: 'BytesBody', mime, bytes })

/**
 * A file as the whole body - an upload the server reads as it is.
 *
 * `Content-Type` is the file's type, or `application/octet-stream` when the
 * browser does not know it. The browser sends the file from disk, so it is
 * never read into memory first.
 *
 * @example
 * ```ts
 * import { Schema } from 'effect'
 * import * as Http from 'tea-effect/Http'
 *
 * const Report = Schema.Struct({ imported: Schema.Number })
 *
 * const importCsv = (csv: File) => Http.post('/api/devices/import', Http.fileBody(csv), Http.expectJson(Report))
 * ```
 *
 * @since 0.10.0
 * @category Body
 */
export const fileBody = (file: Blob): Body => ({ _tag: 'FileBody', file })

/**
 * A `multipart/form-data` body: files and fields in one request, the way an
 * HTML form sends them.
 *
 * The browser sets `Content-Type` itself, because it has to carry the boundary
 * between the parts; a `Content-Type` header set on the request is dropped.
 *
 * @example
 * ```ts
 * import * as Http from 'tea-effect/Http'
 *
 * const attach = (contract: File) =>
 *   Http.post(
 *     '/api/devices/7/attachments',
 *     Http.multipartBody([Http.stringPart('description', 'Contract'), Http.filePart('file', contract)]),
 *     Http.expectWhatever
 *   )
 * ```
 *
 * @since 0.10.0
 * @category Body
 */
export const multipartBody = (parts: ReadonlyArray<Part>): Body => ({ _tag: 'MultipartBody', parts })

/**
 * A text field of a multipart body.
 *
 * @since 0.10.0
 * @category Body
 */
export const stringPart = (name: string, value: string): Part => ({ _tag: 'StringPart', name, value })

/**
 * A file field of a multipart body, sent under the file's own name.
 *
 * @since 0.10.0
 * @category Body
 */
export const filePart = (name: string, file: Blob): Part => ({ _tag: 'FilePart', name, file })

/**
 * Bytes with the given MIME type as a field of a multipart body.
 *
 * @since 0.10.0
 * @category Body
 */
export const bytesPart = (name: string, mime: string, bytes: Uint8Array<ArrayBuffer>): Part => ({
  _tag: 'BytesPart',
  name,
  mime,
  bytes
})

// -------------------------------------------------------------------------------------
// request constructors
// -------------------------------------------------------------------------------------

/**
 * Creates a GET request.
 *
 * @example
 * ```ts
 * import { Schema } from 'effect'
 * import * as Http from 'tea-effect/Http'
 *
 * const User = Schema.Struct({ id: Schema.Number, name: Schema.String })
 *
 * const fetchUsers = Http.get('/api/users', Http.expectJson(Schema.Array(User)))
 * ```
 *
 * @since 0.2.0
 * @category Constructors
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
 * import { Schema } from 'effect'
 * import * as Http from 'tea-effect/Http'
 *
 * const User = Schema.Struct({ id: Schema.Number, name: Schema.String })
 * const CreateUser = Schema.Struct({ name: Schema.String })
 *
 * const createUser = Http.post(
 *   '/api/users',
 *   Http.jsonBody(CreateUser, { name: 'John' }),
 *   Http.expectJson(User)
 * )
 * ```
 *
 * @since 0.2.0
 * @category Constructors
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
 * @category Constructors
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
 * @category Constructors
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
 * @category Constructors
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
 * @category Constructors
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
 * Use this for headers this module has no helper for; `Authorization` and
 * `Content-Type` have `bearerToken` / `authorization` and `contentType`.
 *
 * @example
 * ```ts
 * import { Schema, pipe } from 'effect'
 * import * as Http from 'tea-effect/Http'
 *
 * const User = Schema.Struct({ id: Schema.Number, name: Schema.String })
 *
 * // A function, so the key comes from your configuration rather than a literal.
 * const usersRequest = (apiKey: string) =>
 *   pipe(
 *     Http.get('/api/users', Http.expectJson(Schema.Array(User))),
 *     Http.withHeader('X-Api-Key', apiKey)
 *   )
 * ```
 *
 * @since 0.2.0
 * @category Modifiers
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
 * @category Modifiers
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
 * @category Modifiers
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
 * @category Modifiers
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
 * @category Headers
 */
export const header = (name: string, value: string): Header => ({ name, value })

/**
 * Creates a Content-Type header.
 *
 * @since 0.2.0
 * @category Headers
 */
export const contentType = (value: string): Header => header('Content-Type', value)

/**
 * Creates an Authorization header.
 *
 * @since 0.2.0
 * @category Headers
 */
export const authorization = (value: string): Header => header('Authorization', value)

/**
 * Creates a Bearer token Authorization header.
 *
 * @since 0.2.0
 * @category Headers
 */
export const bearerToken = (token: string): Header => authorization(`Bearer ${token}`)

// -------------------------------------------------------------------------------------
// internal helpers
// -------------------------------------------------------------------------------------

const mapHttpClientError = (error: HttpClientError.HttpClientError): HttpError => {
  // A mock client may fail with something else entirely: an HttpError passes through,
  // anything else is a NetworkError.
  const err: unknown = error
  if (typeof err === 'object' && err !== null && '_tag' in err) {
    const tag = (err as { _tag: string })._tag
    if (tag === 'BadStatus' || tag === 'BadBody' || tag === 'BadRequestBody' ||
        tag === 'BadUrl' || tag === 'Timeout' || tag === 'NetworkError') {
      return err as HttpError
    }
  }
  if (!HttpClientError.isHttpClientError(error)) {
    return networkError(error)
  }
  const reason = error.reason
  switch (reason._tag) {
    case 'InvalidUrlError':
      return badUrl(reason.request.url)
    case 'DecodeError':
      return badBody(reason.cause)
    case 'StatusCodeError':
      return badStatus(reason.response.status, '')
    case 'TransportError':
    case 'EncodeError':
    case 'EmptyBodyError':
      return networkError(reason.cause)
  }
}

const EXTENDED_NAME = /(?:^|;)\s*filename\*\s*=\s*([^;]+)/i
const QUOTED_NAME = /(?:^|;)\s*filename\s*=\s*"((?:[^"\\]|\\.)*)"/i
const TOKEN_NAME = /(?:^|;)\s*filename\s*=\s*([^";]+)/i
const DEFAULT_NAME = 'download'

const decodeUri = Option.liftThrowable(decodeURIComponent)

const decodeUtf8 = Option.liftThrowable((bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes))

const isNonEmpty = (text: string): boolean => text !== ''

const capture = (pattern: RegExp, text: string): Option.Option<string> => Option.fromNullishOr(pattern.exec(text)?.[1])

const baseName = (name: string): string => name.split(/[\\/]/).pop()?.trim() ?? ''

// `filename*=UTF-8''izve%C5%A1taj.pdf` (RFC 8187). Some servers quote it, which
// the RFC does not allow; the quotes are dropped rather than rejecting the name.
const fromExtended = (value: string): Option.Option<string> => {
  const [charset = '', , encoded, ...rest] = value.trim().replace(/^"|"$/g, '').split("'")
  if (encoded === undefined || rest.length > 0) return Option.none()
  if (/^utf-8$/i.test(charset)) return decodeUri(encoded)
  if (/^iso-8859-1$/i.test(charset)) {
    return Option.some(encoded.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))))
  }
  return Option.none()
}

// Fetch hands header values over byte for byte, so a server that writes a raw
// UTF-8 name into `filename` arrives as Latin-1 mojibake. Decode it back when it
// is valid UTF-8; a genuine Latin-1 name is not, and stays as it is.
const fromHeaderBytes = (value: string): string =>
  /[\u0080-ÿ]/.test(value) && !/[^\u0000-ÿ]/.test(value)
    ? Option.getOrElse(decodeUtf8(Uint8Array.from(value, (char) => char.charCodeAt(0))), () => value)
    : value

const fromPlain = (header: string): Option.Option<string> =>
  pipe(
    capture(QUOTED_NAME, header),
    Option.map((name) => name.replace(/\\(.)/g, '$1')),
    Option.orElse(() => pipe(capture(TOKEN_NAME, header), Option.map((name) => name.trim()))),
    Option.filter(isNonEmpty),
    Option.map(fromHeaderBytes)
  )

const fromDisposition = (header: string): Option.Option<string> =>
  pipe(
    capture(EXTENDED_NAME, header),
    Option.flatMap(fromExtended),
    Option.filter(isNonEmpty),
    Option.orElse(() => fromPlain(header))
  )

const fromUrl = (url: string): Option.Option<string> =>
  pipe(
    Option.fromNullishOr((url.split(/[?#]/)[0] ?? '').split('/').filter(isNonEmpty).pop()),
    Option.map((segment) => Option.getOrElse(decodeUri(segment), () => segment))
  )

const fileName = (disposition: string | undefined, url: string): string =>
  pipe(
    Option.fromNullishOr(disposition),
    Option.flatMap(fromDisposition),
    Option.orElse(() => fromUrl(url)),
    Option.map(baseName),
    Option.filter(isNonEmpty),
    Option.getOrElse(() => DEFAULT_NAME)
  )

const toFile = (bytes: ArrayBuffer, headers: Readonly<Record<string, string | undefined>>, url: string): File =>
  new File([bytes], fileName(headers['content-disposition'], url), { type: headers['content-type'] ?? '' })

const toFormData = (parts: ReadonlyArray<Part>): FormData => {
  const form = new FormData()
  for (const part of parts) {
    switch (part._tag) {
      case 'StringPart':
        form.append(part.name, part.value)
        break
      case 'FilePart':
        form.append(part.name, part.file)
        break
      case 'BytesPart':
        form.append(part.name, new Blob([part.bytes], { type: part.mime }))
        break
    }
  }
  return form
}

// Encoding/serialization failures are request-side (no request is sent), so they
// map to BadRequestBody rather than the response-side BadBody.
const toHttpBody = (body: Exclude<Body, { readonly _tag: 'EmptyBody' }>): Effect.Effect<HttpBody.HttpBody, HttpError> => {
  switch (body._tag) {
    case 'JsonBody':
      return pipe(
        body.encoder === undefined ? Effect.succeed(body.value) : Schema.encodeUnknownEffect(body.encoder)(body.value),
        Effect.flatMap((value) => HttpBody.json(value)),
        Effect.mapError(badRequestBody)
      )
    case 'StringBody':
      return Effect.succeed(HttpBody.text(body.value, body.mime))
    case 'BytesBody':
      return Effect.succeed(HttpBody.uint8Array(body.bytes, body.mime))
    case 'FileBody':
      return Effect.succeed(
        HttpBody.raw(body.file, { contentType: body.file.type || 'application/octet-stream', contentLength: body.file.size })
      )
    case 'MultipartBody':
      return Effect.sync(() => HttpBody.formData(toFormData(body.parts)))
  }
}

const readBody = <A>(
  expect: Expect<A>,
  response: HttpClientResponse.HttpClientResponse,
  url: string
): Effect.Effect<unknown, HttpError> => {
  switch (expect._tag) {
    case 'ExpectJson':
      return response.json.pipe(Effect.mapError(mapHttpClientError))
    case 'ExpectString':
      return response.text.pipe(Effect.mapError(mapHttpClientError))
    case 'ExpectFile':
      return response.arrayBuffer.pipe(
        Effect.map((bytes) => toFile(bytes, response.headers, url)),
        Effect.mapError(mapHttpClientError)
      )
  }
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
 * import { Effect, Layer, Schema } from 'effect'
 * import { HttpClient } from 'effect/http'
 * import * as Http from 'tea-effect/Http'
 *
 * const User = Schema.Struct({ id: Schema.Number, name: Schema.String })
 *
 * const task = Http.toTaskRaw(Http.get('/api/users', Http.expectJson(Schema.Array(User))))
 * // task: Task<ReadonlyArray<User>, HttpError, HttpClient.HttpClient>
 *
 * // HttpClient is left in `R`, so a test supplies its own layer - one that
 * // answers with canned responses instead of reaching the network.
 * const underTest = (testClient: Layer.Layer<HttpClient.HttpClient>) =>
 *   task.pipe(Effect.provide(testClient))
 * ```
 *
 * @since 0.2.0
 * @category Execution
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
      DELETE: HttpClientRequest.delete,
      HEAD: HttpClientRequest.head,
      OPTIONS: HttpClientRequest.options
    }[req.method]

    let httpReq = methodFn(req.url)

    // Add headers
    for (const h of req.headers) {
      httpReq = HttpClientRequest.setHeader(httpReq, h.name, h.value)
    }

    // Add the body for methods that support it. The body decides Content-Type,
    // after the headers above, so a multipart body can drop one set by hand.
    if (req.body._tag !== 'EmptyBody' && req.method !== 'GET' && req.method !== 'HEAD') {
      httpReq = HttpClientRequest.setBody(httpReq, yield* toHttpBody(req.body))
    }

    // Execute request
    const response = yield* client.execute(httpReq).pipe(Effect.mapError(mapHttpClientError))

    // Check status: anything outside 2xx is a BadStatus (matches Elm), so a
    // surfaced 304/3xx/1xx doesn't fall through to the decode path.
    if (response.status < 200 || response.status >= 300) {
      const body = yield* response.text.pipe(Effect.mapError(mapHttpClientError))
      return yield* Effect.fail(badStatus(response.status, body))
    }

    // Read the body the way the expectation asks - JSON, raw text or a file - then decode.
    const raw = yield* readBody(req.expect, response, req.url)
    return yield* Schema.decodeUnknownEffect(req.expect.decoder)(raw).pipe(Effect.mapError(badBody))
  })

  // Apply timeout if specified
  const withTimeout = req.timeout !== undefined
    ? execute.pipe(
        Effect.timeoutOrElse({
          duration: Duration.millis(req.timeout),
          orElse: () => Effect.fail(timeout)
        })
      )
    : execute

  // Apply credentials via the fetch client's RequestInit service (the flag is
  // otherwise inert). Mock clients simply ignore it.
  return req.withCredentials
    ? withTimeout.pipe(Effect.provideService(FetchHttpClient.RequestInit, { credentials: 'include' }))
    : withTimeout
}

// FetchHttpClient.Fetch caches globalThis.fetch on first use; look it up per request
// unless the caller provided one.
const withCurrentFetch = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.flatMap(Effect.context<never>(), (context) =>
    Context.getOrUndefined(context, FetchHttpClient.Fetch) === undefined
      ? Effect.provideService(effect, FetchHttpClient.Fetch, globalThis.fetch)
      : effect
  )

/**
 * Converts a Request to a Task (Effect) that can fail with HttpError.
 * FetchHttpClient is automatically provided - no manual configuration needed.
 *
 * For testing with mock clients, use `toTaskRaw` instead.
 *
 * @example
 * ```ts
 * import { Schema } from 'effect'
 * import * as Http from 'tea-effect/Http'
 *
 * const User = Schema.Struct({ id: Schema.Number, name: Schema.String })
 *
 * const task = Http.toTask(Http.get('/api/users', Http.expectJson(Schema.Array(User))))
 * // task: Task<ReadonlyArray<User>, HttpError>
 * // FetchHttpClient is already provided, so nothing is left in `R`.
 * ```
 *
 * @since 0.2.0
 * @category Execution
 */
export const toTask = <A>(req: Request<A>): Task<A, HttpError, HttpRequirements> =>
  toTaskRaw(req).pipe(Effect.provide(FetchHttpClient.layer), withCurrentFetch)

/**
 * Sends an HTTP request and converts it to a Cmd that requires HttpClient.
 * Use this for testing with mock HttpClient layers.
 *
 * @example
 * ```ts
 * import { Schema } from 'effect'
 * import * as Http from 'tea-effect/Http'
 *
 * const User = Schema.Struct({ id: Schema.Number, name: Schema.String })
 * type User = Schema.Schema.Type<typeof User>
 *
 * type Msg =
 *   | { readonly type: 'UsersLoaded'; readonly users: ReadonlyArray<User> }
 *   | { readonly type: 'UsersFailed'; readonly error: Http.HttpError }
 *
 * const fetchUsers = Http.get('/api/users', Http.expectJson(Schema.Array(User)))
 *
 * const cmd = Http.sendRaw(fetchUsers, {
 *   onSuccess: (users): Msg => ({ type: 'UsersLoaded', users }),
 *   onError: (error): Msg => ({ type: 'UsersFailed', error })
 * })
 * // cmd: Cmd<Msg, never, HttpClient.HttpClient>
 * ```
 *
 * @since 0.2.0
 * @category Execution
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
 * import { Schema } from 'effect'
 * import * as Http from 'tea-effect/Http'
 *
 * const User = Schema.Struct({ id: Schema.Number, name: Schema.String })
 * type User = Schema.Schema.Type<typeof User>
 *
 * type Msg =
 *   | { readonly type: 'UsersLoaded'; readonly users: ReadonlyArray<User> }
 *   | { readonly type: 'UsersFailed'; readonly error: Http.HttpError }
 *
 * const fetchUsers = Http.get('/api/users', Http.expectJson(Schema.Array(User)))
 *
 * const cmd = Http.send(fetchUsers, {
 *   onSuccess: (users): Msg => ({ type: 'UsersLoaded', users }),
 *   onError: (error): Msg => ({ type: 'UsersFailed', error })
 * })
 * ```
 *
 * @since 0.2.0
 * @category Execution
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
 * import { Schema } from 'effect'
 * import * as Http from 'tea-effect/Http'
 *
 * const User = Schema.Struct({ id: Schema.Number, name: Schema.String })
 * type User = Schema.Schema.Type<typeof User>
 *
 * type Msg =
 *   | { readonly type: 'UsersLoaded'; readonly users: ReadonlyArray<User> }
 *   | { readonly type: 'UsersFailed'; readonly error: Http.HttpError }
 *
 * const cmd = Http.sendBy(
 *   (users: ReadonlyArray<User>): Msg => ({ type: 'UsersLoaded', users }),
 *   (error: Http.HttpError): Msg => ({ type: 'UsersFailed', error })
 * )(Http.get('/api/users', Http.expectJson(Schema.Array(User))))
 * ```
 *
 * @since 0.2.0
 * @category Execution
 */
export const sendBy = <A, Msg>(
  onSuccess: (a: A) => Msg,
  onError: (error: HttpError) => Msg
) =>
  (req: Request<A>): Cmd<Msg, never, HttpRequirements> =>
    send(req, { onSuccess, onError })