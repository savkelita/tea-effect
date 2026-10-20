import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Schema, pipe, Effect, Result } from 'effect'
import * as Http from '../src/Http'

describe('Http', () => {
  describe('error constructors', () => {
    it('should create BadUrl error', () => {
      const error = Http.badUrl('invalid-url')
      expect(error).toEqual({ _tag: 'BadUrl', url: 'invalid-url' })
    })

    it('should create Timeout error', () => {
      expect(Http.timeout).toEqual({ _tag: 'Timeout' })
    })

    it('should create NetworkError', () => {
      const error = Http.networkError(new Error('network failed'))
      expect(error._tag).toBe('NetworkError')
      expect(error).toHaveProperty('error')
    })

    it('should create BadStatus error', () => {
      const error = Http.badStatus(404, 'Not Found')
      expect(error).toEqual({ _tag: 'BadStatus', status: 404, body: 'Not Found' })
    })

    it('should create BadBody error', () => {
      const error = Http.badBody('invalid json')
      expect(error).toEqual({ _tag: 'BadBody', error: 'invalid json' })
    })
  })

  describe('expectations', () => {
    it('should create expectJson with decoder', () => {
      const UserSchema = Schema.Struct({
        id: Schema.Number,
        name: Schema.String
      })
      const expect_ = Http.expectJson(UserSchema)
      expect(expect_._tag).toBe('ExpectJson')
      expect(expect_.decoder).toBe(UserSchema)
    })

    it('should have expectString', () => {
      expect(Http.expectString._tag).toBe('ExpectString')
    })

    it('should have expectWhatever', () => {
      expect(Http.expectWhatever._tag).toBe('ExpectJson')
    })

    it('should have expectFile', () => {
      expect(Http.expectFile._tag).toBe('ExpectFile')
    })
  })

  describe('body constructors', () => {
    it('should create emptyBody', () => {
      expect(Http.emptyBody._tag).toBe('EmptyBody')
    })

    it('should create jsonBody with schema encoder', () => {
      const UserInput = Schema.Struct({ name: Schema.String })
      const body = Http.jsonBody(UserInput, { name: 'John' })
      expect(body._tag).toBe('JsonBody')
      if (body._tag === 'JsonBody') {
        expect(body.value).toEqual({ name: 'John' })
        expect(body.encoder).toBeDefined()
      }
    })

    it('should create rawBody without encoder', () => {
      const body = Http.rawBody({ name: 'John' })
      expect(body._tag).toBe('JsonBody')
      if (body._tag === 'JsonBody') {
        expect(body.value).toEqual({ name: 'John' })
        expect(body.encoder).toBeUndefined()
      }
    })
  })

  describe('request constructors', () => {
    it('should create GET request with empty body', () => {
      const req = Http.get('/api/users', Http.expectString)
      expect(req.method).toBe('GET')
      expect(req.url).toBe('/api/users')
      expect(req.headers).toEqual([])
      expect(req.body._tag).toBe('EmptyBody')
    })

    it('should create POST request with jsonBody', () => {
      const UserInput = Schema.Struct({ name: Schema.String })
      const req = Http.post('/api/users', Http.jsonBody(UserInput, { name: 'John' }), Http.expectString)
      expect(req.method).toBe('POST')
      expect(req.url).toBe('/api/users')
      expect(req.body._tag).toBe('JsonBody')
      if (req.body._tag === 'JsonBody') {
        expect(req.body.value).toEqual({ name: 'John' })
        expect(req.body.encoder).toBeDefined()
      }
    })

    it('should create POST request with rawBody', () => {
      const req = Http.post('/api/users', Http.rawBody({ name: 'John' }), Http.expectString)
      expect(req.method).toBe('POST')
      expect(req.body._tag).toBe('JsonBody')
      if (req.body._tag === 'JsonBody') {
        expect(req.body.value).toEqual({ name: 'John' })
        expect(req.body.encoder).toBeUndefined()
      }
    })

    it('should create PUT request with body', () => {
      const req = Http.put('/api/users/1', Http.rawBody({ name: 'Jane' }), Http.expectString)
      expect(req.method).toBe('PUT')
      expect(req.body._tag).toBe('JsonBody')
    })

    it('should create PATCH request with body', () => {
      const req = Http.patch('/api/users/1', Http.rawBody({ name: 'Jane' }), Http.expectString)
      expect(req.method).toBe('PATCH')
      expect(req.body._tag).toBe('JsonBody')
    })

    it('should create DELETE request with empty body', () => {
      const req = Http.del('/api/users/1', Http.expectString)
      expect(req.method).toBe('DELETE')
      expect(req.body._tag).toBe('EmptyBody')
    })

    it('should create custom request', () => {
      const req = Http.request({
        method: 'OPTIONS',
        url: '/api/test',
        headers: [Http.header('X-Custom', 'value')],
        expect: Http.expectString,
        timeout: 5000,
        withCredentials: true
      })
      expect(req.method).toBe('OPTIONS')
      expect(req.headers).toHaveLength(1)
      expect(req.timeout).toBe(5000)
      expect(req.withCredentials).toBe(true)
    })
  })

  describe('request modifiers', () => {
    it('should add header with withHeader', () => {
      const req = pipe(
        Http.get('/api/users', Http.expectString),
        Http.withHeader('Authorization', 'Bearer token')
      )
      expect(req.headers).toHaveLength(1)
      expect(req.headers[0]).toEqual({ name: 'Authorization', value: 'Bearer token' })
    })

    it('should add multiple headers with withHeaders', () => {
      const req = pipe(
        Http.get('/api/users', Http.expectString),
        Http.withHeaders([
          Http.header('X-First', 'one'),
          Http.header('X-Second', 'two')
        ])
      )
      expect(req.headers).toHaveLength(2)
    })

    it('should set timeout with withTimeout', () => {
      const req = pipe(
        Http.get('/api/users', Http.expectString),
        Http.withTimeout(10000)
      )
      expect(req.timeout).toBe(10000)
    })

    it('should enable credentials with withCredentials', () => {
      const req = pipe(
        Http.get('/api/users', Http.expectString),
        Http.withCredentials
      )
      expect(req.withCredentials).toBe(true)
    })

    it('should chain multiple modifiers', () => {
      const req = pipe(
        Http.get('/api/users', Http.expectString),
        Http.withHeader('Authorization', 'Bearer token'),
        Http.withTimeout(5000),
        Http.withCredentials
      )
      expect(req.headers).toHaveLength(1)
      expect(req.timeout).toBe(5000)
      expect(req.withCredentials).toBe(true)
    })
  })

  describe('header helpers', () => {
    it('should create a header', () => {
      const h = Http.header('X-Custom', 'value')
      expect(h).toEqual({ name: 'X-Custom', value: 'value' })
    })

    it('should create Content-Type header', () => {
      const h = Http.contentType('application/json')
      expect(h).toEqual({ name: 'Content-Type', value: 'application/json' })
    })

    it('should create Authorization header', () => {
      const h = Http.authorization('Basic abc123')
      expect(h).toEqual({ name: 'Authorization', value: 'Basic abc123' })
    })

    it('should create Bearer token header', () => {
      const h = Http.bearerToken('my-token')
      expect(h).toEqual({ name: 'Authorization', value: 'Bearer my-token' })
    })
  })

  describe('Request type', () => {
    it('should be composable with Elm-like pattern', () => {
      const UserSchema = Schema.Struct({
        id: Schema.Number,
        name: Schema.String
      })

      // Create request
      const fetchUsers = Http.get('/api/users', Http.expectJson(Schema.Array(UserSchema)))

      // Modify request
      const authedRequest = pipe(
        fetchUsers,
        Http.withHeader('Authorization', 'Bearer token')
      )

      expect(authedRequest.method).toBe('GET')
      expect(authedRequest.url).toBe('/api/users')
      expect(authedRequest.headers).toHaveLength(1)
    })
  })

  // Regression tests for audited bugs (see AUDIT.md). Stubs global fetch so the
  // real FetchHttpClient path (toTask) is exercised end-to-end.
  describe('AUDIT regressions', () => {
    const origFetch = globalThis.fetch
    let lastInit: RequestInit | undefined
    let fetchCalls = 0

    beforeEach(() => {
      lastInit = undefined
      fetchCalls = 0
      globalThis.fetch = (async (input: any, init: any) => {
        fetchCalls++
        lastInit = init
        const url = String(input?.url ?? input)
        if (url.includes('/text')) return new Response('OK', { status: 200, headers: { 'content-type': 'text/plain' } })
        if (url.includes('/notmod')) return new Response(null, { status: 304 })
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch
    })
    afterEach(() => { globalThis.fetch = origFetch })

    const runResult = <A>(task: Effect.Effect<A, Http.HttpError>) =>
      Effect.runPromise(Effect.result(task))

    it('#6: expectString decodes a plain-text body', async () => {
      const result = await runResult(Http.toTask(Http.get('http://x/text', Http.expectString)))
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) expect(result.success).toBe('OK')
    })

    it('#16: a 304 response is BadStatus, not BadBody', async () => {
      const result = await runResult(
        Http.toTask(Http.get('http://x/notmod', Http.expectJson(Schema.Struct({ ok: Schema.Boolean }))))
      )
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure._tag).toBe('BadStatus')
        if (result.failure._tag === 'BadStatus') expect(result.failure.status).toBe(304)
      }
    })

    it('#17: a malformed URL maps to BadUrl', async () => {
      const result = await runResult(Http.toTask(Http.get('http://exa mple.com/api', Http.expectWhatever)))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) expect(result.failure._tag).toBe('BadUrl')
    })

    it('#29: a request-body encode failure is BadRequestBody and sends no request', async () => {
      const result = await runResult(
        Http.toTask(
          Http.post(
            'http://x/api',
            Http.jsonBody(Schema.Struct({ age: Schema.Number }), { age: 'nope' } as any),
            Http.expectWhatever
          )
        )
      )
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) expect(result.failure._tag).toBe('BadRequestBody')
      expect(fetchCalls).toBe(0)
    })

    it('#5: withCredentials sends credentials: include', async () => {
      await runResult(pipe(Http.get('http://x/api', Http.expectWhatever), Http.withCredentials, Http.toTask))
      expect(lastInit?.credentials).toBe('include')
    })

    it('#5: without withCredentials, credentials is not set', async () => {
      await runResult(Http.toTask(Http.get('http://x/api', Http.expectWhatever)))
      expect(lastInit?.credentials).toBeUndefined()
    })
  })

  describe('request bodies', () => {
    const origFetch = globalThis.fetch
    let sent: RequestInit | undefined

    beforeEach(() => {
      sent = undefined
      globalThis.fetch = (async (_input: any, init: any) => {
        sent = init
        return new Response('{"id":1}', { status: 201, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch
    })
    afterEach(() => { globalThis.fetch = origFetch })

    const send = (body: Http.Body, method: Http.Method = 'POST', headers: ReadonlyArray<Http.Header> = []) =>
      Effect.runPromise(Http.toTask(Http.request({ method, url: 'http://x/api/upload', body, headers, expect: Http.expectWhatever })))

    const contentType = () => new Headers(sent?.headers as HeadersInit).get('content-type')

    const text = (body: unknown) => new TextDecoder().decode(body as Uint8Array)

    it('fileBody sends the file itself, typed by the file', async () => {
      const csv = new File(['id\n'], 'platforme.csv', { type: 'text/csv' })
      await send(Http.fileBody(csv))
      expect(sent?.body).toBe(csv)
      expect(contentType()).toBe('text/csv')
    })

    it('fileBody types a file the browser knows nothing about as application/octet-stream', async () => {
      await send(Http.fileBody(new File(['?'], 'dump.bin')))
      expect(contentType()).toBe('application/octet-stream')
    })

    it('stringBody sends text with the given type', async () => {
      await send(Http.stringBody('text/csv', 'id,naziv\n'))
      expect(text(sent?.body)).toBe('id,naziv\n')
      expect(contentType()).toBe('text/csv')
    })

    it('bytesBody sends bytes with the given type', async () => {
      await send(Http.bytesBody('application/pdf', new Uint8Array([37, 80, 68, 70])))
      expect(text(sent?.body)).toBe('%PDF')
      expect(contentType()).toBe('application/pdf')
    })

    it('multipartBody sends every part in a FormData and leaves Content-Type to fetch', async () => {
      const contract = new File(['%PDF'], 'ugovor.pdf', { type: 'application/pdf' })
      await send(
        Http.multipartBody([
          Http.stringPart('opis', 'Ugovor'),
          Http.filePart('fajl', contract),
          Http.bytesPart('potpis', 'image/png', new Uint8Array([1, 2]))
        ]),
        'POST',
        [Http.contentType('multipart/form-data')]
      )
      const form = sent?.body as FormData
      expect(form).toBeInstanceOf(FormData)
      expect(form.get('opis')).toBe('Ugovor')
      expect((form.get('fajl') as File).name).toBe('ugovor.pdf')
      expect(await (form.get('fajl') as File).text()).toBe('%PDF')
      expect((form.get('potpis') as File).type).toBe('image/png')
      // The boundary is fetch's to write, so a Content-Type set by hand is dropped.
      expect(contentType()).toBeNull()
    })

    it('jsonBody still sends JSON as application/json', async () => {
      await send(Http.jsonBody(Schema.Struct({ naziv: Schema.String }), { naziv: 'Windows' }))
      expect(text(sent?.body)).toBe('{"naziv":"Windows"}')
      expect(contentType()).toBe('application/json')
    })

    it('a request without a body keeps a Content-Type set by hand', async () => {
      await send(Http.emptyBody, 'POST', [Http.contentType('text/plain')])
      expect(sent?.body).toBeUndefined()
      expect(contentType()).toBe('text/plain')
    })

    it('GET and HEAD send no body, whatever the request carries', async () => {
      await send(Http.fileBody(new File(['x'], 'x.txt')), 'GET')
      expect(sent?.body).toBeUndefined()
      await send(Http.stringBody('text/plain', 'x'), 'HEAD')
      expect(sent?.body).toBeUndefined()
    })
  })

  describe('expectFile', () => {
    const origFetch = globalThis.fetch
    const CSV = 'id,naziv\n1,Windows\n'
    let answer: () => Response = () => new Response(CSV)

    beforeEach(() => {
      globalThis.fetch = (async () => answer()) as typeof fetch
    })
    afterEach(() => { globalThis.fetch = origFetch })

    const download = (url: string, headers: Record<string, string>, status = 200, body: string = CSV) => {
      answer = () => new Response(body, { status, headers })
      return Effect.runPromise(Effect.result(Http.toTask(Http.get(url, Http.expectFile))))
    }

    const named = async (disposition: string, url = 'http://x/api/izvoz'): Promise<string> => {
      const result = await download(url, { 'content-disposition': disposition })
      if (!Result.isSuccess(result)) throw new Error(`expected a file, got ${result.failure._tag}`)
      return result.success.name
    }

    it('reads the body as a File typed by Content-Type', async () => {
      const result = await download('http://x/api/izvoz', {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="platforme.csv"'
      })
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.success).toBeInstanceOf(File)
        expect(result.success.type).toBe('text/csv; charset=utf-8')
        expect(await result.success.text()).toBe(CSV)
      }
    })

    it('prefers filename* so a UTF-8 name survives', async () => {
      expect(await named(`attachment; filename="uredjaji.csv"; filename*=UTF-8''ure%C4%91aji.csv`)).toBe('uređaji.csv')
    })

    it('reads an ISO-8859-1 filename*', async () => {
      expect(await named(`attachment; filename*=ISO-8859-1''caf%E9.csv`)).toBe('café.csv')
    })

    it('falls back to a quoted filename, unescaping it', async () => {
      expect(await named('attachment; filename="report \\"Q3\\".pdf"')).toBe('report "Q3".pdf')
    })

    it('reads an unquoted filename', async () => {
      expect(await named('attachment; filename=report.pdf')).toBe('report.pdf')
    })

    it('repairs a raw UTF-8 filename that arrives byte by byte', async () => {
      const raw = Buffer.from('attachment; filename="izveštaj.pdf"', 'utf8').toString('latin1')
      expect(await named(raw)).toBe('izveštaj.pdf')
    })

    it('keeps only the base name of a filename with a path', async () => {
      expect(await named('attachment; filename="../../etc/passwd"')).toBe('passwd')
    })

    it('names the file after the last URL segment without Content-Disposition', async () => {
      const result = await download('http://x/files/izvoz%20platformi.xlsx?sort=naziv', {})
      expect(Result.isSuccess(result) && result.success.name).toBe('izvoz platformi.xlsx')
    })

    it('keeps a status outside 2xx as BadStatus with the body as text', async () => {
      const errors = JSON.stringify([{ type: 'BUSINESS', message: 'Nema podataka za izvoz' }])
      const result = await download('http://x/api/izvoz', { 'content-type': 'application/json' }, 400, errors)
      expect(Result.isFailure(result) && result.failure).toEqual(Http.badStatus(400, errors))
    })
  })
})
