# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2026-10-20

### Added

- Http: `expectFile` reads the response body as bytes and gives a `File`. Its name comes from `Content-Disposition`: `filename*` (RFC 8187, `UTF-8` or `ISO-8859-1`) before `filename`, quoted or not. A raw UTF-8 `filename`, which fetch hands over byte for byte and so arrives as Latin-1, is decoded back when it is valid UTF-8. Only the base name is kept, so `../../x.pdf` is saved as `x.pdf`. Without the header the name is the last segment of the URL, and `download` when there is none. The type is the response's `Content-Type`. A status outside 2xx is still `BadStatus` with the body as text, as with every other expectation, so a server can answer a failed export with its usual JSON errors
- File: a new module, `tea-effect/File`, after Elm's `elm/file`. `File.File` is the browser's `File`. `File.toText`, `File.toBytes` (a `Uint8Array<ArrayBuffer>`) and `File.toDataUrl` read it as Tasks that fail with a `ReadError`; interrupting `toDataUrl` aborts the read. The root `tea-effect` entry re-exports the module as `File`
- File.Select: `file(accept, toMsg)` and `files(accept, toMsg)` ask the user for one file or several, through a hidden `<input type="file">` that stays in the document while the picker is open. `files` hands `toMsg` a non-empty array. Dismissing the picker sends no message where the browser fires `cancel`; where it does not, the command stays pending. Browsers open the picker only in response to a user action, so the command belongs in the `update` branch for that click
- File.Download: `file(file)`, `text(name, mime, content)` and `bytes(name, mime, content)` save a file through a hidden link and revoke its object URL 40 seconds later, on a detached fiber, since Safari and Firefox can cancel a download whose URL is revoked right after the click. `url(href)` lets the browser download a URL itself, straight to disk, and opens one on another origin in a new tab, since browsers download only same-origin links. `send(request, { onSuccess, onError })` sends a `Request<File>`, saves the file it answers with and passes only the file name to `onSuccess`, so the file never reaches a message; a failed request saves nothing and ends in `onError`. Without a `document`, every command here does nothing
- Http: request bodies for files, after Elm's: `fileBody(file)` sends a `File` or `Blob` as the whole body, passed to fetch as it is so the browser streams it from disk, with the file's type as `Content-Type`, or `application/octet-stream` when the type is unknown. `stringBody(mime, text)` and `bytesBody(mime, bytes)` send content with an explicit type. `multipartBody(parts)` sends `multipart/form-data` built from `stringPart(name, value)`, `filePart(name, file)` and `bytesPart(name, mime, bytes)`; fetch writes its `Content-Type` with the boundary, and a `Content-Type` header set on the request is dropped. GET and HEAD still send no body
- package.json: a `./File` export, which `smoke:dist` loads like the others

### Changed

- Http: `Expect<A>` has a third case, `{ _tag: 'ExpectFile'; decoder }`, and `Body` four more - `StringBody`, `BytesBody`, `FileBody` and `MultipartBody`, the last holding the new `Part` type. A `switch` over `Expect._tag` or `Body._tag` that is checked for exhaustiveness has to handle them
- Http: the request body is now set after the request's headers for every kind of body, as the JSON body already was, so the body decides `Content-Type`. A JSON body is still `application/json`, and a request without a body still keeps a `Content-Type` header set by hand

## [0.9.0] - 2026-10-19

Requires Effect 4.0 (`effect` `~4.0.0`).

### Breaking

