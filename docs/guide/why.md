# Why tea-effect

Most of the difficulty in a front-end application is not rendering. It is knowing
**where the state is**, **who is allowed to change it**, and **what happens when
something goes wrong halfway through**.

tea-effect answers those three questions with one architecture, taken from
[Elm](https://guide.elm-lang.org/architecture/), and one runtime,
[Effect](https://effect.website/).

## The architecture

There is a single `Model` holding all state. The only way it ever changes is a
`Msg` passing through a single `update` function.

```
      ┌──────────────────────────────────────────┐
      │                                          │
      ▼                                          │
   ┌───────┐   view    ┌──────┐  dispatch  ┌──────────┐
   │ Model │ ────────► │ Html │ ─────────► │   Msg    │
   └───────┘           └──────┘            └──────────┘
      ▲                                          │
      │                    update(msg, model)    │
      └──────────────────────────────────────────┘
                             │
                             │ returns [ Model, Cmd ]
                             ▼
                        ┌──────────┐
                        │ runtime  │  runs the Cmd, feeds the
                        └──────────┘  resulting Msg back in
                             ▲
                        ┌──────────┐
                        │   Sub    │  external events (timers, storage,
                        └──────────┘  the URL) enter the same way
```

Everything - a click, an HTTP response, a timer tick, a browser back button -
arrives as a `Msg` and goes through the same `update`. There is no second path
into the state, so "how did this value get here?" always has one answer.

## Side effects are values, not actions

This is the part that does the real work, and it is worth being precise about.

`update` does **not** perform the work. It returns a *description* of the work:

<<< @/examples/mental-model/Dice.tsx#update

::: details The complete file, imports included
<<< @/examples/mental-model/Dice.tsx
:::

`Task.perform(Rolled)(rollDie)` is a `Cmd<Msg>` - an inert value. The runtime is
what eventually executes it and feeds the resulting `Rolled` message back into
`update`.

Two consequences follow:

- **`update` is a pure function.** Testing it means calling it and comparing the
  result. No mocks, no fake timers, no test renderer.
- **Effects are inspectable.** A `Cmd` can be mapped, batched, or passed up to a
  parent module before anything runs.

The same holds for subscriptions. `subscriptions(model)` declares which external
sources should be live *for this model*, and the runtime diffs that against what
is currently running - starting and stopping only the difference.

## What Effect adds

TEA on its own says nothing about how effects run. That is where Effect comes in,
and it is why this library exists rather than being a 200-line reimplementation
of Redux.

A `Cmd<Msg, E, R>` is an `Effect` `Stream`. Those last two parameters are the point:

| | |
| --- | --- |
| `E` | What this command can fail with - in the type, checked at compile time. The failure surfaces on the program's model stream instead of vanishing into an unhandled rejection. |
| `R` | What services this command needs to run. A command that needs an `ApiClient` says so in its type, and the program will not compile until one is provided. |

On top of that you get the things Effect already solved: structured concurrency
(shutting a program down interrupts its in-flight commands and closes their
resources), retry and timeout policies, and `Schema` for validating data crossing
the boundary into your app.

The `Http` module uses all of it:

<<< @/examples/http/api.ts#requests

::: details The complete file, including the `User` schema
<<< @/examples/http/api.ts
:::

The response is decoded and validated against the `User` schema before it can
reach your `Model`. A malformed payload becomes a typed `BadBody` error, not an
`undefined` three components away from where it originated.

## How it compares

| | Redux / RTK | Zustand | tea-effect |
| --- | --- | --- | --- |
| Single source of state | Yes | Per-store | Yes |
| Pure state transition | Yes (reducer) | No (mutating setters) | Yes (`update`) |
| Side effects | Middleware / thunks / sagas | Inside setters or components | Values returned from `update` |
| Effect errors | Untyped | Untyped | In the type (`E`) |
| Effect dependencies | Manual wiring | Manual wiring | In the type (`R`) |
| Cancellation | Manual | Manual | Structured, automatic |
| Boundary validation | Bring your own | Bring your own | `Schema`, built in |

Against **elm-ts**, whose design tea-effect follows directly:

| | elm-ts | tea-effect |
| --- | --- | --- |
| Effect library | fp-ts + RxJS | Effect |
| Streaming | RxJS `Observable` | Effect `Stream` |
| Error handling | `Either<E, A>` | `Effect<A, E, R>` |
| Dependency injection | Reader pattern | Built-in `R` |
| Runtime validation | io-ts | `Schema` |
| Resource management | Manual | `Scope`, automatic |

## What tea-effect is not

Being clear about this saves you an evaluation:

- **It is not a framework.** No router-driven file layout, no build tooling, no
  opinions about your bundler. It is a runtime plus a set of modules.
- **It does not have its own virtual DOM.** `view` returns whatever your renderer
  understands. The React bindings are included; the core is generic.
- **It is not a drop-in replacement for local component state.** A `useState` for
  whether a tooltip is open is fine. tea-effect is for the state that features are
  built out of.

## When you should not use it

- Your team has no appetite for learning Effect. The `E`/`R` type parameters are
  the payoff, and they are also the learning curve. Budget for it honestly -
  see [Getting started](/guide/getting-started).
- The app is a thin CRUD shell where a data-fetching library plus local state
  already covers everything. TEA earns its keep when state transitions get
  genuinely complicated, not before.
- You need a large ecosystem of ready-made integrations today. This is a young
  library with a small surface.

## Where to go next

- [Getting started](/guide/getting-started) - install it and build a counter.
- [The mental model](/guide/mental-model) - `Model`, `Msg`, `Cmd`, `Sub`, and how
  the loop actually runs.
