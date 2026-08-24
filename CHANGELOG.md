# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