- package.json: the `effect` peer dependency is `~4.0.0` (was `^3.19.15`). Every Effect type in tea-effect's API is now Effect 4's, so application code has to be ported to Effect 4 as well. The range stops at 4.0.x because the `effect/http` modules that `Http` imports are marked `@stability unstable` in Effect 4.0
- package.json: the package is ESM only. It has `"type": "module"`, every `exports` entry is `{ types, default }` pointing at an ESM `dist/*.js`, and the CommonJS build, the `.mjs` files and the `module` field are gone; `main` still points at `./dist/index.js`, which is now ESM. `import` works on every Node version tested. `require('tea-effect')` and `require('tea-effect/X')` work only through Node's `require(esm)`: they load on 20.19.0, 22.12.0 (with an `ExperimentalWarning`) and 24.11.0, and fail with `ERR_REQUIRE_ESM` on 18.20.8, 20.18.3 and 22.11.0. Effect 4 is ESM only itself
- package.json: `engines.node` is `^20.19.0 || >=22.12.0` (was `>=18.0.0`). CI runs Node 20.19.0, 22.12.0 and 24.x (was 18.x, 20.x and 22.x) and adds a `smoke:dist` step, also run by `prepublishOnly`, that loads every export through both `import()` and `require()` and checks they return the same module instance
- TypeScript: Effect 4 requires TypeScript 5.9 or newer; the 0.8.3 docs said 5.3 or newer. tea-effect's own devDependency is now `^5.9.0`
- TypeScript: `moduleResolution` `node` / `node10` now fails on `effect` itself (TS2307 - Effect 4 has no `main` or `types` field), not only on the `tea-effect/X` subpaths. Use `bundler` or `nodenext`; `nodenext` works even from a CommonJS file. `node16` works from ESM files only. From a CommonJS file it fails with TS1479, because tea-effect and Effect 4 are both ESM only - `import { Effect } from 'effect'` fails there too
- Task: `attempt`'s callback receives Effect 4's `Result<A, E>` instead of an `Either<A, E>` - tags `Success` / `Failure`, fields `success` / `failure`. Replace `Either.match({ onLeft, onRight })` with `Result.match({ onFailure, onSuccess })`. `attemptWith` keeps its `{ onSuccess, onFailure }` handlers, and `catchAll` keeps its name although Effect 4 renamed `Effect.catchAll` to `Effect.catch`
- React: `useProgram`'s `runtime` option, and the fourth parameter of the hook `makeUseProgramWithLayer` returns, take a `Context.Context<R>` instead of a `Runtime.Runtime<R>`, which Effect 4 does not have. Build it from the `ManagedRuntime` as before: `Effect.runSync(AppRuntime.contextEffect)` in place of `Effect.runSync(AppRuntime)`, and `await AppRuntime.context()` in place of `await AppRuntime.runtime()` for a layer that builds asynchronously. `runtime` is still required exactly when `R` is not `never`
- Http: `expectJson` takes a `Schema.Decoder<A>` and `jsonBody` a `Schema.Codec<A, I>` (both took a `Schema.Schema`); `Expect<A>.decoder` is a `Schema.Decoder<A>` and `JsonBody.encoder` a `Schema.Encoder<unknown> | undefined`. A value annotated `Schema.Schema<A>` is now rejected - annotate it `Schema.Codec<A>` or `Schema.Decoder<A>`, or let inference work. In return, `expectJson` accepts transforming schemas such as `Schema.NumberFromString` or a struct with a `Schema.DateFromString` field, which 0.8.3 rejected
- Http: a response that fails the decoder is `BadBody` carrying a `Schema.SchemaError`, and a request body that fails its encoder is `BadRequestBody` carrying a `Schema.SchemaError` (both carried a `ParseError`). Invalid JSON is still `BadBody` with a `SyntaxError`, a `rawBody` value that cannot serialise is still `BadRequestBody` with an `HttpBodyError`, and the `HttpError` tags and fields are unchanged
- Http: `toTaskRaw` and `sendRaw` require `HttpClient.HttpClient` from `effect/http` instead of `@effect/platform/HttpClient`. A mock built with `HttpClient.make` and `HttpClientResponse.fromWeb` keeps its shape - only the imports move. A mock that fails with client errors must build Effect 4's `HttpClientError` with a `reason` (`TransportError`, `InvalidUrlError`, `StatusCodeError`, `DecodeError`, `EncodeError` or `EmptyBodyError`) instead of a `RequestError` or `ResponseError`
- LocalStorage: `getTask`, `setTask`, `get`, `set`, `setIgnoreErrors` and `onChange` take a `Schema.Codec<A, I>` (was `Schema.Schema<A, I>`), so a value annotated `Schema.Schema<A>` is rejected. `DecodeError.error` and `EncodeError.error` are a `Schema.SchemaError` (was `ParseResult.ParseError`), and the `decodeError` / `encodeError` constructors take one. `JsonParseError`, `QuotaExceeded` and `StorageNotAvailable` are unchanged
- Router: `path`'s param schemas, `RouteBuilder.query`, `Parser.param` / `query` and `Matcher.param` / `query` take a `Schema.Codec<A, string>` / `Schema.Codec<Q, I>` (was `Schema.Schema`), and `ParamsFromSchemas` infers from `Codec`, so a value annotated `Schema.Schema<A>` is rejected. `IntFromString` is typed `Schema.Codec<number, string>` and accepts, rejects and formats exactly what it did in 0.8.3: it rejects `''`, `' '`, `'abc'`, `'NaN'`, `'Infinity'`, `'1.5'` and `'12abc'`

