import { Effect, Layer, Stream } from 'effect'
import { HttpClient, HttpClientError, HttpClientResponse } from 'effect/unstable/http'
import { describe, expect, it } from 'vitest'
import * as Http from 'tea-effect/Http'
import { listUsers } from './api'
import type { Msg } from './Users'

// #region stub
// A stub is an ordinary HttpClient: a function from a request to a response.
const replyWith = (body: unknown) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, new Response(JSON.stringify(body))))
    )
  )

const offline = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request }) })
    )
  )
)

// sendRaw leaves HttpClient in `R`, so the test decides what answers.
const load = Http.sendRaw(listUsers, {
  onSuccess: (users): Msg => ({ type: 'UsersReceived', users }),
  onError: (error): Msg => ({ type: 'RequestFailed', error })
})

describe('a request against a stub client', () => {
  it('decodes what the stub returns', async () => {
    const user = { id: 1, name: 'Leanne Graham', username: 'Bret', email: 'Sincere@april.biz' }

    const messages = await Effect.runPromise(Stream.runCollect(load).pipe(Effect.provide(replyWith([user]))))

    expect(messages).toEqual([{ type: 'UsersReceived', users: [user] }])
  })

  it('turns a transport failure into a NetworkError', async () => {
    const messages = await Effect.runPromise(Stream.runCollect(load).pipe(Effect.provide(offline)))

    expect(messages).toMatchObject([{ type: 'RequestFailed', error: { _tag: 'NetworkError' } }])
  })
})
// #endregion stub
