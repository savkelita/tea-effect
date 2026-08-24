# tea-effect

The Elm Architecture for TypeScript with [Effect](https://effect.website/).

A spiritual successor to [elm-ts](https://github.com/gcanti/elm-ts), replacing fp-ts/RxJS with the Effect ecosystem.

**[Documentation](https://savkelita.github.io/tea-effect/)** - guides, the mental model, and the gotchas worth knowing before you hit them.

## Why tea-effect?

- **Type-safe side effects** - Commands and subscriptions with full type inference
- **Elm-style HTTP** - Declarative requests with Schema validation
- **Dependency injection** - Effect's built-in `R` (requirements) for testable code
- **Structured concurrency** - Effect's runtime handles cancellation and resource cleanup
- **React integration** - Ready-to-use hooks for React applications

## Installation

```sh
npm install tea-effect effect
```

`effect` is a peer dependency. Two more are declared optional, because only one module each depends on them:

```sh
npm install @effect/platform   # tea-effect/Http needs this
npm install react react-dom    # tea-effect/React needs these
```

Note that the root entry re-exports every module, `Http` included, so `import { Cmd } from "tea-effect"` pulls `@effect/platform` in anyway. Import the subpath - `tea-effect/Cmd` - to keep it out.

## Differences from elm-ts

- `Effect` instead of `fp-ts` + `RxJS`
- `Schema` (from `effect`) instead of `io-ts` for runtime validation
- Http module with Elm-style API

## React

```tsx
import * as TeaReact from "tea-effect/React";
import { Effect } from "effect";
import { createRoot } from "react-dom/client";
import * as Counter from "./Counter";

const root = createRoot(document.getElementById("app")!);

Effect.runPromise(
  TeaReact.run(
    TeaReact.program(Counter.init, Counter.update, Counter.view),
    (dom) => root.render(dom),
  ),
);
```

## Counter Example

```tsx
// Counter.tsx
import * as Cmd from "tea-effect/Cmd";
import * as TeaReact from "tea-effect/React";

export type Model = { count: number };

export type Msg = { type: "Increment" } | { type: "Decrement" };

export const init: [Model, Cmd.Cmd<Msg>] = [{ count: 0 }, Cmd.none];

export const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case "Increment":
      return [{ count: model.count + 1 }, Cmd.none];
    case "Decrement":
      return [{ count: model.count - 1 }, Cmd.none];
  }
};

export const view =
  (model: Model): TeaReact.Html<Msg> =>
  (dispatch) => (
    <div>
      <button onClick={() => dispatch({ type: "Decrement" })}>-</button>
      <span>{model.count}</span>
      <button onClick={() => dispatch({ type: "Increment" })}>+</button>
    </div>
  );
```

## Http Example

tea-effect provides an Elm-inspired Http module for type-safe HTTP requests with Schema validation.

```tsx
// Users.tsx
import { Schema, Option, pipe } from "effect";
import * as Cmd from "tea-effect/Cmd";
import * as Http from "tea-effect/Http";
import * as TeaReact from "tea-effect/React";

const User = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
});

type User = Schema.Schema.Type<typeof User>;

export type Model = {
  users: ReadonlyArray<User>;
  loading: boolean;
  error: Option.Option<Http.HttpError>;
};

export type Msg =
  | { type: "FetchUsers" }
  | { type: "GotUsers"; users: ReadonlyArray<User> }
  | { type: "GotError"; error: Http.HttpError };

const fetchUsers = pipe(
  Http.get("/api/users", Http.expectJson(Schema.Array(User))),
  Http.withTimeout(5000),
);

const renderError = (error: Http.HttpError): string => {
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
      return `Invalid response: ${error.error}`;
    case "BadRequestBody":
      return `Invalid request body: ${error.error}`;
  }
};

const renderErrorMessage = (error: Option.Option<Http.HttpError>) =>
  pipe(
    error,
    Option.match({
      onNone: () => null,
      onSome: (e) => <p>{renderError(e)}</p>,
    }),
  );

export const init: [Model, Cmd.Cmd<Msg>] = [
  { users: [], loading: false, error: Option.none() },
  Cmd.none,
];

export const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case "FetchUsers":
      return [
        { ...model, loading: true, error: Option.none() },
        Http.send(fetchUsers, {
          onSuccess: (users): Msg => ({ type: "GotUsers", users }),
          onError: (error): Msg => ({ type: "GotError", error }),
        }),
      ];
    case "GotUsers":
      return [{ ...model, loading: false, users: msg.users }, Cmd.none];
    case "GotError":
      return [
        { ...model, loading: false, error: Option.some(msg.error) },
        Cmd.none,
      ];
  }
};

export const view =
  (model: Model): TeaReact.Html<Msg> =>
  (dispatch) => (
    <div>
      <button
        onClick={() => dispatch({ type: "FetchUsers" })}
        disabled={model.loading}
      >
        {model.loading ? "Loading..." : "Fetch Users"}
      </button>
      {renderErrorMessage(model.error)}
      <ul>
        {model.users.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </div>
  );
```

## Subscriptions Example

Subscriptions let you listen to external events like timers, keyboard, or WebSocket messages.

```tsx
// Timer.tsx
import * as Cmd from "tea-effect/Cmd";
import * as Sub from "tea-effect/Sub";
import * as TeaReact from "tea-effect/React";

export type Model = {
  seconds: number;
  running: boolean;
};

export type Msg = { type: "Tick" } | { type: "Toggle" } | { type: "Reset" };

export const init: [Model, Cmd.Cmd<Msg>] = [
  { seconds: 0, running: false },
  Cmd.none,
];

export const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case "Tick":
      return [{ ...model, seconds: model.seconds + 1 }, Cmd.none];
    case "Toggle":
      return [{ ...model, running: !model.running }, Cmd.none];
    case "Reset":
      return [{ ...model, seconds: 0 }, Cmd.none];
  }
};

export const subscriptions = (model: Model): Sub.Sub<Msg> =>
  model.running ? Sub.interval(1000, { type: "Tick" }) : Sub.none;

export const view =
  (model: Model): TeaReact.Html<Msg> =>
  (dispatch) => (
    <div>
      <p>{model.seconds}s</p>
      <button onClick={() => dispatch({ type: "Toggle" })}>
        {model.running ? "Stop" : "Start"}
      </button>
      <button onClick={() => dispatch({ type: "Reset" })}>Reset</button>
    </div>
  );
```

## elm-ts vs tea-effect

| Feature              | elm-ts          | tea-effect        |
| -------------------- | --------------- | ----------------- |
| FP library           | fp-ts           | Effect            |
| Streaming            | RxJS Observable | Effect Stream     |
| Error handling       | `Either<E, A>`  | `Effect<A, E, R>` |
| Dependency injection | Reader pattern  | Built-in `R` type |
| Runtime validation   | io-ts           | `Schema`          |
| Resource management  | Manual          | Scope (automatic) |

## Module Structure

| Module         | Description                                   |
| -------------- | --------------------------------------------- |
| `Cmd`          | Commands - side effects that produce messages |
| `Sub`          | Subscriptions - streams of external events    |
| `Task`         | Tasks - convert Effects to Commands           |
| `Http`         | HTTP requests with Schema validation          |
| `LocalStorage` | Browser storage with Schema encoding          |
| `Navigation`   | Browser history and URL management            |
| `Router`       | Type-safe URL routing with Schema validation  |
| `Platform`     | Core TEA program runtime                      |
| `Html`         | Programs with view rendering                  |
| `React`        | React integration and hooks                   |

## Requirements

- Node.js 18+
- TypeScript 5.3+
- tsconfig.json:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "jsx": "react-jsx"
  }
}
```

`moduleResolution` has to be `bundler`, `node16` or `nodenext` - the `node10` default ignores the package's `exports` map, and the `tea-effect/X` subpath imports above will not resolve. `jsx` is only needed if you write views in JSX.

## Examples

- [tea-effect-realworld](https://github.com/savkelita/tea-effect-realworld) - Real-world examples with Counter, Http, and Subscriptions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
