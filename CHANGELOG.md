# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
