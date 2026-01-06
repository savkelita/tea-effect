# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
