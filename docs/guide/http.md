# HTTP

The `Http` module follows Elm: a request is a **value**, and sending it produces a
`Cmd` whose messages carry either the decoded result or a typed error.

Everything on this page runs against
[JSONPlaceholder](https://jsonplaceholder.typicode.com), a free public test API.
Nothing below is a stand-in, apart from the test client in
[Against a stub client](#against-a-stub-client).

## Install

`Http` needs no extra package. It is built on Effect's `HttpClient`, which ships
inside `effect`, so the base install covers it:

```sh
npm install tea-effect effect
```

tea-effect no longer uses `@effect/platform`.

No client configuration is needed - `Http.send` and `Http.toTask` provide
Effect's `FetchHttpClient` themselves.

## Describing the data

Start with a schema. It is not documentation: it is the thing that decides
whether a response is allowed into your model.

<<< @/examples/http/api.ts#schema

A JSONPlaceholder user carries more fields than these - `address`, `phone`,
`company`, `website`. `Schema.Struct` ignores what you do not list, so your model
stays as small as the feature needs.

`expectJson` takes a `Schema.Decoder`, and `jsonBody` a `Schema.Codec`. A schema
passed inline, or left to inference as above, fits both. If you annotate one, use
`Schema.Codec<User>`. A value typed `Schema.Schema<User>` does not compile here:
that type tracks only the decoded type, not the services decoding needs.

Both functions go through the schema's JSON codec, `Schema.toCodecJson`. A
`Schema.Date` field travels as an ISO string, `Schema.BigInt` as a decimal
string, and `Schema.Option` as `{ _tag: 'Some', value }` or `{ _tag: 'None' }`.
A `Schema.optional` field that holds `undefined` is sent as `null`, and `null` in
a response decodes to `undefined`. Leave the key out when the server must not
see it.

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

When the schema rejects a value, `error` holds its `Schema.SchemaError` - from
decoding for `BadBody`, from encoding for `BadRequestBody`. A response that is
not JSON at all is a `BadBody` holding the `SyntaxError`.

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

## Against a stub client

A test should not depend on JSONPlaceholder being up. The client that `sendRaw`
and `toTaskRaw` leave in `R` is Effect's `HttpClient` - the same service
`FetchHttpClient` provides. A stub is an ordinary one, built with
`HttpClient.make`:

<<< @/examples/http/stub.test.ts#stub

To simulate a failure, fail with an `HttpClientError`. Its `reason` picks the
case: a `TransportError` is what a rejected `fetch` produces, and it becomes a
`NetworkError`.

::: details The complete file, imports included
<<< @/examples/http/stub.test.ts
:::

## Next

- [Dependency injection](/guide/dependency-injection) - putting the API behind a
  service so the feature does not know about HTTP at all.
- [Testing](/guide/testing) - running this command against a stub.
