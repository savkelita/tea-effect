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

### `NumberFromString` accepts any string

```ts
// Wrong: /users/abc parses as a valid route, with id NaN
Router.path('/users/:id', { id: Schema.NumberFromString })

// Right
Router.path('/users/:id', { id: Router.IntFromString })
```

In Effect 4, `Schema.NumberFromString` is plain `Number()` coercion: `'abc'`
becomes `NaN` and `''` becomes `0`. So `/users/abc` matches with `id: NaN`, and
`?page=` matches with `page: 0`. `'Infinity'` and non-integers get through too.
`Router.IntFromString` rejects all of these, which is why it exists.

The same holds for a `NumberFromString` field in `Http.expectJson`: `"abc"` in
the response decodes to `NaN` rather than failing.

### `Schema.Date` in a query never matches

```ts
// Wrong: /log?from=2024-01-02 never matches
Router.path('/log').query(Schema.Struct({ from: Schema.Date }))

// Right
Router.path('/log').query(Schema.Struct({ from: Schema.DateFromString }))
```

In Effect 4, `Schema.Date` expects a `Date` object and rejects strings. Query
values arrive as strings, so the route never matches and the page falls through
to your fallback. `Schema.DateFromString` parses the string - it is what Effect 3
called `Schema.Date`. As a path param, `Schema.Date` does not compile.

`Schema.UUID` is gone too, but that one fails to compile.
`Schema.String.check(Schema.isGUID())` accepts the same ids. `Schema.isUUID()` is
stricter: it also checks the version and variant digits.

### Batched commands have no ordering

`Cmd.batch` merges with unbounded concurrency and messages arrive in whatever
order they finish. This matches Elm. If B must happen after A, do not batch them:
handle A's result message in `update` and return B's command from there.

## Compile-time surprises

These fail loudly - but the message is not always obvious.

### `useProgram` grows a required argument

When your commands or subscriptions require a service - that is, `R` is no longer
`never` - `makeUseProgram`'s signature changes shape to demand
`options.runtime`. A hook that took two arguments yesterday now needs four. The
error does not mention the runtime: it says `Expected 4 arguments, but got 2`,
and its note says `An argument for 'subscriptions' was not provided.`

That is intentional: without the runtime there is no way to satisfy `R`. Pass the
`ManagedRuntime` itself - `{ runtime: AppRuntime }` - or a `Context` you already
hold. `Effect.runSync(AppRuntime)` no longer compiles. See
[dependency injection](/guide/dependency-injection).

### A schema annotated `Schema.Schema<A>` is rejected

```ts
// Does not compile
const Annotated: Schema.Schema<{ readonly id: number }> = Schema.Struct({ id: Schema.Number })
Http.expectJson(Annotated)
// Type 'unknown' is not assignable to type 'never'.

// Compiles
const User = Schema.Struct({ id: Schema.Number })
Http.expectJson(User)
```

In Effect 4, `Schema.Schema<A>` records only the decoded type - its encoded type
and the services it needs are `unknown`. `Http.expectJson` takes a
`Schema.Decoder<A>`, and `jsonBody`, `LocalStorage` and `Router` take a
`Schema.Codec<A, I>`, so the annotation throws away what they check. Leave it off
and let inference keep the full type. If you want one, `Schema.Codec<A, I>` fits
everywhere, and `Schema.Decoder<A>` is enough for `expectJson`.

Schemas that transform are fine: `expectJson` accepts a struct with
`NumberFromString` or `DateFromString` fields. A `Schema.Date` field works too,
unlike in a route query: `Http` reads JSON through `Schema.toCodecJson`, which
decodes an ISO string into a `Date`.

### `HttpError` has six cases

`BadUrl`, `Timeout`, `NetworkError`, `BadStatus`, `BadBody`, `BadRequestBody`.
An exhaustive `switch` is a feature here: `BadRequestBody` was added in 0.7.0 and
every existing switch failed to compile until it was handled, which is precisely
what you want.

The pair people confuse: **`BadBody`** is a response that did not match your
schema; **`BadRequestBody`** is your own payload failing to encode, meaning no
request was sent at all.

### Errors inside `effect`'s own declarations

```text
error TS2304: Cannot find name 'AsyncDisposable'.
error TS2304: Cannot find name 'Disposable'.
error TS2550: Property 'asyncDispose' does not exist on type 'SymbolConstructor'. Do you need to change your target library? Try changing the 'lib' compiler option to 'esnext' or later.
```

All three point into `node_modules/effect`. Effect 4's declarations use
`Disposable`, `AsyncDisposable` and `Symbol.asyncDispose`, so with
`"lib": ["ES2022", "DOM"]` and no `skipLibCheck` they appear as soon as you
import any tea-effect module. `ES2023` and `ES2024` do not help. Add
`"ESNext.Disposable"` to `lib`, as in [the tsconfig](/guide/getting-started#tsconfig),
or use `"ESNext"` in place of `"ES2022"`.

## Things that are true but surprising

### The root import loads every module

`import { Cmd } from 'tea-effect'` loads every module, `Http` included, and with
it the HTTP client code from `effect` that `Http` imports. That code ships inside
`effect`, so there is nothing extra to install, but it is in your graph.

Import the subpath - `tea-effect/Cmd` - and it stays out. The same holds for
every subpath except `tea-effect/Http`.

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

### Only `subscribe` is synchronous

`Program.subscribe` is synchronous - the listener runs inside `dispatch`, before
it returns. `Program.model$` carries the same values through a `Stream` consumed
on a fiber, so when a value lands depends on that fiber. An idle consumer often
gets it inside `dispatch`, even before the `subscribe` listeners. One that has not
started yet, or is still busy with the previous value, gets it after `dispatch`
returns.

Use `subscribe` for rendering; use `model$` for logging, devtools, or anything
that composes with other streams. Rendering from `model$` gives up the guarantee
that controlled inputs need.

`React.run` renders through `subscribe` and is synchronous. `makeUseProgram`
does not: it sets React state from `model$`, so the hook's re-render has no such
guarantee. A feature mounted through the hook that owns controlled text inputs
should mount through `React.run` instead.

## Next

- [Testing](/guide/testing) - several of these are things a test would have
  caught.
- [The mental model](/guide/mental-model) - most of the surprises above follow
  from the loop.
