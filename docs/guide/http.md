# HTTP

The `Http` module follows Elm: a request is a **value**, and sending it produces a
`Cmd` whose messages carry either the decoded result or a typed error.

Everything on this page runs against
[JSONPlaceholder](https://jsonplaceholder.typicode.com), a free public test API.
Nothing below is a stand-in.

## Install

`Http` is the one module with an extra peer dependency:

```sh
npm install @effect/platform
```

No client configuration is needed - `Http.send` and `Http.toTask` provide
Effect's `FetchHttpClient` themselves.

## Describing the data

Start with a schema. It is not documentation: it is the thing that decides
whether a response is allowed into your model.

<<< @/examples/http/api.ts#schema

A JSONPlaceholder user carries more fields than these - `address`, `phone`,
`company`, `website`. `Schema.Struct` ignores what you do not list, so your model
stays as small as the feature needs.

## Describing the request

<<< @/examples/http/api.ts#requests

Note what has **not** happened: no request has been sent. `listUsers` is a value
you can pass around, store in a module, or hand to `Http.send` twice.

## Headers

Modifiers are ordinary `Request -> Request` functions, so a combination you use
everywhere can be named once:

<<< @/examples/http/api.ts#headers

For `Authorization` and `Content-Type` there are helpers - `bearerToken`,
`authorization`, `contentType`. Reach for `withHeader` when the library has none.

::: details The complete file, imports included
<<< @/examples/http/api.ts
:::

## Sending it

`Http.send` takes the request and a message for each outcome:

<<< @/examples/http/Users.tsx#update

The resulting `Cmd<Msg, never, never>` **cannot fail**. Its error type is `never`
because both outcomes were turned into messages - which is the rule from
[the mental model](/guide/mental-model#where-errors-go): an HTTP 404 is not a
program crash, it is a fact your `update` handles.

## The model that goes with it

Because failure is an ordinary message, the model can name every state exactly
once:

<<< @/examples/http/Users.tsx#model

Four states, no impossible combinations. `Loading` cannot carry an error;
`Failed` cannot also hold users.

## Handling errors

`HttpError` is a closed union of six cases, and the compiler makes you cover all
of them:

<<< @/examples/http/Users.tsx#errors

The two that get confused:

| | |
| --- | --- |
| `BadBody` | The response arrived, but it did not match your schema. |
| `BadRequestBody` | Encoding *your* payload failed, so no request was ever sent. |

::: details The complete file, imports included
<<< @/examples/http/Users.tsx
:::

## Choosing an entry point

| | Provides the client | Use it for |
| --- | --- | --- |
| `Http.send(req, handlers)` | Yes, `FetchHttpClient` | Normal application code |
| `Http.sendRaw(req, handlers)` | No - leaves `HttpClient` in `R` | Tests with a stub client |
| `Http.toTask(req)` | Yes | Composing with other Effects before it becomes a `Cmd` |
| `Http.toTaskRaw(req)` | No | The same, under test |

`sendBy(onSuccess, onError)(req)` is `send` with the arguments the other way
round, for pipelines.

## Next

- [Dependency injection](/guide/dependency-injection) - putting the API behind a
  service so the feature does not know about HTTP at all.
- [Testing](/guide/testing) - running this command against a stub.
