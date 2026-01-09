# tea-effect

The Elm Architecture (TEA) for TypeScript, powered by [Effect](https://effect.website/).

A spiritual successor to [elm-ts](https://github.com/gcanti/elm-ts), replacing fp-ts/RxJS with the Effect ecosystem.

## Why tea-effect?

| Feature              | elm-ts (fp-ts/RxJS) | tea-effect (Effect)                 |
| -------------------- | ------------------- | ----------------------------------- |
| Error handling       | `TaskEither<E, A>`  | `Effect<A, E, R>` with typed errors |
| Dependency injection | Manual / Reader     | Built-in via `R` (requirements)     |
| Streaming            | RxJS Observable     | Effect Stream                       |
| Runtime validation   | io-ts               | @effect/schema                      |
| Concurrency          | RxJS operators      | Structured concurrency              |
| Resource management  | Manual              | Scope, automatic cleanup            |

## Installation

```bash
npm install tea-effect effect
# or
yarn add tea-effect effect

# Optional: for Http module
npm install @effect/platform
```

## Quick Start

```tsx
import { Cmd, Sub, Task } from "tea-effect";
import { makeUseProgram } from "tea-effect/React";
import * as React from "react";

// Create the hook
const useProgram = makeUseProgram(React);

// Define your model
type Model = {
  count: number;
  loading: boolean;
};

// Define your messages
type Msg = { type: "Increment" } | { type: "Decrement" } | { type: "Reset" };

// Initial state
const init: [Model, Cmd.Cmd<Msg>] = [{ count: 0, loading: false }, Cmd.none];

// Update function
const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case "Increment":
      return [{ ...model, count: model.count + 1 }, Cmd.none];
    case "Decrement":
      return [{ ...model, count: model.count - 1 }, Cmd.none];
    case "Reset":
      return [{ ...model, count: 0 }, Cmd.none];
  }
};

// React component
function Counter() {
  const { model, dispatch } = useProgram(init, update);

  return (
    <div>
      <h1>Count: {model.count}</h1>
      <button onClick={() => dispatch({ type: "Decrement" })}>-</button>
      <button onClick={() => dispatch({ type: "Increment" })}>+</button>
      <button onClick={() => dispatch({ type: "Reset" })}>Reset</button>
    </div>
  );
}
```

## HTTP Requests (Elm-style)

tea-effect provides an Elm-inspired Http module for type-safe HTTP requests with Schema validation.

```bash
# Install optional dependency for Http module
npm install @effect/platform
```

```tsx
import { Http } from "tea-effect";
import { Schema, pipe } from "effect";

// Define your schema
const User = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String,
});

type User = Schema.Schema.Type<typeof User>;

type Model = {
  users: User[];
  loading: boolean;
  error: Http.HttpError | null;
};

type Msg =
  | { type: "FetchUsers" }
  | { type: "UsersLoaded"; users: User[] }
  | { type: "UsersFailed"; error: Http.HttpError }
  | { type: "CreateUser"; name: string }
  | { type: "UserCreated"; user: User };

// Define input schema for validation
const CreateUserInput = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
});

// Create requests (describes WHAT to fetch)
const fetchUsersRequest = Http.get(
  "/api/users",
  Http.expectJson(Schema.Array(User))
);

// POST with Schema-validated body
const createUserRequest = (input: Schema.Schema.Type<typeof CreateUserInput>) =>
  Http.post(
    "/api/users",
    Http.jsonBody(CreateUserInput, input), // Validates before sending!
    Http.expectJson(User)
  );

// POST without validation (raw body)
const quickPostRequest = Http.post(
  "/api/users",
  Http.rawBody({ name: "John" }), // No validation
  Http.expectJson(User)
);

// Add headers with pipe
const authedRequest = pipe(
  fetchUsersRequest,
  Http.withHeader("Authorization", "Bearer token"),
  Http.withTimeout(5000)
);

// Update function
const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case "FetchUsers":
      return [
        { ...model, loading: true },
        Http.send(authedRequest, {
          onSuccess: (users) => ({ type: "UsersLoaded", users }),
          onError: (error) => ({ type: "UsersFailed", error }),
        }),
      ];

    case "UsersLoaded":
      return [{ ...model, loading: false, users: msg.users }, Cmd.none];

    case "UsersFailed":
      return [{ ...model, loading: false, error: msg.error }, Cmd.none];

    case "CreateUser":
      return [
        model,
        Http.send(createUserRequest(msg.name), {
          onSuccess: (user) => ({ type: "UserCreated", user }),
          onError: (error) => ({ type: "UsersFailed", error }),
        }),
      ];

    case "UserCreated":
      return [{ ...model, users: [...model.users, msg.user] }, Cmd.none];
  }
};
```

### Request Body

tea-effect provides three ways to create request bodies:

```tsx
// 1. jsonBody - with Schema validation (recommended)
// Validates and encodes the value before sending
const CreateUser = Schema.Struct({ name: Schema.String, email: Schema.Email });
Http.post(
  "/api/users",
  Http.jsonBody(CreateUser, { name: "John", email: "john@example.com" }),
  Http.expectJson(User)
);

// 2. rawBody - without validation
// Sends the value as-is (use when you trust the data)
Http.post("/api/users", Http.rawBody({ name: "John" }), Http.expectJson(User));

// 3. emptyBody - for requests without body (GET, DELETE)
// This is used automatically by Http.get() and Http.del()
Http.request({
  method: "POST",
  url: "/api/action",
  body: Http.emptyBody,
  expect: Http.expectWhatever,
});
```

### Http Error Handling

```tsx
// Handle specific error types
const renderError = (error: Http.HttpError) => {
  switch (error._tag) {
    case "BadUrl":
      return `Invalid URL: ${error.url}`;
    case "Timeout":
      return "Request timed out";
    case "NetworkError":
      return "Network error - check your connection";
    case "BadStatus":
      return `Server error: ${error.status}`;
    case "BadBody":
      return "Failed to parse response";
  }
};
```

## With Side Effects (Low-level API)

For more control, you can use `Task.attemptWith` directly with Effect:

```tsx
import { Effect, pipe } from "effect";
import { Cmd, Task } from "tea-effect";

type User = { id: number; name: string };

type Model = {
  users: User[];
  loading: boolean;
  error: string | null;
};

type Msg =
  | { type: "FetchUsers" }
  | { type: "FetchUsersSuccess"; users: User[] }
  | { type: "FetchUsersError"; error: string };

// API call as Effect
const fetchUsersApi: Effect.Effect<User[], Error> = pipe(
  Effect.tryPromise({
    try: () => fetch("/api/users").then((r) => r.json()),
    catch: (e) => new Error(String(e)),
  })
);

// Convert to Cmd using Task.attempt
const fetchUsersCmd: Cmd.Cmd<Msg> = Task.attemptWith({
  onSuccess: (users) => ({ type: "FetchUsersSuccess", users }),
  onFailure: (error) => ({ type: "FetchUsersError", error: error.message }),
})(fetchUsersApi);

const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case "FetchUsers":
      return [{ ...model, loading: true, error: null }, fetchUsersCmd];

    case "FetchUsersSuccess":
      return [{ ...model, loading: false, users: msg.users }, Cmd.none];

    case "FetchUsersError":
      return [{ ...model, loading: false, error: msg.error }, Cmd.none];
  }
};
```

## With Subscriptions

```tsx
import { Sub } from "tea-effect";
import { Stream } from "effect";

type Msg = { type: "Tick"; time: number } | { type: "KeyPressed"; key: string };

// Timer subscription
const timerSub: Sub.Sub<Msg> = pipe(
  Stream.fromSchedule(Schedule.spaced("1 second")),
  Stream.map(() => ({ type: "Tick", time: Date.now() }))
);

// Keyboard subscription
const keyboardSub: Sub.Sub<Msg> = Sub.fromCallback<Msg>((emit) => {
  const handler = (e: KeyboardEvent) =>
    emit({ type: "KeyPressed", key: e.key });
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
});

// Combine subscriptions based on model
const subscriptions = (model: Model): Sub.Sub<Msg> =>
  model.isRunning ? Sub.batch([timerSub, keyboardSub]) : Sub.none;
```

## With LocalStorage

```tsx
import { LocalStorage } from "tea-effect";
import { Schema, Option } from "effect";

// Define a schema for your stored data
const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  token: Schema.String,
});
type User = Schema.Schema.Type<typeof UserSchema>;

type Model = {
  user: Option.Option<User>;
};

type Msg =
  | { type: "LoadUser" }
  | { type: "UserLoaded"; user: Option.Option<User> }
  | { type: "SaveUser"; user: User }
  | { type: "Logout" }
  | { type: "UserChangedInOtherTab"; user: Option.Option<User> };

// Initial load from localStorage
const init: [Model, Cmd.Cmd<Msg>] = [
  { user: Option.none() },
  LocalStorage.get("user", UserSchema, (user) => ({
    type: "UserLoaded",
    user,
  })),
];

const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case "UserLoaded":
      return [{ ...model, user: msg.user }, Cmd.none];

    case "SaveUser":
      return [
        { ...model, user: Option.some(msg.user) },
        LocalStorage.set("user", UserSchema, msg.user),
      ];

    case "Logout":
      return [{ ...model, user: Option.none() }, LocalStorage.remove("user")];

    case "UserChangedInOtherTab":
      // Another tab logged in/out - sync state
      return [{ ...model, user: msg.user }, Cmd.none];
  }
};

// Subscribe to cross-tab changes
const subscriptions = (model: Model): Sub.Sub<Msg> =>
  LocalStorage.onChange("user", UserSchema, (user) => ({
    type: "UserChangedInOtherTab",
    user,
  }));
```

## With LocalStorage

```tsx
import { LocalStorage } from "tea-effect";
import { Schema, Option } from "effect";

// Define a schema for your stored data
const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  token: Schema.String,
});
type User = Schema.Schema.Type<typeof UserSchema>;

type Model = {
  user: Option.Option<User>;
};

type Msg =
  | { type: "LoadUser" }
  | { type: "UserLoaded"; user: Option.Option<User> }
  | { type: "SaveUser"; user: User }
  | { type: "Logout" }
  | { type: "UserChangedInOtherTab"; user: Option.Option<User> };

// Initial load from localStorage
const init: [Model, Cmd.Cmd<Msg>] = [
  { user: Option.none() },
  LocalStorage.get("user", UserSchema, (user) => ({
    type: "UserLoaded",
    user,
  })),
];

const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case "UserLoaded":
      return [{ ...model, user: msg.user }, Cmd.none];

    case "SaveUser":
      return [
        { ...model, user: Option.some(msg.user) },
        LocalStorage.set("user", UserSchema, msg.user),
      ];

    case "Logout":
      return [{ ...model, user: Option.none() }, LocalStorage.remove("user")];

    case "UserChangedInOtherTab":
      // Another tab logged in/out - sync state
      return [{ ...model, user: msg.user }, Cmd.none];
  }
};

// Subscribe to cross-tab changes
const subscriptions = (model: Model): Sub.Sub<Msg> =>
  LocalStorage.onChange("user", UserSchema, (user) => ({
    type: "UserChangedInOtherTab",
    user,
  }));
```

## With Dependencies (Dependency Injection)

```tsx
import { Effect, Context, Layer } from "effect";
import { Cmd, Task } from "tea-effect";

// Define a service
class ApiClient extends Context.Tag("ApiClient")<
  ApiClient,
  { getUsers: () => Effect.Effect<User[], Error> }
>() {}

// Use it in commands - the `R` type tracks dependencies
const fetchUsersCmd: Cmd.Cmd<Msg, never, ApiClient> = pipe(
  ApiClient,
  Effect.flatMap((api) => api.getUsers()),
  Task.attemptWith({
    onSuccess: (users) => ({ type: "FetchUsersSuccess", users }),
    onFailure: (error) => ({ type: "FetchUsersError", error: error.message }),
  })
);

// Provide the implementation at runtime
const ApiClientLive = Layer.succeed(ApiClient, {
  getUsers: () =>
    Effect.tryPromise(() => fetch("/api/users").then((r) => r.json())),
});

// Create runtime with dependencies
const runtime = pipe(Layer.toRuntime(ApiClientLive), Effect.runSync);

// Use in component with runtime
const { model, dispatch } = useProgram(init, update, subscriptions, {
  runtime,
});
```

## Module Structure

| Module         | Description                                                        |
| -------------- | ------------------------------------------------------------------ |
| `Cmd`          | Commands - descriptions of side effects                            |
| `Sub`          | Subscriptions - streams of external events                         |
| `Task`         | Tasks - side effects that produce values                           |
| `Http`         | HTTP requests with Schema validation (requires `@effect/platform`) |
| `Platform`     | Core runtime for TEA programs                                      |
| `Html`         | Programs with view rendering                                       |
| `React`        | React integration and hooks                                        |
| `LocalStorage` | Browser storage with Schema encoding                               |

## Migration from elm-ts

```typescript
// elm-ts
import { Cmd } from "elm-ts/lib/Cmd";
import { Task } from "elm-ts/lib/Task";
import { Observable } from "rxjs";

// tea-effect
import { Cmd, Task } from "tea-effect";
import { Effect, Stream } from "effect";
```

| elm-ts                          | tea-effect                                                              |
| ------------------------------- | ----------------------------------------------------------------------- |
| `Observable<Task<Option<Msg>>>` | `Effect<Option<Msg>, E, R>`                                             |
| `Task.perform(f)(task)`         | `Task.perform(f)(effect)`                                               |
| `Task.attempt(f)(taskEither)`   | `Task.attempt(f)(effect)`                                               |
| `Sub<Msg>` (Observable)         | `Sub<Msg>` (Stream)                                                     |
| `Http.send(decoder)(req)`       | `Http.send(req, { onSuccess, onError })`                                |
| `Http.get(url, decoder)`        | `Http.get(url, Http.expectJson(schema))`                                |
| `Http.post(url, body, decoder)` | `Http.post(url, Http.jsonBody(schema, value), Http.expectJson(schema))` |

## Roadmap

Track progress on [GitHub Projects](https://github.com/savkelita/tea-effect/projects) or see open [Pull Requests](https://github.com/savkelita/tea-effect/pulls).

### v0.2.0 (released)

- [x] **Http** - HTTP requests with Schema validation

### v0.3.0 (in progress)

- [ ] **Navigation** - Browser history and URL management
- [ ] **LocalStorage** - Browser storage with Schema encoding and cross-tab sync

### Future

- [ ] **Time** - Intervals, delays, timestamps
- [ ] **Random** - Random value generation as Cmd
- [ ] **WebSocket** - Real-time communication
- [ ] **Debug** - Time-travel debugging, action logging
- [ ] **Browser** - Viewport, visibility, focus events

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