### Removed

- package.json: `@effect/platform` is no longer a peer dependency (it was an optional `^0.94.0`). `Http` imports `FetchHttpClient`, `HttpClient`, `HttpClientError` and `HttpClientRequest` from `effect/http`, which ships inside `effect`, so `npm install @effect/platform` can be dropped. The root `tea-effect` entry no longer pulls in `@effect/platform`; it still re-exports `Http`, and a subpath import still keeps `Http`'s code out of the graph

### Changed

- TypeScript: without `skipLibCheck`, the `lib: ["ES2022", "DOM"]` that the 0.8.3 docs recommended now reports three errors inside effect's declarations for any file that imports `effect` or a tea-effect module: TS2304 `AsyncDisposable` and `Disposable`, and TS2550 `asyncDispose`. Add `"ESNext.Disposable"` to `lib`, use `"ESNext"` in place of `"ES2022"`, use `target: "ESNext"` with no `lib`, or turn `skipLibCheck` on. `ES2023` and `ES2024` do not help. `DOM` is still required
- Platform: on every step that changes the model, `subscriptions(model)` now runs inside `dispatch`, before that step's `subscribe` listeners, and new sources register (a `Sub.fromCallback`'s `register` runs) and removed ones are cleaned up there too. For `init` this all happens while `Platform.program` builds, before the init Cmd starts. In 0.8.3 it happened one or more microtasks later, so init subscriptions registered after the init Cmd had started, and an event the init Cmd fired could be missed. The model counts as changed when it is not `===` the previous one; 0.8.3 compared with Effect 3's `Equal.equals`, so a new `Data.struct` equal to the old model did not count
- Platform: `model$` consumers - `Platform.run` / `runWith`, Html's `html$` and the React hook's `setModel` - can now receive a value synchronously inside `dispatch`, even before that step's `subscribe` listeners. In 0.8.3 it arrived only after `dispatch` had returned. When it arrives is not guaranteed, since it depends on the consuming fiber being idle; the only guaranteed synchronous path is still `Program.subscribe` / Html's `subscribeHtml`, which `React.run` and `Html.runWith` use
- Platform: messages from Cmds and subscriptions still go through the queue, so a Cmd's message is not applied inside the `dispatch` that returned the Cmd, but they are now applied one or more macrotasks later instead of a microtask or two later. Effect 4's default scheduler resumes the loop with `setTimeout(0)`, or with `setImmediate` where it exists, as in Node. This holds for a program started with `Effect.runFork` / `Effect.runPromise` or `useProgram`; one built inside `Effect.runSync` keeps that call's microtask scheduler, and its messages arrive a microtask or two later, as in 0.8.3
- React: under StrictMode's mount-cleanup-mount, the discarded first mount no longer runs its init Cmd, so the init Cmd runs once (0.8.3 ran it twice - a duplicate request, for example). The discarded mount's subscriptions register and are cleaned up synchronously, and on unmount the program is shut down, subscriptions included, before the effect cleanup returns (0.8.3 cleaned them up afterwards)
- Http: when the client fails with something other than an `HttpClientError` or an `HttpError` - a mock failing with `new Error('boom')`, for example - the result is `NetworkError` carrying that value. In 0.8.3 it was `BadBody`. A failure that is already an `HttpError`, such as `Http.timeout`, still passes through as is, and errors from the fetch client map as before
- Http, LocalStorage: JSON is read and written as in 0.8.3 - the schema, then `JSON.stringify` / `JSON.parse` - so what is sent and stored is exactly what the schema encodes to. Some Effect 4 schemas encode to something else than their Effect 3 namesakes. `Schema.Date` is the in-memory `Date`: it still writes an ISO string, but no longer reads one. `Schema.BigInt` is the in-memory `bigint` and cannot be written at all. `Schema.Option` writes `{"_id":"Option","_tag":"Some","value":...}` and does not read 0.8.3's `{"_tag":"Some","value":...}`. `Schema.DateFromString` and `Schema.BigIntFromString` write and read the same strings that Effect 3's `Schema.Date` and `Schema.BigInt` did
- Http, LocalStorage: in Effect 4 a struct key has to be present even when its schema accepts `undefined`. Reading JSON that lacks a `Schema.UndefinedOr(X)`, `Schema.Unknown` or `Schema.Any` key fails (`DecodeError` / `BadBody`), and writing a value that lacks a `Schema.UndefinedOr(X)` key fails too (`EncodeError` / `BadRequestBody`); 0.8.3 accepted both. A `Schema.UndefinedOr(X)` key holding `undefined` is still written without the key, as `JSON.stringify` drops it, so it no longer reads back. Declare a key that may be absent with `Schema.optional(X)`
- Http, LocalStorage: Effect 4 rejects an Invalid Date - `Schema.DateFromString` no longer decodes an unparseable string to one, and one no longer encodes (0.8.3 wrote `"Invalid Date"`, or `null` with `Schema.DateFromSelf`). `Schema.Class` encodes only instances of the class; 0.8.3 also encoded a plain object of the right shape
- Router: Effect 4's `Schema.NumberFromString` turns any string into a number, as `Number()` does: `'abc'` and `'12abc'` become `NaN`, `''` and `' '` become `0`. A route or query param built with it now matches invalid input - `/users/abc` gives `id` `NaN`, `/users/%20` gives `0`, `?page=abc` gives `NaN` and `?page=` gives `0` - where 0.8.3 did not match. Use `Router.IntFromString`. `expectJson`, which now accepts `NumberFromString` (0.8.3 rejected it at compile time), coerces the same way: a JSON `"abc"` decodes to `NaN`
- Router: Effect 4 has no `Schema.UUID`. The `Parser.param` and `Matcher.param` examples use `Schema.String.check(Schema.isGUID())`, which accepted the same inputs as Effect 3's `Schema.UUID` in testing; `Schema.isUUID()` is stricter and rejects version 0 and bad variant bits. Effect 3's `Schema.Date`, a string to a valid `Date`, is `Schema.DateFromString` in Effect 4, and the `Matcher.param` example uses it; Effect 4's `Schema.Date` is the in-memory `Date` and rejects strings, so a route query declared with `Schema.Date` no longer matches and a path param declared with it no longer compiles - use `Schema.DateFromString`
- Dependency injection: Effect 4 services are `Context.Service` - `class ApiClient extends Context.Service<ApiClient, Shape>()('ApiClient') {}` in place of `Context.Tag('ApiClient')<ApiClient, Shape>() {}`, which Effect 4 does not have. `Layer.succeed(ApiClient, impl)` and `yield* ApiClient` work as before, and the dependency-injection example is updated
- Testing: in Effect 4, `Stream.runCollect(cmd)` returns a plain array, so `Chunk.toArray` / `Chunk.toReadonlyArray` can be dropped; a program built into an explicit scope uses `Scope.provide(scope)` instead of `Scope.extend(scope)`; and `Effect.fork` is `Effect.forkChild`. tea-effect's own API for these is unchanged

