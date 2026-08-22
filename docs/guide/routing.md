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

`Router.IntFromString` rather than `Schema.NumberFromString` is deliberate: the
bare version accepts `'NaN'` and `'Infinity'`, so `/users/NaN` would parse as a
valid route with `id: NaN`.

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

This is the payoff of bidirectional routing. A link built with `format` cannot
point at a URL your parser would reject, because both come from one definition.
Change `/users/:id` to `/people/:id` and every link changes with it.

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

## Next

- [Composition](/guide/composition) - giving each page its own module.
- [Gotchas](/guide/gotchas) - the routing mistakes worth knowing in advance.
