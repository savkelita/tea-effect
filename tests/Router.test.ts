import { describe, it, expect } from 'vitest'
import { Option, Schema } from 'effect'
import * as Router from '../src/Router'
import { Route } from '../src/Router/Route'
import * as Parser from '../src/Router/Parser'
import * as Formatter from '../src/Router/Formatter'
import * as Matcher from '../src/Router/Matcher'

describe('Router', () => {
  describe('Route', () => {
    it('should parse pathname and search', () => {
      const route = Route.parse('/users/42', '?sort=name')
      expect(route.segments).toEqual(['users', '42'])
      expect(route.query.get('sort')).toBe('name')
    })

    it('should parse empty path as root', () => {
      const route = Route.parse('/', '')
      expect(route.segments).toEqual([])
      expect(route.isEmpty()).toBe(true)
    })

    it('should convert to string', () => {
      const route = new Route(['users', '42'], new URLSearchParams('sort=name'))
      expect(route.toString()).toBe('/users/42?sort=name')
    })

    it('should convert to string without query', () => {
      const route = new Route(['users'], new URLSearchParams())
      expect(route.toString()).toBe('/users')
    })

    it('should create from location', () => {
      const route = Route.fromLocation({ pathname: '/test', search: '?q=hello' })
      expect(route.segments).toEqual(['test'])
      expect(route.query.get('q')).toBe('hello')
    })
  })

  describe('Parser', () => {
    describe('lit', () => {
      it('should match literal segment', () => {
        const parser = Parser.lit('users')
        const route = Route.parse('/users/42', '')
        const result = parser.parse(route)

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value[1].segments).toEqual(['42'])
        }
      })

      it('should fail on non-matching segment', () => {
        const parser = Parser.lit('users')
        const route = Route.parse('/posts', '')
        const result = parser.parse(route)

        expect(Option.isNone(result)).toBe(true)
      })
    })

    describe('str', () => {
      it('should capture string segment', () => {
        const parser = Parser.str('name')
        const route = Route.parse('/john', '')
        const result = parser.parse(route)

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value[0]).toEqual({ name: 'john' })
        }
      })
    })

    describe('int', () => {
      it('should capture integer segment', () => {
        const parser = Parser.int('id')
        const route = Route.parse('/42', '')
        const result = parser.parse(route)

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value[0]).toEqual({ id: 42 })
        }
      })

      it('should fail on non-integer segment', () => {
        const parser = Parser.int('id')
        const route = Route.parse('/abc', '')
        const result = parser.parse(route)

        expect(Option.isNone(result)).toBe(true)
      })

      it('should fail on float segment', () => {
        const parser = Parser.int('id')
        const route = Route.parse('/3.14', '')
        const result = parser.parse(route)

        expect(Option.isNone(result)).toBe(true)
      })
    })

    describe('zip', () => {
      it('should combine parsers', () => {
        const parser = Parser.zip(
          Parser.zip(Parser.lit('users'), Parser.int('id')),
          Parser.end
        )
        const route = Route.parse('/users/42', '')
        const result = parser.parse(route)

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value[0]).toEqual({ id: 42 })
        }
      })
    })

    describe('oneOf', () => {
      it('should try alternatives', () => {
        const parser = Parser.oneOf(
          Parser.map(Parser.zip(Parser.lit('users'), Parser.end), () => 'users'),
          Parser.map(Parser.zip(Parser.lit('posts'), Parser.end), () => 'posts')
        )

        const result1 = parser.parse(Route.parse('/users', ''))
        expect(Option.isSome(result1)).toBe(true)
        if (Option.isSome(result1)) {
          expect(result1.value[0]).toBe('users')
        }

        const result2 = parser.parse(Route.parse('/posts', ''))
        expect(Option.isSome(result2)).toBe(true)
        if (Option.isSome(result2)) {
          expect(result2.value[0]).toBe('posts')
        }
      })
    })

    describe('query', () => {
      it('should parse query parameters', () => {
        const parser = Parser.query(
          Schema.Struct({
            q: Schema.String,
            page: Schema.optional(Schema.String)
          })
        )
        const route = Route.parse('/', '?q=hello&page=2')
        const result = parser.parse(route)

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value[0]).toEqual({ q: 'hello', page: '2' })
        }
      })

      it('should handle array query parameters', () => {
        const parser = Parser.query(
          Schema.Struct({
            tags: Schema.Union(Schema.String, Schema.Array(Schema.String))
          })
        )
        const route = Route.parse('/', '?tags=a&tags=b')
        const result = parser.parse(route)

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value[0].tags).toEqual(['a', 'b'])
        }
      })
    })
  })

  describe('Formatter', () => {
    describe('lit', () => {
      it('should format literal segment', () => {
        const formatter = Formatter.lit('users')
        const route = formatter.format({})
        expect(route.segments).toEqual(['users'])
      })
    })

    describe('int', () => {
      it('should format integer segment', () => {
        const formatter = Formatter.int('id')
        const route = formatter.format({ id: 42 })
        expect(route.segments).toEqual(['42'])
      })
    })

    describe('combine', () => {
      it('should combine formatters', () => {
        const formatter = Formatter.combine(
          Formatter.lit('users'),
          Formatter.int('id')
        )
        const route = formatter.format({ id: 42 })
        expect(route.toString()).toBe('/users/42')
      })
    })

    describe('query', () => {
      it('should format query parameters', () => {
        const formatter = Formatter.query<{ q: string; page: number }>()
        const route = formatter.format({ q: 'hello', page: 2 })
        expect(route.query.get('q')).toBe('hello')
        expect(route.query.get('page')).toBe('2')
      })

      it('should handle array values', () => {
        const formatter = Formatter.query<{ tags: string[] }>()
        const route = formatter.format({ tags: ['a', 'b'] })
        expect(route.query.getAll('tags')).toEqual(['a', 'b'])
      })

      it('should skip undefined values', () => {
        const formatter = Formatter.query<{ q: string; page?: number }>()
        const route = formatter.format({ q: 'hello', page: undefined })
        expect(route.query.get('q')).toBe('hello')
        expect(route.query.has('page')).toBe(false)
      })
    })
  })

  describe('Matcher', () => {
    describe('bidirectional', () => {
      it('should parse and format user route', () => {
        const matcher = Matcher.seq(
          Matcher.seq(Matcher.lit('users'), Matcher.int('id')),
          Matcher.end
        )

        // Parse
        const parseResult = matcher.parser.parse(Route.parse('/users/42', ''))
        expect(Option.isSome(parseResult)).toBe(true)
        if (Option.isSome(parseResult)) {
          expect(parseResult.value[0]).toEqual({ id: 42 })
        }

        // Format
        const formatResult = matcher.formatter.format({ id: 42 })
        expect(formatResult.toString()).toBe('/users/42')
      })
    })
  })

  describe('Router API', () => {
    // More specific routes (with query requirements) must come before
    // less specific routes that share the same path pattern.
    const testRoutes = Router.routes({
      home: Router.path('/'),
      users: Router.path('/users'),
      userPosts: Router.path('/users/:userId/posts/:postId', {
        userId: Schema.NumberFromString,
        postId: Schema.NumberFromString
      }),
      userSearch: Router.path('/users/:id', { id: Schema.NumberFromString }).query(
        Schema.Struct({
          tab: Schema.String,
          page: Schema.optional(Schema.NumberFromString)
        })
      ),
      user: Router.path('/users/:id', { id: Schema.NumberFromString }),
      search: Router.path('/search').query(
        Schema.Struct({
          q: Schema.String,
          page: Schema.optional(Schema.NumberFromString)
        })
      )
    })

    describe('parse', () => {
      it('should parse home route', () => {
        const result = Router.parse(testRoutes, { pathname: '/', search: '' })
        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value._tag).toBe('home')
        }
      })

      it('should parse users route', () => {
        const result = Router.parse(testRoutes, { pathname: '/users', search: '' })
        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value._tag).toBe('users')
        }
      })

      it('should parse user route with id', () => {
        const result = Router.parse(testRoutes, { pathname: '/users/42', search: '' })
        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value._tag).toBe('user')
          expect((result.value as any).params.id).toBe(42)
        }
      })

      it('should parse userPosts route', () => {
        const result = Router.parse(testRoutes, { pathname: '/users/1/posts/2', search: '' })
        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value._tag).toBe('userPosts')
          expect((result.value as any).params.userId).toBe(1)
          expect((result.value as any).params.postId).toBe(2)
        }
      })

      it('should parse search route with query', () => {
        const result = Router.parse(testRoutes, { pathname: '/search', search: '?q=hello&page=2' })
        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value._tag).toBe('search')
          expect((result.value as any).query.q).toBe('hello')
          expect((result.value as any).query.page).toBe(2)
        }
      })

      it('should parse route with both path params and query params', () => {
        const result = Router.parse(testRoutes, { pathname: '/users/7', search: '?tab=posts&page=3' })
        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value._tag).toBe('userSearch')
          expect((result.value as any).params.id).toBe(7)
          expect((result.value as any).query.tab).toBe('posts')
          expect((result.value as any).query.page).toBe(3)
        }
      })

      it('should return None for unknown route', () => {
        const result = Router.parse(testRoutes, { pathname: '/unknown', search: '' })
        expect(Option.isNone(result)).toBe(true)
      })
    })

    describe('parseOr', () => {
      it('should return default for unknown route', () => {
        const notFound = { _tag: 'notFound' as const }
        const result = Router.parseOr(testRoutes, { pathname: '/unknown', search: '' }, notFound)
        expect(result._tag).toBe('notFound')
      })
    })

    describe('format', () => {
      it('should format user route', () => {
        const url = Router.format(testRoutes.user, { id: 42 })
        expect(url).toBe('/users/42')
      })

      it('should format userPosts route', () => {
        const url = Router.format(testRoutes.userPosts, { userId: 1, postId: 2 })
        expect(url).toBe('/users/1/posts/2')
      })

      it('should format search route with query', () => {
        const url = Router.format(testRoutes.search, { q: 'hello', page: 2 })
        expect(url).toContain('/search')
        expect(url).toContain('q=hello')
        expect(url).toContain('page=2')
      })

      it('should format route with both path params and query params', () => {
        const url = Router.format(testRoutes.userSearch, { id: 7, tab: 'posts', page: 3 })
        expect(url).toContain('/users/7')
        expect(url).toContain('tab=posts')
        expect(url).toContain('page=3')
        expect(url).not.toContain('id=')
      })
    })
  })

  describe('Type inference', () => {
    it('should infer correct route type', () => {
      const routes = Router.routes({
        home: Router.path('/'),
        user: Router.path('/users/:id', { id: Schema.NumberFromString })
      })

      type RouteType = Router.RouteType<typeof routes>

      // Type check - these should compile
      const homeRoute: RouteType = { _tag: 'home' }
      const userRoute: RouteType = { _tag: 'user', params: { id: 42 } }

      expect(homeRoute._tag).toBe('home')
      expect(userRoute._tag).toBe('user')
    })
  })

  // Regression tests for audited bugs (see AUDIT.md).
  describe('AUDIT regressions', () => {
    const parseUrl = <T extends Router.Routes<any>>(routes: T, url: string) => {
      const u = new URL('http://x' + url)
      return Router.parse(routes, { pathname: u.pathname, search: u.search })
    }

    it('#9/#10: percent-encodes/decodes path segments so format→parse round-trips', () => {
      const routes = Router.routes({ user: Router.path('/users/:name') })
      for (const name of ['a/b', 'john doe', 'a?b#c', 'café']) {
        const url = Router.format(routes.user, { name })
        const parsed = parseUrl(routes, url)
        expect(Option.isSome(parsed)).toBe(true)
        if (Option.isSome(parsed)) {
          expect((parsed.value as any).params.name).toBe(name)
        }
      }
    })

    it('#19: optionalWith-default query schema does not leak the path param', () => {
      const routes = Router.routes({
        user: Router.path('/users/:id', { id: Schema.NumberFromString }).query(
          Schema.Struct({
            tab: Schema.String,
            page: Schema.optionalWith(Schema.NumberFromString, { default: () => 1 })
          })
        )
      })
      const url = Router.format(routes.user, { id: 7, tab: 'posts', page: 3 } as any)
      expect(url).not.toContain('id=')
      expect(url).toContain('tab=posts')
      expect(url).toContain('page=3')
    })

    it('#20: Record query schema does not drop query params', () => {
      const routes = Router.routes({
        search: Router.path('/search').query(Schema.Record({ key: Schema.String, value: Schema.String }))
      })
      const url = Router.format(routes.search, { q: 'hello', page: '2' } as any)
      expect(url).toContain('q=hello')
      expect(url).toContain('page=2')
    })

    it('#21: path and query params format through the schema encoder (round-trip)', () => {
      const Hex = Schema.transform(Schema.String, Schema.Number, {
        decode: (s) => parseInt(s, 16),
        encode: (n) => n.toString(16)
      })
      const routes = Router.routes({
        item: Router.path('/item/:id', { id: Hex }).query(Schema.Struct({ n: Hex }))
      })
      const url = Router.format(routes.item, { id: 255, n: 254 } as any)
      expect(url).toBe('/item/ff?n=fe')
      const back = parseUrl(routes, url)
      expect(Option.isSome(back)).toBe(true)
      if (Option.isSome(back)) {
        expect((back.value as any).params.id).toBe(255)
        expect((back.value as any).query.n).toBe(254)
      }
    })

    it('#22: query key colliding with a path param is rejected at definition time', () => {
      expect(() =>
        Router.routes({
          user: Router.path('/users/:id', { id: Schema.NumberFromString }).query(
            Schema.Struct({ id: Schema.String })
          )
        })
      ).toThrow(/collide/)
    })

    it('#30: a literal colon segment does not add a spurious params object', () => {
      const routes = Router.routes({
        time: Router.path('/time/12:30').query(Schema.Struct({ zone: Schema.String }))
      })
      const parsed = parseUrl(routes, '/time/12:30?zone=utc')
      expect(Option.isSome(parsed)).toBe(true)
      if (Option.isSome(parsed)) {
        expect('params' in parsed.value).toBe(false)
        expect((parsed.value as any).query.zone).toBe('utc')
      }
    })

    it('#31: IntFromString rejects NaN/Infinity/floats but accepts integers', () => {
      const routes = Router.routes({ user: Router.path('/users/:id', { id: Router.IntFromString }) })
      expect(Option.isSome(parseUrl(routes, '/users/42'))).toBe(true)
      for (const bad of ['/users/Infinity', '/users/-Infinity', '/users/NaN', '/users/3.14']) {
        expect(Option.isNone(parseUrl(routes, bad))).toBe(true)
      }
    })

    it('review-E: format stays total when a refined schema encode would throw', () => {
      const routes = Router.routes({ user: Router.path('/users/:id', { id: Router.IntFromString }) })
      expect(() => Router.format(routes.user, { id: 3.14 } as any)).not.toThrow()
      expect(Router.format(routes.user, { id: 42 })).toBe('/users/42')
    })

    it('review-#11: format stays total when a required/default query field is omitted', () => {
      const routes = Router.routes({
        user: Router.path('/users/:id', { id: Schema.NumberFromString }).query(
          Schema.Struct({ tab: Schema.String, page: Schema.optionalWith(Schema.NumberFromString, { default: () => 1 }) })
        )
      })
      expect(() => Router.format(routes.user, { id: 7, tab: 'posts' } as any)).not.toThrow()
    })
  })
})
