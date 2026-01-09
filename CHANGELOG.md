# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **LocalStorage** module - Browser storage with Schema encoding
  - `get` - Read and decode value with Schema
  - `getRaw` - Read raw string without decoding
  - `set` - Encode and store value with Schema
  - `setRaw` - Store raw string without encoding
  - `remove` - Remove item from storage
  - `clear` - Clear all items from storage
  - `keys` - Get all storage keys
  - `length` - Get number of items
  - `onChange` - Subscription for cross-tab changes with Schema decoding
  - `onChangeRaw` - Subscription for raw string changes
  - `onAnyChange` - Subscription for all storage changes
  - Typed error handling: `StorageNotAvailable`, `QuotaExceeded`, `JsonParseError`, `DecodeError`, `EncodeError`

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
