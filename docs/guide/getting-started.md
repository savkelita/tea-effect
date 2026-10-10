# Getting started

By the end of this page you will have a working counter and will have seen both
ways of mounting a tea-effect program into React.

Every TypeScript block below is imported from a real file under
[`docs/examples/`](https://github.com/savkelita/tea-effect/tree/main/docs/examples)
that is type-checked in CI. The `sh` and `json` blocks are written inline, and
nothing checks those.

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- TypeScript 5.9 or newer - Effect 4 requires it

tea-effect is ESM only. CommonJS code can still `require('tea-effect')` on the
Node versions above, because they can `require()` an ES module. Earlier
releases, such as 20.18 or 22.11, fail with `ERR_REQUIRE_ESM`.

## Install

```sh
npm install tea-effect effect
```

`effect` is a peer dependency, so you install it yourself.
tea-effect needs Effect 4.

`tea-effect/Http` needs no extra package: it uses the HTTP client that ships
inside `effect`.

`react` is also a peer, declared optional because only `tea-effect/React`
depends on it:

```sh
npm install react react-dom    # tea-effect/React needs these
```

::: tip Import from subpaths
`tea-effect`'s root entry re-exports every module, so `import { Cmd } from 'tea-effect'`
pulls in all of them, `Http` included. Importing the subpath - `tea-effect/Cmd`,
`tea-effect/React` and so on - pulls in only that module and what it depends on.

Every example in this documentation uses the subpath form.
:::

## tsconfig

tea-effect ships as ESM only, with an `exports` map, and a few of its guarantees
are only real under strict settings. Both matter here:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "ESNext.Disposable"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "jsx": "react-jsx"
  }
}
```

`ESNext.Disposable` is new with Effect 4. Effect's type declarations use
`Disposable`, `AsyncDisposable` and `Symbol.asyncDispose`, so without it
TypeScript reports three errors inside `node_modules/effect` as soon as a file
imports `effect` or any tea-effect module. `"lib": ["ESNext", "DOM"]` works too,
and so does `"skipLibCheck": true`. `ES2023` and `ES2024` are not enough. Keep
`DOM` either way: effect's declarations use web types such as `ReadableStream`
and `URL`.

`moduleResolution` has to be `bundler`, `nodenext` or `node16`. The last two
also need `module` changed from `ESNext`, for example to `nodenext`. `node10`
ignores the packages' `exports` maps, and Effect 4 has no `main` or `types`
field to fall back on - so neither `effect` nor the `tea-effect/X` subpath
imports this documentation is built on will resolve. With `"module": "node16"`,
importing tea-effect from a CommonJS file is error TS1479, because tea-effect has
no CommonJS build. `"module": "nodenext"` does not have this problem.

`strict` is also required by Effect 4. `jsx` is only needed if you write views in JSX.

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

Because `update` declares its return type and the switch has no `default`,
adding a message to the union and forgetting to handle it makes the function
fall off the end - a compile error under `strict`, rather than a silent no-op.

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

If you are adding tea-effect to an existing codebase, start with Option B - with
one caveat. Option A renders through `Program.subscribe`, inside `dispatch`.
The hook sets React state from `model$`, and that may happen inside `dispatch`
or after it returns - there is no guarantee either way. A late update is
visible on controlled text inputs, so give a feature that has them Option A
until the hook moves over. [The mental model](/guide/mental-model) explains why
the difference matters.

## Next

Read [The mental model](/guide/mental-model). The counter above deliberately has
no side effects, and side effects are where this architecture actually pays off.
