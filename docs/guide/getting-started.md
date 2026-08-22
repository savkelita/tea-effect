# Getting started

By the end of this page you will have a working counter and will have seen both
ways of mounting a tea-effect program into React.

Every code block below is imported from a real file under
[`docs/examples/`](https://github.com/savkelita/tea-effect/tree/main/docs/examples)
that is type-checked in CI. If it appears here, it compiles.

## Requirements

- Node.js 18 or newer
- TypeScript 5.3 or newer

## Install

```sh
npm install tea-effect effect
```

`effect` is a peer dependency, so you install it yourself and control its version.

Two more peers are declared optional, because only one module each depends on them:

```sh
npm install @effect/platform   # tea-effect/Http needs this
npm install react react-dom    # tea-effect/React needs these
```

::: warning The root entry pulls `@effect/platform` in anyway
`tea-effect`'s root entry re-exports every module, `Http` included, and `Http`
imports `@effect/platform`. So `import { Cmd } from 'tea-effect'` loads it too,
even if you never make a request - and in CommonJS it throws outright when the
package is missing.

Importing the subpath keeps it out: `tea-effect/Cmd`, `tea-effect/Sub`,
`tea-effect/Task`, `tea-effect/Platform`, `tea-effect/Html`, `tea-effect/React`,
`tea-effect/Router`, `tea-effect/Navigation` and `tea-effect/LocalStorage` all
build without it. Only `tea-effect/Http` requires it.

Every example in this documentation uses the subpath form for that reason.
:::

## tsconfig

tea-effect leans on precise types, and a few of its guarantees are only real
under strict settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "jsx": "react-jsx"
  }
}
```

`jsx` is only needed if you write views in JSX.

## The four pieces

A tea-effect module is four exports. Here they are one at a time.

### 1. Model - all the state

<<< @/examples/counter/Counter.tsx#model

### 2. Msg - everything that can happen

A discriminated union. If it can change the state, it is in here.

<<< @/examples/counter/Counter.tsx#msg

### 3. init - where you start

A pair: the initial model, and a command to run immediately. `Cmd.none` means
"nothing to do on startup".

<<< @/examples/counter/Counter.tsx#init

### 4. update - the only place state changes

Takes a message and the current model, returns the next model and a command.
Note that it is an ordinary function - no framework, no `this`, nothing async.

<<< @/examples/counter/Counter.tsx#update

Because the `Msg` union is exhaustive and `noFallthroughCasesInSwitch` is on,
adding a new message and forgetting to handle it is a compile error rather than
a silent no-op.

### And a view

`view` takes the model and returns an `Html<Msg>` - which is itself a function
from `dispatch` to a rendered element. That extra layer is what lets a parent
re-label a child's messages with `Html.map`.

<<< @/examples/counter/Counter.tsx#view

::: details The complete file, imports included
Each block above is an excerpt. This is the whole module, so you can see where
`Cmd` and `TeaReact` come from:

<<< @/examples/counter/Counter.tsx
:::

## Running it

There are two ways to mount a program, and picking the right one matters.

### Option A: the program owns the root

Use this when tea-effect drives the whole application.

<<< @/examples/counter/main.tsx

`TeaReact.program` builds the program, `TeaReact.run` starts it and hands every
rendered view to your renderer. The result is an `Effect`, so nothing runs until
you execute it - here with `Effect.runPromise`.

### Option B: a program inside a React component

Use this when tea-effect powers one feature inside an existing React app.

<<< @/examples/counter/CounterComponent.tsx

::: warning Create the hook once
`makeUseProgram(React)` is a factory. Call it at module level and reuse the
result. Calling it inside a component body creates a new hook on every render.
:::

::: tip When your commands need services
If your commands or subscriptions require services - that is, `R` is not `never` -
`useProgram` requires an `options.runtime` argument, and TypeScript will enforce
it at compile time. Building that runtime from a `Layer` is covered in the
dependency injection guide.
:::

## Which one should I use?

| | `React.run` | `makeUseProgram` |
| --- | --- | --- |
| Owns the render root | Yes | No |
| Lives inside a React tree | No | Yes |
| Lifecycle | You control it | Tied to component mount/unmount |
| Good for | Whole app | One feature, incremental adoption |

If you are adding tea-effect to an existing codebase, start with Option B.

## Next

Read [The mental model](/guide/mental-model). The counter above deliberately has
no side effects, and side effects are where this architecture actually pays off.
