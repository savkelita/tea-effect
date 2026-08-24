# Testing

The tests on this page are a real file. They run in this repository's CI, under
`npm test`, alongside the library's own suite - so if something here is wrong,
the build goes red.

## Testing update

`update` is a function from two values to two values. That is the whole story:

<<< @/examples/testing/guide.test.ts#pure

No renderer, no test harness, no `act()`, nothing async. This is the single
biggest practical benefit of keeping side effects out of `update`, and it is why
the architecture insists on it.

## Testing commands

A `Cmd` is a `Stream` of messages, so running it and collecting what comes out is
an ordinary Effect operation:

<<< @/examples/testing/guide.test.ts#cmd

Notice the first assertion. The model records that a roll is in progress
immediately, while the number itself does not exist yet - it arrives later, as a
message. Testing those two things separately is exactly right, because the
runtime keeps them separate too.

## Testing a command that needs a service

This is where [dependency injection](/guide/dependency-injection) pays off:

<<< @/examples/testing/guide.test.ts#layer

`Users.update` returns a command whose `R` is `ApiClient`. Providing
`ApiClientTest` discharges it. There is no mocking library involved, no module
interception, and nothing to reset between tests - the substitute is a value, and
the compiler checks it has the right shape.

## Testing a whole program

When you want the loop itself under test, `Platform.program` gives you one
without any rendering:

<<< @/examples/testing/guide.test.ts#program

The assertion `[0, 1, 2, 1]` is worth pausing on. There is no `await`, no timer,
no flush - and the values are already there. `dispatch` runs `update` and
notifies subscribers **before it returns**, which is what makes tea-effect safe
for controlled inputs. Here it also makes the test boring, which is the point.

::: details The complete file, imports included
<<< @/examples/testing/guide.test.ts
:::

## What to test, and what not to

| Worth a test | Why |
| --- | --- |
| `update`, every branch | It is where all the logic lives, and it is free to test |
| Commands, via their messages | Confirms the right effect was *described* |
| A service's real implementation | Once, on its own - not through every feature |

| Not worth a test | Why |
| --- | --- |
| `view` output | It is a pure function of the model; assert on the model instead |
| That the runtime dispatches | That is the library's job, and the library tests it |
| Message constructors | `(x) => ({ type: 'X', x })` cannot be wrong |

## Setting it up in your own project

There is nothing to configure. `tea-effect` resolves from `node_modules` like any
dependency, and `update` is a plain function:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node'
  }
})
```

`environment: 'node'` is enough for everything on this page. You only need
`jsdom` if you test `Navigation` or `LocalStorage`, which touch `window`.

(This repository does add a path alias, but only because its documentation
examples import `tea-effect/...` from inside the package itself. You will not
need that.)

## Next

- [Gotchas](/guide/gotchas) - the failures that are worth knowing before you hit
  them.
