# Dependency injection

A `Cmd<Msg, E, R>` has a third type parameter that has been `never` on every page
so far. `R` is what the command **needs in order to run** - and this is the part
of Effect that tea-effect gets for free and elm-ts had to emulate with the Reader
pattern.

The claim is small and checkable: a command that needs an API client says so in
its type, and the program does not compile until something provides one.

## Declaring a service

A service is a tag plus the shape behind it. Nothing here says how it is
implemented:

<<< @/examples/di/ApiClient.ts#service

## Implementing it

<<< @/examples/di/ApiClient.ts#live

That is the real JSONPlaceholder request from the [HTTP guide](/guide/http),
moved behind the service. The feature that uses `ApiClient` no longer knows that
HTTP is involved at all.

## Asking for it

Reaching for the service is an ordinary Effect:

<<< @/examples/di/Users.ts#cmd

Look at the annotation: `Cmd.Cmd<Msg, never, ApiClient>`. The requirement is now
part of the type. You cannot forget it, and you cannot accidentally run this
command without an implementation.

`update` itself is unchanged by any of this:

<<< @/examples/di/Users.ts#update

## Providing it

Where `R` gets discharged depends on how you mount the program.

### The program owns the root

Provide the layer to the Effect that runs it. (`view` here is this module's own
view function, unchanged by any of this - it is in the full file below.)

<<< @/examples/di/main.tsx#whole-app

### A program inside a React component

`useProgram` wants a `Runtime`, not a `Layer`:

<<< @/examples/di/main.tsx#hook

::: tip This is the error people hit first
When `R` is not `never`, the `runtime` option is **required** - the type of
`useProgram` changes shape to demand it. If you see TypeScript complaining about
a missing argument on a hook that used to take two, this is why: something in
your command tree started requiring a service.
:::

::: warning Synchronous versus asynchronous layers
`Effect.runSync(AppRuntime)` works because `Layer.succeed` builds synchronously.
A layer that opens a connection, reads configuration, or acquires any resource
cannot be built that way - use `await AppRuntime.runtime()`, which is a Promise,
and hold the result in state while it resolves.
:::

::: details The complete file, imports included
<<< @/examples/di/main.tsx
:::

## Why this beats a mock

Swapping the implementation is swapping a value:

<<< @/examples/di/ApiClient.ts#test

No mocking library, no module interception, no reset between tests. The same tag,
a different value behind it - and the compiler checks that the substitute has the
right shape.

[Testing](/guide/testing) uses exactly this layer.

## When not to bother

If a command only needs the network and nothing else, `Http.send` already gives
you `R = never` and there is nothing to inject. Reach for a service when you want
the **feature** to stop knowing where its data comes from - which is usually when
you want to test it, or when the same feature has to run against two backends.

## Next

- [Testing](/guide/testing) - the payoff.
- [Composition](/guide/composition) - `R` flows up through `Cmd.map` unchanged.
