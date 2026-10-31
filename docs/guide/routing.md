# Routing

Two modules cooperate here, and it helps to keep them apart:

- **`Router`** turns a URL into a typed value, and a typed value back into a URL.
  It knows nothing about the browser.
- **`Navigation`** deals with the browser: history entries, the back button,
  clicks on `<a>` elements.

You can use `Router` on its own - in a test, on a server - and that is a good
sign it is doing only one job.

## Defining routes

<<< @/examples/routing/routes.ts#routes

`Router.IntFromString` rather than `Schema.NumberFromString` is deliberate. In
Effect 4 the bare version turns any string into a number - `'abc'` becomes `NaN`
and `''` becomes `0` - so `/users/abc` would parse as a valid route with
`id: NaN`.

`RouteType` gives you the union the rest of the application matches on:

```ts
type Route =
  | { readonly _tag: 'home' }
  | { readonly _tag: 'users' }
  | { readonly _tag: 'user'; readonly params: { readonly id: number } }
  | { readonly _tag: 'search'; readonly query: { readonly q: string } }
```

Nobody wrote that type. It came from the route definitions, so it cannot drift
away from them.

## Parsing

Parsing can fail, so the page type is the routes plus one more case:

<<< @/examples/routing/routes.ts#page

`parse` returns an `Option` if you would rather handle the miss yourself;
`parseOr` takes the fallback directly.

Routes are tried in definition order, first match wins. Put the more specific
route first when two share a path shape.

## Formatting

The same definition that parses also formats:

<<< @/examples/routing/routes.ts#format

This is the payoff of bidirectional routing: the *shape* of a link cannot drift
from the parser, because both come from one definition. Change `/users/:id` to
`/people/:id` and every link changes with it.

The value still has to satisfy the param schema, though. `format` is total - when
the encoder rejects a value it falls back to `String(value)` - so `userUrl(3.14)`
type-checks, produces `/users/3.14`, and `parse` then refuses it. If you need the
round trip guaranteed, keep the validated value at the call site.

::: details The complete file, imports included
<<< @/examples/routing/routes.ts
:::

## Reacting to the browser

`Navigation` turns browser events into messages. Two of them matter:

- `onUrlRequest` - somebody clicked a link. The browser has **not** navigated
  yet, so you get to decide.
- `onUrlChange` - the URL has already changed, from `pushUrl` or from the back
  button.

<<< @/examples/routing/App.tsx#update

::: warning `pathname` is not the URL
`msg.request.location.pathname` for `/search?q=hello` is just `/search`. Passing
only that to `pushUrl` silently drops the query and the hash. Rebuild the URL
from all three parts, as above.
:::

Because the click is intercepted rather than followed, `LinkClicked` is where an
"unsaved changes" guard belongs - returning `Cmd.none` simply leaves the user
where they are.

## Which entry the user is on

The browser keeps a list of entries for each tab and knows which one it is
showing. A URL alone does not tell you that: the same address can be in the
list twice, and a change can come from a push, from back or from forward.
Every `Location` therefore says which entry it is:

- `state` - whatever `pushUrl` or `replaceUrl` stored with the entry. Back and
  forward hand it back.
- `index` - the entry's position. `Navigation.program` numbers the entry it
  starts on `0`, `pushUrl` adds one, `replaceUrl` keeps the position, and back
  and forward restore the position the browser kept.
- `key` - an id for the entry. Every `pushUrl` and `replaceUrl` gives the entry
  it writes a new key, and an entry the user returns to has the key it had when
  it was left.

None of this changes how a program works, and you can ignore all three. They
are there for decisions that need to know *which* entry the user is on:

- Compare the new `index` with the one in your model to tell back from forward.
- `back(n)` or `forward(n)` with the difference between two positions returns
  the user to an entry without adding a new one.
- Keep view state that does not belong in the URL - a selected row, an open
  panel - in your model under the `key` of the entry it belongs to, and give it
  back when that key comes back. It stays in the model; the browser only says
  which entry it is.

```ts
case 'UrlChanged': {
  // Remember the selection of the entry being left, under its key.
  const left = model.location.key
  const selections =
    left === null ? model.selections : { ...model.selections, [left]: model.selected }
  // Restore the selection of the entry being entered, if there was one.
  const selected = (msg.location.key === null ? undefined : selections[msg.location.key]) ?? []
  return [{ ...model, location: msg.location, selections, selected }, Cmd.none]
}
```

`index` and `key` are `null` for an entry tea-effect did not write - one made
by other code calling `history.pushState`, or stored by a version before
0.11.0 - and `index` stays `null` for entries pushed after such an entry,
because their position cannot be known. A link click is a request, not an
entry yet, so its location has neither.

tea-effect keeps the position and key next to your state inside
`history.state`, whose shape is therefore its own. Read your state through
`Location.state`, not from `window.history.state`.

## The view

<<< @/examples/routing/App.tsx#view

The switch is exhaustive over the generated union. Add a route to
`Router.routes` and this stops compiling until you handle it.

## Wiring it up

<<< @/examples/routing/App.tsx#program

`Navigation.program` subscribes to link clicks and URL changes for you, batches
them with any subscriptions of your own, and hands `init` the location the page
was opened at. It is the equivalent of Elm's `Browser.application`.

::: details The complete file, imports included
<<< @/examples/routing/App.tsx
:::

## Doing it by hand

If you would rather not use `Navigation.program`, subscribe yourself:

```ts
const subscriptions = (): Sub.Sub<Msg> =>
  Sub.batch([
    Navigation.linkClicks((request): Msg => ({ type: 'LinkClicked', request })),
    Navigation.urlChanges((location): Msg => ({ type: 'UrlChanged', location }))
  ])
```

`urlChanges` does **not** emit the initial location - read it with
`Navigation.getLocation()` in `init`.

Only `Navigation.program` numbers the entry it starts on, so without it every
`index` is `null`. Keys still work: each entry that `pushUrl` or `replaceUrl`
writes gets one.

## Next

- [Composition](/guide/composition) - giving each page its own module.
- [Gotchas](/guide/gotchas) - the routing mistakes worth knowing in advance.