## [0.8.4] - 2026-10-19

### Fixed

- Platform: a `dispatch` made while a message is being applied - from a `subscribe` listener or from `update` itself - is now queued and applied after the current step, before the outer `dispatch` returns. In 0.8.3 it ran nested, so after a listener dispatched, a later listener received the newer model first and then the older one, and ended on a stale model
- Platform: a `dispatch` from inside `update` no longer loses its model change. In 0.8.3 it ran nested, and the outer `update` then overwrote the model the nested message had produced
- Platform: a `subscribe` listener that throws no longer stops the other listeners or the step's Cmd: the remaining listeners still receive the model and the Cmd still starts. The error still surfaces on `model$` as a defect, and `dispatch` does not throw. In 0.8.3 the remaining listeners were skipped and the Cmd never ran

## [0.8.3] - 2026-08-24

### Fixed

- Navigation: the `UrlRequest`, `linkClicks` and `program` examples handled an internal link with `pushUrl(location.pathname)`, which drops the query and the hash - a click on `/search?q=hello` navigated to `/search`. They now rebuild the URL from `pathname`, `search` and `hash`
- Router: the `path`, `routes` and `RouteType` examples used `Schema.NumberFromString` for an `:id` param, which accepts `'NaN'`, `'Infinity'` and non-integers. `IntFromString` exists for exactly that reason, and the module's own Quick Start already used it
- Router: the JSDoc for `ExtractParams` was attached to the private `ExtractParamsRooted` helper, leaving the exported type undocumented
- Task: the `perform` and `attempt` examples called both functions with two arguments; both are curried
- Http: `UsersSchema` and `UserSchema` appeared in six examples without ever being defined, and two type comments named `Users[]`, which the library never produces
- LocalStorage: the `onChange` example took a `model` parameter, contradicting the keep-alive note directly above it - the handlers are captured once, so reading the model there freezes it at the first render
- Navigation: the `load` example presented `load(window.location.href)` as a forced reload from the server. It is an ordinary navigation, and with a hash in the URL it does not reload at all; the example now points at `reload`, which is the primitive for that
- Router: the `Route` example moved from the class declaration onto `Route.parse`. docgen extracts examples from a class's methods but not from the class itself, so that one was published on the API page without ever being compiled - and it would not have compiled, having no import
- index: the `Cmd` re-export's own description was never rendered. docgen attaches a file's leading comment to the first declaration in it, so the module overview took its place; the two are now one block

