# Gotchas

Every item here is something the library really does. Most were found by reading
the source or by making the compiler complain; several are documented because
they fail **silently**, which is the worst kind.

## Silent failures

These compile, run, and do the wrong thing. Read this section even if you skip
the rest.

### An inline tagger defeats memoisation

```ts
// Wrong: a new function on every render
{Html.map((msg) => ({ type: 'EmailMsg', msg }))(Field.view(model.email))(dispatch)}

// Right: one function, defined once
const EmailMsg = (msg: Field.Msg): Msg => ({ type: 'EmailMsg', msg })
```

`Html.map` caches the mapped dispatch per `(f, dispatch)` pair, so a memoised
child can bail out of re-rendering. An inline arrow is a new cache key every
render, so nothing below that boundary ever bails out. Nothing breaks - you just
lose the optimisation with no warning. See [composition](/guide/composition).

### A subscription without a stable key is torn down every time

```ts
// Wrong: re-registered on every model change
Sub.fromCallback(register)

// Right
Sub.fromCallback(register, 'my-socket')
```

The runtime keeps subscriptions alive by diffing them on a stable key. Library
constructors like `Sub.interval` derive one for you. A raw `fromCallback` without
a key falls back to an identity tied to the stream object - and since
`subscriptions(model)` usually builds a fresh stream each call, that means
teardown and re-registration on every message. Timers restart, listeners churn.

`Sub.withKey('key', stream)` does the same for a stream you built yourself.

### `pathname` is not the URL

```ts
// Wrong: /search?q=hello navigates to /search
Navigation.pushUrl(msg.request.location.pathname)

// Right
const { pathname, search, hash } = msg.request.location
Navigation.pushUrl(`${pathname}${search}${hash}`)
```

The query string and hash are separate fields on `Location`. Dropping them loses
exactly the information a search or filter page depends on.

### `NumberFromString` accepts `NaN`

```ts
// Wrong: /users/NaN parses as a valid route
Router.path('/users/:id', { id: Schema.NumberFromString })

// Right
Router.path('/users/:id', { id: Router.IntFromString })
```

`Schema.NumberFromString` accepts `'NaN'`, `'Infinity'` and non-integers.
`Router.IntFromString` exists for this reason.

### Batched commands have no ordering

`Cmd.batch` merges with unbounded concurrency and messages arrive in whatever
order they finish. This matches Elm. If B must happen after A, do not batch them:
handle A's result message in `update` and return B's command from there.

## Compile-time surprises

These fail loudly - but the message is not always obvious.

### `useProgram` grows a required argument

When your commands or subscriptions require a service - that is, `R` is no longer
`never` - `makeUseProgram`'s signature changes shape to demand
`options.runtime`. A hook that took two arguments yesterday now needs four.

That is intentional: without the runtime there is no way to satisfy `R`. See
[dependency injection](/guide/dependency-injection).

### `expectJson` rejects schemas that transform

```ts
// Does not compile
Http.expectJson(Schema.Struct({ n: Schema.NumberFromString }))
// Type 'string' is not assignable to type 'number'
```

`Http.expectJson` takes `Schema.Schema<A>`, which means encoded and decoded types
must be the same. A schema that converts on the way in - `NumberFromString`,
`DateFromString` - does not fit. Decode the plain shape, then convert in
`update`, or use `expectWhatever` and decode yourself.

### `HttpError` has six cases

`BadUrl`, `Timeout`, `NetworkError`, `BadStatus`, `BadBody`, `BadRequestBody`.
An exhaustive `switch` is a feature here: `BadRequestBody` was added in 0.7.0 and
every existing switch failed to compile until it was handled, which is precisely
what you want.

The pair people confuse: **`BadBody`** is a response that did not match your
schema; **`BadRequestBody`** is your own payload failing to encode, meaning no
request was sent at all.

## Things that are true but surprising

### The root import pulls in `@effect/platform`

`import { Cmd } from 'tea-effect'` loads every module, including `Http`, which
imports `@effect/platform`. In CommonJS it throws outright if the package is
missing.

Import the subpath - `tea-effect/Cmd` - and it stays out. Every subpath except
`tea-effect/Http` builds without it.

### `urlChanges` does not emit the current URL

It reports *changes*. Read the starting location with `Navigation.getLocation()`
in `init`. `Navigation.program` does this for you.

### `LocalStorage.onChange` captures its handlers once

The subscription is keyed and kept alive across model changes, so the
`onSuccess` / `onError` you pass are the ones from the first render. Have them
produce a plain message and read model-dependent data in `update`, which always
sees the current model.

### `makeUseProgram` is a factory

Call it once at module level. Calling it inside a component body builds a new
hook on every render.

### Messages dispatched after unmount are dropped

`useProgram` buffers up to 1024 messages dispatched *before* the program starts
(a child's mount effect, say) and flushes them in order. After unmount it drops
them instead - buffering there would grow without bound if something retained the
dispatch function.

### A route parameter is a whole segment

`:id` is recognised only when the segment starts with `:`. `/users/user-:id` is a
literal segment, not a capture.

### `model$` arrives a tick after `subscribe`

`Program.subscribe` is synchronous - the listener runs inside `dispatch`, before
it returns. `Program.model$` carries the same values through a `Stream` consumed
on a fiber, so it lands later.

Use `subscribe` for rendering; use `model$` for logging, devtools, or anything
that composes with other streams. Rendering from `model$` reintroduces the
one-tick delay that breaks controlled inputs.

## Next

- [Testing](/guide/testing) - several of these are things a test would have
  caught.
- [The mental model](/guide/mental-model) - most of the surprises above follow
  from the loop.
