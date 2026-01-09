import { describe, it, expect } from 'vitest'
import { Schema, pipe } from 'effect'
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
      expect(Http.expectString._tag).toBe('ExpectJson')
    })

    it('should have expectWhatever', () => {
      expect(Http.expectWhatever._tag).toBe('ExpectJson')
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
})