### Added

- Documentation site built with VitePress: Why, Getting started, The mental model, HTTP, Routing, Dependency injection, Composition, Testing and Gotchas. Every runnable snippet is imported from a file under `docs/examples` that CI typechecks against `src`, so a signature change breaks the docs build. The "wrong / right" fragments in Gotchas and a few illustrative fences elsewhere are written inline on purpose and are not covered
- `docs:api` runs `@effect/docgen`, which typechecks **and executes** every `@example` block against `src`. Every example now carries its own imports and compiles standalone; 56 of the first 60 failed the first time this ran
- The Testing guide's examples are a real Vitest file run by `npm test`, so its claim that `dispatch` applies `update` before returning is a test rather than a statement
- index: every module re-export is documented, and the entry records that importing the root pulls in `@effect/platform` through `Http` - only `tea-effect/Http` needs it, every other subpath builds without it
- package.json: `homepage` and `bugs`

### Changed

- Router: `Route` is re-exported as a `const` plus a matching `type` instead of `export { Route } from './Router/Route'`, because docgen cannot read JSDoc on a re-export. `Route.parse()`, `new Route()` and `Route` in type position are all unchanged, and the emitted declaration is equivalent

## [0.8.2] - 2026-08-21

### Fixed

- Platform: `dispatch` now runs `update` and notifies the renderer synchronously, before it returns, instead of queueing the message for a fiber. elm-ts does the same (`state$.next(update(msg, state$.getValue()[0]))` on a `BehaviorSubject`); tea-effect had diverged, and that one-tick delay meant a renderer driving controlled DOM inputs still held the previous model while the browser had already accepted the keystroke - the reconciler wrote the stale value back, moving the caret and clearing the field native undo history

### Added

- Platform: `Program.subscribe(listener)` observes the model synchronously and returns an unsubscribe function. `model$` is unchanged and still delivers the same values through a `Stream`
- Html: `Program.subscribeHtml(renderer)` does the same for rendered views, and `runWith` now uses it, so the view reaches the renderer inside `dispatch`

### Changed

- Platform: messages from commands and subscriptions still travel through the queue and stay serialized, but the queue no longer decides WHEN a message is applied

## [0.8.1] - 2026-08-20

### Fixed

