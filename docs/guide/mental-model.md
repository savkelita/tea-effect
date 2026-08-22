# The mental model

If you internalise one page of this documentation, make it this one. Almost every
question about tea-effect - "where do I put this?", "why is my timer restarting?",
"how do I test this?" - has an answer that follows from the loop below.

## The loop

1. The runtime holds the current `Model`.
2. Something produces a `Msg`: a click calling `dispatch`, a command finishing, a
   subscription firing.
3. The runtime calls `update(msg, model)`, which returns `[nextModel, cmd]`.
4. The runtime stores `nextModel`, hands it to the renderer, and starts `cmd`.
5. When `cmd` produces a message, go to step 3.

That is the whole runtime. There is no other way for the model to change.

## Model: one place for state

`Model` is a single value describing everything the application needs to know
right now.

The useful discipline is to make illegal states unrepresentable. Rather than:

```ts
type Model = {
  loading: boolean
  users: ReadonlyArray<User>
  error: string | null
}
```

which permits `loading: true` with an `error` set and users present, prefer a
union that only allows the states that actually exist:

<<< @/examples/http/Users.tsx#model

Now the view cannot render a spinner and an error at the same time, because that
state cannot be constructed. That is the model from the
[HTTP guide's example](https://github.com/savkelita/tea-effect/blob/main/docs/examples/http/Users.tsx),
not an illustration.

## Msg: something that happened

A common mistake is writing messages as instructions - `SaveUser`, `ShowModal`.
Prefer messages that describe **facts**:

- `SaveButtonClicked`, not `SaveUser`
- `UsersReceived`, not `SetUsers`
- `RequestFailed`, not `ShowError`

The difference matters because `update` is the only place that decides what a
fact means. If the message already contains the decision, that logic has leaked
into the view, and you have two places where state changes are reasoned about.

## update: a pure function

```ts
(msg: Msg, model: Model) => readonly [Model, Cmd<Msg>]
```

It does not fetch, does not read the clock, does not touch `localStorage`. It
takes two values and returns two values.

This is what makes testing trivial:

```ts
const [next] = update({ type: 'Increment' }, { count: 0 })
expect(next).toEqual({ count: 1 })
```

No renderer, no mocks, no async.

## Cmd: a description of a side effect

A `Cmd<Msg, E, R>` is an inert value describing work that, once run, will produce
messages. `update` returns one; the runtime runs it.

Here is a die roll. First the task itself - still nothing has happened:

<<< @/examples/mental-model/Dice.tsx#task

::: tip `Task` and `Effect` are the same type
`Task<A, E, R>` is an alias for Effect's `Effect<A, E, R>` - not a wrapper, not a
conversion. The name exists because Elm calls this "a task", and tea-effect keeps
Elm's vocabulary where it helps.

That is why there is no `Task.sync`: you build tasks with Effect's own
constructors, and with anything else in the Effect ecosystem. The `Task` module
adds what Elm has and Effect does not - the conversions into `Cmd`
(`perform`, `attempt`, `attemptWith`) - plus Elm-named aliases for a few
combinators you already know.
:::

And `update` returning it:

<<< @/examples/mental-model/Dice.tsx#update

Read the `Roll` branch carefully. It does two things: it records that a roll is
in progress, and it hands the runtime a command. The random number does not
exist yet. It arrives later, as a `Rolled` message, and goes through `update`
like everything else.

::: details The complete file, imports included
<<< @/examples/mental-model/Dice.tsx
:::

The constructors you will use most:

| | |
| --- | --- |
| `Cmd.none` | Do nothing. |
| `Cmd.of(msg)` | Dispatch a message immediately. |
| `Cmd.fromEffect(effect)` | Turn any `Effect` producing a message into a command. |
| `Task.perform(f)(task)` | Run a task that cannot fail, map its result to a message. |
| `Task.attemptWith({ onSuccess, onFailure })(task)` | Run a task that can fail, map both outcomes to messages. |
| `Cmd.batch([a, b])` | Run several commands **concurrently**. |

::: warning Batched commands have no ordering guarantee
`Cmd.batch` merges its commands with unbounded concurrency, and their messages
arrive in whatever order they finish. This matches Elm. If B must happen after A,
express it in `update`: handle A's result message and return B's command from
there.
:::

## Sub: external events, declared

Commands are one-shot. Subscriptions are ongoing sources - timers, storage
events, URL changes, sockets.

`subscriptions` is a function of the model, and this is the important part: you
do not start or stop anything. You **declare what should be live right now**, and
the runtime works out the difference.

<<< @/examples/mental-model/Timer.tsx#subscriptions

Every time the model changes, the runtime compares the subscriptions you just
declared against the ones currently running, keyed by a stable identity. A
subscription that was there before and is there now keeps running untouched -
its timer is not reset, its DOM listener is not re-registered. Only the delta is
started or stopped.

This is why `Sub.interval(1000, Tick)` survives unrelated model changes: the key
is derived from the interval and the message, so it stays the same.

::: details The complete file, imports included
<<< @/examples/mental-model/Timer.tsx
:::

::: warning Custom sources need a key
`Sub.fromCallback(register)` without a `key` argument gets a fallback identity
tied to the stream object. Since `subscriptions(model)` typically builds a fresh
stream on each call, that means teardown and re-registration on every model
change. Pass a stable key - `Sub.fromCallback(register, 'my-socket')` - or wrap
an existing stream with `Sub.withKey`.
:::

## How a message actually reaches update

Worth knowing, because it explains behaviour you would otherwise find surprising.

**`dispatch` is synchronous.** When your click handler calls `dispatch`, `update`
runs and the renderer is called *before `dispatch` returns*, inside the same DOM
event.

This is deliberate. A renderer driving controlled inputs cannot afford a delay:
if the model arrived one tick late, the browser would already hold the newly
typed character while the view still carried the previous value, and the
reconciler would write the stale value back - moving the caret and clearing the
field's native undo history.

**Messages from commands and subscriptions are serialized.** They arrive on
fibers, so they pass through an internal queue first. The queue's job is to
guarantee they are applied one at a time and never interleave. It does not delay
them: as each message is taken off the queue it goes through the same
synchronous path a `dispatch` from the view takes.

**Two ways to observe the model.** `Program.subscribe(listener)` is the
synchronous path described above, and it is what rendering uses.
`Program.model$` is an Effect `Stream` carrying the same values, consumed on a
fiber, so it lands a tick later. Use `model$` for logging, devtools, or anything
that composes with other streams; use `subscribe` for rendering.

## Where errors go

`Cmd` and `Sub` carry Effect's error type `E`. When a command, a subscription, or
`update` itself fails, the failure surfaces on the program's `model$` stream
rather than disappearing into an unobserved fiber.

Two distinct concepts, easy to confuse:

- **Expected failures belong in your `Msg`.** An HTTP 404 is not a program crash;
  it is a `RequestFailed` message that `update` handles and stores in the model.
  This is what `Task.attemptWith` and `Http.send` are for, and it is why their
  commands have `E = never`.
- **`E` is for the genuinely exceptional** - the failure you did not model and
  that should tear the program down.

If you find yourself with a non-`never` `E`, ask whether that failure is really
unexpected, or whether it deserves a message.

## Composition

Modules compose by mapping messages. A parent embeds a child's model, and wraps
the child's messages in one of its own:

- `Cmd.map(f)` - re-label a child's commands
- `Sub.map(f)` - re-label a child's subscriptions
- `Html.map(f)` - re-label a child's view

::: warning Keep the tagger stable
`Html.map(f)` caches the mapped `dispatch` per `(f, dispatch)` pair, so a
memoised child can actually bail out of re-rendering. An inline arrow -
`Html.map((m) => ({ type: 'Child', m }))` written in the view - is a new
function on every render, a new cache key, and silently defeats it. Define the
tagger once at module level.
:::

## Summary

| Concept | Is | Is not |
| --- | --- | --- |
| `Model` | All the state, one value | Scattered across components |
| `Msg` | A fact that happened | An instruction |
| `update` | A pure function | A place to do I/O |
| `Cmd` | A description of one-shot work | The work itself |
| `Sub` | A declaration of what should be live | Something you start and stop |

## Next

- [Why tea-effect](/guide/why) - if you skipped it, the trade-offs are there.
- The Getting started counter, revisited: try adding the die roll to it.
