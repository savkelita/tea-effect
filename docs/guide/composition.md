# Composition

A single `Model`, a single `update` - and yet an application is not one file.
The way out is that a tea-effect module is just four exports, so a module can
contain another one.

The parent embeds the child's model, and re-labels the child's messages as its
own. Three functions do the re-labelling: `Cmd.map`, `Sub.map` and `Html.map`.

## The child

An ordinary module that knows nothing about any parent:

::: details Field.tsx
<<< @/examples/composition/Field.tsx
:::

## The tagger

The parent needs one function that wraps a child message in a parent message:

<<< @/examples/composition/Form.tsx#tagger

::: danger Keep it at module level
This placement is load-bearing, not style. `Html.map` caches the mapped dispatch
per `(f, dispatch)` pair so that a memoised child can bail out of re-rendering.
An inline arrow - `Html.map((msg) => ({ type: 'EmailMsg', msg }))` written inside
the view - is a **new function on every render**, so it is a new cache key every
time, and nothing below that boundary can ever be memoised.

Nothing breaks visibly. You just lose the optimisation silently.
:::

## Starting the child

<<< @/examples/composition/Form.tsx#init

Two moves, and they are the same two you will see in `update`: keep the child's
model in a field, re-label the child's command.

Here `Field.init` returns `Cmd.none`, and `Cmd.map` gives back `none` itself
rather than a wrapper around an empty stream - so "this branch does nothing"
stays visible after crossing the boundary.

## Delegating in update

<<< @/examples/composition/Form.tsx#update

Two things happen in the `EmailMsg` branch: the child's `update` runs on the
child's slice of the model, and the command it returned is re-labelled so its
messages come back to the parent.

Forgetting the `Cmd.map` is a type error, not a silent bug - the child's `Cmd`
does not fit the parent's signature.

## Delegating in the view

<<< @/examples/composition/Form.tsx#view

`Html.map(EmailMsg)(Field.view(model.email))` is an `Html<Dom, Form.Msg>` - a
function from dispatch to an element. Applying it to the parent's `dispatch`
renders the child with a dispatch that wraps everything it sends.

::: details The complete file, imports included
<<< @/examples/composition/Form.tsx
:::

## What flows through

| | |
| --- | --- |
| `Cmd.map(f)` | Re-labels a child's commands. `none` maps to `none` itself, so "this branch does nothing" survives the boundary. |
| `Sub.map(f)` | Re-labels a child's subscriptions, keeping their identity so a mapped timer is not restarted on every model change. |
| `Html.map(f)` | Re-labels a child's view. |

`E` and `R` pass through all three untouched. A child whose commands require an
`ApiClient` produces a parent whose commands require an `ApiClient` - the
requirement propagates up the tree on its own, and gets provided once at the
root. See [dependency injection](/guide/dependency-injection).

## How far to take it

Modules are cheap but not free: every level adds a message wrapper and a branch
in `update`. A reasonable rule is to split when a piece has **its own state and
its own effects** - a form, a page, a data table. A button does not need a
module; it needs a function that returns `Html`.

For pages, the natural shape is one module per route, with the parent's `Model`
holding the current page's model as a union:

```ts
type Page =
  | { readonly _tag: 'users'; readonly model: Users.Model }
  | { readonly _tag: 'settings'; readonly model: Settings.Model }
```

which pairs directly with the route union from [routing](/guide/routing).

## Next

- [Testing](/guide/testing) - a child module is tested without its parent.
- [Gotchas](/guide/gotchas).