- Html: `map` caches the mapped dispatch per `(f, dispatch)` pair instead of allocating a new one on every render. A view is rebuilt each render, so the child used to receive a different dispatch every time and nothing below a `map` boundary could be memoised - `React.memo` never bailed out. Keep `f` a stable reference (a module-level message constructor); an inline arrow is a new cache key each render
- Html: `map`'s doc said it maps the Dom type; it maps the messages

## [0.8.0] - 2026-08-20

### Breaking

- Navigation: `Location` carries `state`, so every `Location` literal must supply it (`null` when there is none)

### Added

- Navigation: `pushUrl(url, state?)` and `replaceUrl(url, state?)` store view state with the history entry; `getLocation` reads it back, and back/forward restore the state the browser kept for that entry

### Changed

- Cmd: `map` gives back `none` itself, and `batch` drops `none` entries before merging, so "this branch does nothing" survives being wired through a parent

## [0.7.0] - 2026-07-13

### Breaking

- Http: added `BadRequestBody` to `HttpError` (exhaustive `switch`es must add a case)
- Http: `expectString` now reads the body as text; `Expect` is a discriminated union
- Http: non-2xx statuses are `BadStatus`; `withCredentials` is now applied
- Platform: keyed subscription diffing; `model$` now fails with `E` on Cmd/Sub/update errors; `shutdown` stops command fibers
- React: `makeUseProgram` requires `options.runtime` when `R` is not `never`
- Router: params only at segment start; format/parse now percent- and schema-encode

### Added

- Router `IntFromString`; Sub `withKey`/`getSubEntries`/`SubEntry`; Http `badRequestBody`

### Fixed

- ~40 audited defects across Platform, Sub, React, Http, Navigation, LocalStorage, Router

## [0.6.0] - 2025-02-04

### Added

