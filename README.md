# tea-effect

The Elm Architecture (TEA) for TypeScript, powered by [Effect](https://effect.website/).

A spiritual successor to [elm-ts](https://github.com/gcanti/elm-ts), replacing fp-ts/RxJS with the Effect ecosystem.

## Why tea-effect?

| Feature | elm-ts (fp-ts/RxJS) | tea-effect (Effect) |
|---------|---------------------|---------------------|
| Error handling | `TaskEither<E, A>` | `Effect<A, E, R>` with typed errors |
| Dependency injection | Manual / Reader | Built-in via `R` (requirements) |
| Streaming | RxJS Observable | Effect Stream |
| Runtime validation | io-ts | @effect/schema |
| Concurrency | RxJS operators | Structured concurrency |
| Resource management | Manual | Scope, automatic cleanup |

## Installation

```bash
npm install tea-effect effect
# or
yarn add tea-effect effect
```

## Quick Start

```tsx
import { Cmd, Sub, Task } from 'tea-effect'
import { makeUseProgram } from 'tea-effect/React'
import * as React from 'react'

// Create the hook
const useProgram = makeUseProgram(React)

// Define your model
type Model = {
  count: number
  loading: boolean
}

// Define your messages
type Msg =
  | { type: 'Increment' }
  | { type: 'Decrement' }
  | { type: 'Reset' }

// Initial state
const init: [Model, Cmd.Cmd<Msg>] = [
  { count: 0, loading: false },
  Cmd.none
]

// Update function
const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'Increment':
      return [{ ...model, count: model.count + 1 }, Cmd.none]
    case 'Decrement':
      return [{ ...model, count: model.count - 1 }, Cmd.none]
    case 'Reset':
      return [{ ...model, count: 0 }, Cmd.none]
  }
}

// React component
function Counter() {
  const { model, dispatch } = useProgram(init, update)

  return (
    <div>
      <h1>Count: {model.count}</h1>
      <button onClick={() => dispatch({ type: 'Decrement' })}>-</button>
      <button onClick={() => dispatch({ type: 'Increment' })}>+</button>
      <button onClick={() => dispatch({ type: 'Reset' })}>Reset</button>
    </div>
  )
}
```

## With Side Effects (API Calls)

```tsx
import { Effect, pipe } from 'effect'
import { Cmd, Task } from 'tea-effect'

type User = { id: number; name: string }

type Model = {
  users: User[]
  loading: boolean
  error: string | null
}

type Msg =
  | { type: 'FetchUsers' }
  | { type: 'FetchUsersSuccess'; users: User[] }
  | { type: 'FetchUsersError'; error: string }

// API call as Effect
const fetchUsersApi: Effect.Effect<User[], Error> = pipe(
  Effect.tryPromise({
    try: () => fetch('/api/users').then(r => r.json()),
    catch: (e) => new Error(String(e))
  })
)

// Convert to Cmd using Task.attempt
const fetchUsersCmd: Cmd.Cmd<Msg> = Task.attemptWith({
  onSuccess: (users) => ({ type: 'FetchUsersSuccess', users }),
  onFailure: (error) => ({ type: 'FetchUsersError', error: error.message })
})(fetchUsersApi)

const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'FetchUsers':
      return [{ ...model, loading: true, error: null }, fetchUsersCmd]
    
    case 'FetchUsersSuccess':
      return [{ ...model, loading: false, users: msg.users }, Cmd.none]
    
    case 'FetchUsersError':
      return [{ ...model, loading: false, error: msg.error }, Cmd.none]
  }
}
```

## With Subscriptions

```tsx
import { Sub } from 'tea-effect'
import { Stream } from 'effect'

type Msg =
  | { type: 'Tick'; time: number }
  | { type: 'KeyPressed'; key: string }

// Timer subscription
const timerSub: Sub.Sub<Msg> = pipe(
  Stream.fromSchedule(Schedule.spaced('1 second')),
  Stream.map(() => ({ type: 'Tick', time: Date.now() }))
)

// Keyboard subscription
const keyboardSub: Sub.Sub<Msg> = Sub.fromCallback<Msg>((emit) => {
  const handler = (e: KeyboardEvent) => emit({ type: 'KeyPressed', key: e.key })
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
})

// Combine subscriptions based on model
const subscriptions = (model: Model): Sub.Sub<Msg> =>
  model.isRunning
    ? Sub.batch([timerSub, keyboardSub])
    : Sub.none
```

## With Dependencies (Dependency Injection)

```tsx
import { Effect, Context, Layer } from 'effect'
import { Cmd, Task } from 'tea-effect'

// Define a service
class ApiClient extends Context.Tag('ApiClient')<
  ApiClient,
  { getUsers: () => Effect.Effect<User[], Error> }
>() {}

// Use it in commands - the `R` type tracks dependencies
const fetchUsersCmd: Cmd.Cmd<Msg, never, ApiClient> = pipe(
  ApiClient,
  Effect.flatMap(api => api.getUsers()),
  Task.attemptWith({
    onSuccess: (users) => ({ type: 'FetchUsersSuccess', users }),
    onFailure: (error) => ({ type: 'FetchUsersError', error: error.message })
  })
)

// Provide the implementation at runtime
const ApiClientLive = Layer.succeed(
  ApiClient,
  { getUsers: () => Effect.tryPromise(() => fetch('/api/users').then(r => r.json())) }
)

// Create runtime with dependencies
const runtime = pipe(
  Layer.toRuntime(ApiClientLive),
  Effect.runSync
)

// Use in component with runtime
const { model, dispatch } = useProgram(init, update, subscriptions, { runtime })
```

## Module Structure

| Module | Description |
|--------|-------------|
| `Cmd` | Commands - descriptions of side effects |
| `Sub` | Subscriptions - streams of external events |
| `Task` | Tasks - side effects that produce values |
| `Platform` | Core runtime for TEA programs |
| `Html` | Programs with view rendering |
| `React` | React integration and hooks |

## Migration from elm-ts

```typescript
// elm-ts
import { Cmd } from 'elm-ts/lib/Cmd'
import { Task } from 'elm-ts/lib/Task'
import { Observable } from 'rxjs'

// tea-effect
import { Cmd, Task } from 'tea-effect'
import { Effect, Stream } from 'effect'
```

| elm-ts | tea-effect |
|--------|------------|
| `Observable<Task<Option<Msg>>>` | `Effect<Option<Msg>, E, R>` |
| `Task.perform(f)(task)` | `Task.perform(f)(effect)` |
| `Task.attempt(f)(taskEither)` | `Task.attempt(f)(effect)` |
| `Sub<Msg>` (Observable) | `Sub<Msg>` (Stream) |

## Roadmap

Track progress on [GitHub Projects](https://github.com/savkelita/tea-effect/projects) or see open [Pull Requests](https://github.com/savkelita/tea-effect/pulls).

### v0.2.0 (in progress)
- [ ] **Http** - HTTP requests with Schema validation ([PR #1](https://github.com/savkelita/tea-effect/pull/1))

### v0.3.0 (planned)
- [ ] **Navigation** - Browser history and URL management ([PR #2](https://github.com/savkelita/tea-effect/pull/2))

### Future
- [ ] **Time** - Intervals, delays, timestamps
- [ ] **Random** - Random value generation as Cmd
- [ ] **LocalStorage** - Browser storage persistence
- [ ] **WebSocket** - Real-time communication
- [ ] **Debug** - Time-travel debugging, action logging
- [ ] **Browser** - Viewport, visibility, focus events

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
