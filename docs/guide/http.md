# HTTP

The `Http` module follows Elm: a request is a **value**, and sending it produces a
`Cmd` whose messages carry either the decoded result or a typed error.

Everything on this page runs against
[JSONPlaceholder](https://jsonplaceholder.typicode.com), a free public test API.
Nothing below is a stand-in.

## Install

`Http` needs no extra package: it uses the HTTP client that ships inside `effect`.

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

## Answers that arrive out of order

`LoadRequested` above ignores a second click while the list loads, and that is
enough when the request cannot change. When it can - a search as the user types,
a list that follows a filter or a selection, a refresh - a new request can go out
before the last one answers, and answers need not arrive in the order the
requests went out. `update` cannot tell a late answer to an old request from the
answer to the current one, so whichever arrives last wins.

Put the command under a key with `Cmd.latest`:

<<< @/examples/http/Posts.ts#latest

When a command under a key starts, the runtime interrupts the one already
running under that key - its `fetch` is aborted - and drops every message of the
earlier command that `update` has not received yet, including one already
waiting its turn. `update` sees only the answer to the latest request, with no
request id in the model and no check in its branches.

What keeps it right:

- **Reads only.** A newer command cancels the earlier one, so a save never goes
  under a key.
- **One key per place the answer goes**, not per request: `'posts'` for the list
  above. A module shown in several places at once takes its key from its parent,
  since two places under one key would cancel each other.
- **`Cmd.map` and `Cmd.batch` keep the key**, and in one batch the last command
  with a key wins. A `Stream` operator applied by hand gives back a command
  without the key, which runs like any other.
- **`Cmd.latest(key)(Cmd.none)` stops** whatever runs under the key, for an
  answer that is no longer wanted.

Outside a program - running the command as a `Stream` in a test - nothing is
replaced, and every message arrives.

::: details The complete file, imports included
<<< @/examples/http/Posts.ts
:::

## Downloading a file

A file is a response like any other. Describe it with `Http.expectFile` and the
body arrives as a `File`:

<<< @/examples/http/api.ts#download

The name comes from `Content-Disposition` - `filename*` first, so a UTF-8 name
survives, then `filename` - and, without that header, from the last segment of
the URL. The type is the response's `Content-Type`.

To save it, hand the request to `File.Download.send`. The command fetches the
file and saves it the way a download link would; `update` hears only its name:

<<< @/examples/http/Export.ts#update

The file never passes through a message, so the model and the message history
stay small and serialisable. A failed request saves nothing and ends in
`onError` with an ordinary `HttpError`, so a server can answer a failed export
with the same JSON errors as any other route.

## Uploading a file

A file goes to the server as the body of the request - the whole body, or one
part of a `multipart/form-data` form:

<<< @/examples/http/api.ts#upload

`Http.fileBody` sends the file from disk with the file's own `Content-Type`.
`Http.multipartBody` takes `stringPart`, `filePart` and `bytesPart`; the browser
writes its `Content-Type`, boundary included, so do not set that header
yourself. For content the application built, `Http.stringBody` and
`Http.bytesBody` take the MIME type explicitly.

## Files from the user, and to the user

The rest of `File` works the same way, after Elm's `elm/file`.
`File.Download.text` and `File.Download.bytes` save content the application
built itself, and `File.Download.url` lets the browser download a URL straight
to disk. In the other direction, `File.Select.file` and `File.Select.files` ask
the user for files, and `File.toText`, `File.toBytes` and `File.toDataUrl` read
them.

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