- **Router** module - Type-safe URL routing with Schema validation
  - Inspired by [fp-ts-routing](https://github.com/gcanti/fp-ts-routing) and [Elm's Url.Parser](https://package.elm-lang.org/packages/elm/url/latest/Url-Parser)
  - **Route definition**
    - `path(pattern, schemas?)` - Define route from path pattern with `:paramName` syntax
    - `routes(definitions)` - Create routes collection with automatic tagging
  - **Parsing**
    - `parse(routes, location)` - Parse location into typed route (returns `Option`)
    - `parseOr(routes, location, default)` - Parse with fallback value
  - **Formatting**
    - `format(route, params)` - Format route definition to URL string
  - **Type utilities**
    - `RouteType<T>` - Infer union type of all routes
    - `RouteParams<T>` - Extract params type
    - `RouteQuery<T>` - Extract query type
    - `FormatParams<T>` - Extract format params (params + query)
  - **Low-level combinators**
    - `lit(segment)` - Match literal path segment
    - `str(key)` - Capture string path segment
    - `int(key)` - Capture integer path segment
    - `param(key, schema)` - Capture segment with Schema validation
    - `query(schema)` - Match query parameters with Schema
    - `end` - Match end of path
    - `seq(a, b)` - Sequence two matchers
  - **Sub-modules**
    - `Router.Route` - Route class (segments + query)
    - `Router.Parser` - Parser combinators
    - `Router.Formatter` - URL formatting
    - `Router.Matcher` - Bidirectional matchers

## [0.5.1] - 2025-02-04

### Added

- **Navigation** module - `program` function (like Elm's Browser.application)
  - `program(config)` - Create navigation-enabled program
    - Automatically passes initial location to `init`
    - Automatically subscribes to `linkClicks` and `urlChanges`
    - Batches navigation subscriptions with custom subscriptions
  - `ProgramConfig` interface for type-safe configuration

## [0.5.0] - 2025-02-04

### Added

- **Navigation** module - Browser history and URL management (Elm-style API)
  - Inspired by [Elm's Browser.Navigation](https://package.elm-lang.org/packages/elm/browser/latest/Browser-Navigation)
  - **Model**
    - `Location` - Browser location (pathname, search, hash, href, origin)
    - `UrlRequest` - Discriminated union: `Internal` (same origin) | `External` (different origin)
    - `getLocation()` - Get current browser location (SSR-safe)
  - **Commands**
    - `pushUrl(url)` - Navigate and add history entry
    - `replaceUrl(url)` - Navigate and replace history entry
    - `back(steps)` - Go back in history
    - `forward(steps)` - Go forward in history
    - `load(url)` - Leave app and load external URL
    - `reload` - Reload current page
  - **Subscriptions**
    - `urlChanges(toMsg)` - Subscribe to URL changes (from any source)
    - `linkClicks(toMsg)` - Intercept `<a>` clicks and emit `UrlRequest`
      - Distinguishes internal vs external links automatically
      - Respects modifier keys (Ctrl/Meta for new tab)
      - Ignores `target="_blank"`, `download`, `mailto:`, `tel:` links

## [0.4.0] - 2025-01-17

### Added

- **LocalStorage** module - Browser storage with Schema encoding
  - `get` / `set` - Read/write with Schema validation and `{onSuccess, onError}` handlers
  - `setIgnoreErrors` / `removeIgnoreErrors` - For non-critical operations
  - `remove` / `clear` / `keys` - Storage management with handlers
  - `getTask` / `setTask` / `removeTask` / `clearTask` / `keysTask` - Effect-based API
  - `onChange` - Subscription for cross-tab changes with Schema decoding
  - `onChangeRaw` - Subscription for raw string changes
  - `onAnyChange` - Subscription for all storage changes
  - Typed error handling: `StorageNotAvailable`, `QuotaExceeded`, `JsonParseError`, `DecodeError`, `EncodeError`

### Changed

- **Cmd** module - Refactored from `Effect<Option<Msg>>` to `Stream<Msg>` (breaking change)
  - `Cmd.batch` now correctly dispatches ALL messages, not just the first one
  - Messages dispatch as each command completes (Elm semantics)
  - `Cmd.batch` uses `Stream.mergeAll` for concurrent execution
  - Platform uses `Stream.runForEach` with `Effect.forkScoped` to process commands

### Removed

- **Cmd** module - Removed `batchAll` (breaking change). Use `Cmd.batch`, which
  now dispatches all messages as commands complete; to collect multiple task
  results into one message, compose with `Task.all` and `Task.perform`/`attempt`.

## [0.3.0] - 2025-01-16

### Changed

- **Http** module - Auto-provide FetchHttpClient (breaking change)
  - `HttpRequirements` is now `never` - no manual HttpClient configuration needed
  - `toTask` and `send` automatically provide FetchHttpClient
  - Added `toTaskRaw` for testing with mock HttpClient layers
  - Added `sendRaw` for testing with mock HttpClient layers

### Fixed

- **Platform** module - Fix subscription cancellation on model change
  - Added `{ switch: true }` to Stream.flatMap in subscription loop
  - Previous subscriptions now properly cancel when model changes (like RxJS switchMap)

## [0.2.0] - 2025-01-09

### Added

- **Http** module - HTTP requests as Commands (Elm-style API)
  - Inspired by [Elm's Http module](https://package.elm-lang.org/packages/elm/http/latest/Http) and [gcanti's elm-ts](https://github.com/gcanti/elm-ts)
  - Uses `@effect/platform` for HTTP and `Schema` for encoding/decoding
  - **Body constructors** (runtime validation)
    - `jsonBody(schema, value)` - Create body with Schema validation/encoding
    - `rawBody(value)` - Create body without validation
    - `emptyBody` - Empty body for GET/DELETE requests
  - **Request constructors**
    - `get(url, expect)` - Create GET request
    - `post(url, body, expect)` - Create POST request with Body
    - `put(url, body, expect)` - Create PUT request with Body
    - `patch(url, body, expect)` - Create PATCH request with Body
    - `del(url, expect)` - Create DELETE request
    - `request(config)` - Create custom request with full control
  - **Expectations (decoders)**
    - `expectJson(schema)` - Expect JSON response decoded with Schema
    - `expectString` - Expect string response
    - `expectWhatever` - Expect any JSON value
  - **Request modifiers** (composable with `pipe`)
    - `withHeader(name, value)` - Add single header
    - `withHeaders(headers)` - Add multiple headers
    - `withTimeout(ms)` - Set request timeout
    - `withCredentials` - Enable cookies for cross-origin requests
  - **Header helpers**
    - `header(name, value)` - Create header
    - `contentType(value)` - Content-Type header
    - `authorization(value)` - Authorization header
    - `bearerToken(token)` - Bearer token header
  - **Execution**
    - `toTask(request)` - Convert to Task (Effect) that can fail with HttpError
    - `send(request, handlers)` - Convert to Cmd with success/error handlers
    - `sendBy(onSuccess, onError)` - Alternative curried API for send
  - **Error types** (similar to Elm's Http.Error)
    - `BadUrl` - Invalid URL
    - `Timeout` - Request timeout
    - `NetworkError` - Network failure
    - `BadStatus` - HTTP status >= 400
    - `BadBody` - JSON decode error

### Changed

- **React** module - Added `ReactLike` interface for better compatibility
  - `makeUseProgram` and `makeUseProgramWithLayer` now accept `ReactLike` instead of `typeof React`
  - Allows tea-effect to work with any React-compatible library (Preact, etc.)
  - Avoids type conflicts between different React versions

### Dependencies

- Added optional `@effect/platform` ^0.73.0 peer dependency (required for Http module)

## [0.1.1] - 2025-01-06

### Fixed

- **Platform** module - Fix stale model state in update loop causing counter to always read initial value
  - Replace polling-based `Ref` with reactive `SubscriptionRef` for proper state synchronization

### Changed

- **Platform** module - Refactored state management to use `SubscriptionRef`
  - Replace `Ref` with `SubscriptionRef` for reactive state (similar to RxJS BehaviorSubject)
  - Simplify `model$` stream to use `SubscriptionRef.changes` directly
  - Remove polling-based subscription loop in favor of push-based reactivity
  - Change `Effect.runFork` to `Effect.runSync` in dispatch function
- **React** module - Improved hook implementation
  - Use `dispatchRef` pattern instead of `useMemo` for dispatch stability
  - Simplify setup effect using `Effect.scoped` wrapper

[0.8.0]: https://github.com/savkelita/tea-effect/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/savkelita/tea-effect/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/savkelita/tea-effect/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/savkelita/tea-effect/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/savkelita/tea-effect/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/savkelita/tea-effect/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/savkelita/tea-effect/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/savkelita/tea-effect/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/savkelita/tea-effect/compare/v0.1.0...v0.1.1

## [0.1.0] - 2024-01-06

### Added

- Initial release of tea-effect
- **Cmd** module - Commands for side effects
  - `none` - No-op command
  - `of` - Create command with message
  - `map` - Transform command message
  - `batch` - Combine multiple commands
  - `batchAll` - Collect all command results
- **Sub** module - Subscriptions for external events
  - `none` - No subscriptions
  - `of` - Single message subscription
  - `fromIterable` - Create from iterable
  - `map` - Transform subscription messages
  - `batch` - Combine subscriptions
  - `filter` - Filter messages
  - `interval` - Timer subscription
  - `fromCallback` - Callback-based subscription
- **Task** module - Effect-based tasks
  - `succeed` / `fail` - Create tasks
  - `perform` - Run infallible task as command
  - `attempt` - Run fallible task with Either result
  - `attemptWith` - Run fallible task with separate handlers
  - `map` / `mapError` / `flatMap` - Combinators
  - `both` / `all` - Concurrent execution
- **Platform** module - Core TEA runtime
  - `program` - Create TEA program
  - `programWithFlags` - Create program with initial flags
  - `run` - Get model stream
  - `runWith` - Run with subscriber
- **Html** module - DOM-agnostic view layer
  - `program` - Create program with view
  - `programWithFlags` - With initial flags
  - `map` - Transform Html messages
  - `run` / `runWith` - Run program
- **React** module - React integration
  - `program` / `programWithFlags` - React programs
  - `run` - Run with ReactDOM renderer
  - `makeUseProgram` - Create React hook
  - `makeUseProgramWithLayer` - Hook with Effect Layer

### Dependencies

- Requires `effect` ^3.0.0 as peer dependency
- Optional `react` ^18.0.0 || ^19.0.0 peer dependency

[0.1.0]: https://github.com/savkelita/tea-effect/releases/tag/v0.1.0
