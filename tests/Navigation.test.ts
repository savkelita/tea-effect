import { describe, it, expect, afterEach } from 'vitest'
import { Effect, Stream, Scope, Exit } from 'effect'
import * as Navigation from '../src/Navigation'
import * as Cmd from '../src/Cmd'
import * as Sub from '../src/Sub'
import * as Platform from '../src/Platform'

describe('Navigation', () => {
  describe('getLocation (SSR)', () => {
    it('should return default location when window is undefined', () => {
      const location = Navigation.getLocation()
      // In Node.js environment, window is undefined
      expect(location.pathname).toBe('/')
      expect(location.search).toBe('')
      expect(location.hash).toBe('')
      expect(location.href).toBe('/')
      expect(location.origin).toBe('')
    })
  })

  describe('Location type', () => {
    it('should have correct shape', () => {
      const location: Navigation.Location = {
        pathname: '/users',
        search: '?id=1',
        hash: '#top',
        href: 'https://example.com/users?id=1#top',
        origin: 'https://example.com',
        state: null
      }
      expect(location.pathname).toBe('/users')
      expect(location.search).toBe('?id=1')
      expect(location.hash).toBe('#top')
      expect(location.href).toBe('https://example.com/users?id=1#top')
      expect(location.origin).toBe('https://example.com')
    })
  })

  describe('UrlRequest type', () => {
    it('should represent Internal request', () => {
      const request: Navigation.UrlRequest = {
        _tag: 'Internal',
        location: {
          pathname: '/about',
          search: '',
          hash: '',
          href: 'https://example.com/about',
          origin: 'https://example.com',
          state: null
        }
      }
      expect(request._tag).toBe('Internal')
      expect(request.location.pathname).toBe('/about')
    })

    it('should represent External request', () => {
      const request: Navigation.UrlRequest = {
        _tag: 'External',
        href: 'https://google.com'
      }
      expect(request._tag).toBe('External')
      expect(request.href).toBe('https://google.com')
    })
  })

  describe('commands (SSR safe)', () => {
    it('pushUrl should be a valid Cmd', () => {
      const cmd = Navigation.pushUrl('/test')
      expect(cmd).toBeDefined()
    })

    it('replaceUrl should be a valid Cmd', () => {
      const cmd = Navigation.replaceUrl('/test')
      expect(cmd).toBeDefined()
    })

    it('back should be a valid Cmd', () => {
      const cmd = Navigation.back(1)
      expect(cmd).toBeDefined()
    })

    it('back should accept steps parameter', () => {
      const cmd = Navigation.back(3)
      expect(cmd).toBeDefined()
    })

    it('forward should be a valid Cmd', () => {
      const cmd = Navigation.forward(1)
      expect(cmd).toBeDefined()
    })

    it('forward should accept steps parameter', () => {
      const cmd = Navigation.forward(2)
      expect(cmd).toBeDefined()
    })

    it('load should be a valid Cmd', () => {
      const cmd = Navigation.load('https://example.com')
      expect(cmd).toBeDefined()
    })

    it('reload should be a valid Cmd', () => {
      const cmd = Navigation.reload
      expect(cmd).toBeDefined()
    })
  })

  describe('subscriptions (SSR safe)', () => {
    it('urlChanges should be a valid Sub', () => {
      const sub = Navigation.urlChanges((location) => ({ type: 'UrlChanged' as const, location }))
      expect(sub).toBeDefined()
    })

    it('linkClicks should be a valid Sub', () => {
      const sub = Navigation.linkClicks((request) => ({ type: 'LinkClicked' as const, request }))
      expect(sub).toBeDefined()
    })
  })

  // Regression tests for audited bugs (see AUDIT.md).
  describe('AUDIT regressions', () => {
    afterEach(() => {
      // @ts-expect-error - cleaning up mock
      delete global.window
    })

    it('#7: linkClicks resolves a relative href against the current URL, not the origin', async () => {
      let path = '/docs/guide'
      const clickHandlers: Array<(e: any) => void> = []
      ;(global as any).window = {
        location: {
          get href() { return 'https://ex.com' + path },
          get origin() { return 'https://ex.com' }
        },
        addEventListener: (t: string, h: any) => { if (t === 'click') clickHandlers.push(h) },
        removeEventListener: () => {}
      }

      const got: Navigation.UrlRequest[] = []
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            yield* Effect.forkScoped(
              Stream.runForEach(
                Navigation.linkClicks((r) => r),
                (r) => Effect.sync(() => { got.push(r) })
              )
            )
            yield* Effect.sleep('20 millis')
            const anchor: any = {
              getAttribute: (n: string) => (n === 'href' ? 'intro' : null),
              hasAttribute: () => false,
              closest: () => anchor
            }
            clickHandlers.forEach((h) =>
              h({ target: anchor, preventDefault: () => {}, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })
            )
            yield* Effect.sleep('20 millis')
          })
        )
      )

      expect(got).toHaveLength(1)
      expect(got[0]._tag).toBe('Internal')
      if (got[0]._tag === 'Internal') {
        expect(got[0].location.pathname).toBe('/docs/intro')
      }
    })

    it('#8: a url change issued from init\'s Cmd is still delivered to onUrlChange', async () => {
      let path = '/unknown-route'
      const popHandlers: Array<(e: any) => void> = []
      ;(global as any).window = {
        location: {
          get pathname() { return path },
          get search() { return '' },
          get hash() { return '' },
          get href() { return 'https://ex.com' + path },
          get origin() { return 'https://ex.com' }
        },
        history: {
          pushState: (_s: any, _t: any, url: string) => { path = new URL(url, 'https://ex.com').pathname },
          replaceState: (_s: any, _t: any, url: string) => { path = new URL(url, 'https://ex.com').pathname }
        },
        addEventListener: (t: string, h: any) => { if (t === 'popstate') popHandlers.push(h) },
        removeEventListener: () => {},
        dispatchEvent: (e: any) => { if (e?.type === 'popstate') popHandlers.forEach((h) => h(e)) }
      }
      ;(global as any).PopStateEvent = class { type = 'popstate' }

      type Model = { route: string }
      type Msg = { type: 'UrlChanged'; location: Navigation.Location }
      const changes: string[] = []
      const App = Navigation.program<Model, Msg, null>({
        init: (loc) =>
          loc.pathname === '/unknown-route'
            ? [{ route: loc.pathname }, Navigation.replaceUrl('/')]
            : [{ route: loc.pathname }, Cmd.none],
        update: (msg, m) =>
          msg.type === 'UrlChanged'
            ? (changes.push(msg.location.pathname), [{ route: msg.location.pathname }, Cmd.none])
            : [m, Cmd.none],
        view: () => () => null,
        onUrlRequest: () => ({ type: 'UrlChanged', location: Navigation.getLocation() }),
        onUrlChange: (location) => ({ type: 'UrlChanged', location })
      })

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const scope = yield* Scope.make()
            const prog = yield* App.pipe(Scope.extend(scope))
            yield* Effect.forkScoped(Stream.runDrain(prog.model$))
            yield* Effect.sleep('150 millis')
            yield* Scope.close(scope, Exit.void)
          })
        )
      )

      expect(path).toBe('/')
      expect(changes).toContain('/')
    })

    it('F: a stray navigation with no subscriber does not leak into a later program', async () => {
      let path = '/home'
      const popHandlers: Array<(e: any) => void> = []
      ;(global as any).window = {
        location: {
          get pathname() { return path },
          get search() { return '' },
          get hash() { return '' },
          get href() { return 'https://ex.com' + path },
          get origin() { return 'https://ex.com' }
        },
        history: {
          pushState: (_s: any, _t: any, url: string) => { path = new URL(url, 'https://ex.com').pathname },
          replaceState: (_s: any, _t: any, url: string) => { path = new URL(url, 'https://ex.com').pathname }
        },
        addEventListener: (t: string, h: any) => { if (t === 'popstate') popHandlers.push(h) },
        removeEventListener: (t: string, h: any) => {
          if (t === 'popstate') { const i = popHandlers.indexOf(h); if (i >= 0) popHandlers.splice(i, 1) }
        },
        dispatchEvent: (e: any) => { if (e?.type === 'popstate') popHandlers.forEach((h) => h(e)) }
      }
      ;(global as any).PopStateEvent = class { type = 'popstate' }

      // A navigation issued while nobody is subscribed.
      await Effect.runPromise(Effect.scoped(Stream.runDrain(Navigation.pushUrl('/stray'))))
      await new Promise((r) => setTimeout(r, 20)) // let the deferred popstate fire into nobody

      // A later program that only listens for URL changes and never navigates.
      const changes: string[] = []
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const scope = yield* Scope.make()
            const prog = yield* Navigation.program<{ route: string }, { type: 'UrlChanged'; location: Navigation.Location }, null>({
              init: (loc) => [{ route: loc.pathname }, Cmd.none],
              update: (msg) => (changes.push(msg.location.pathname), [{ route: msg.location.pathname }, Cmd.none]),
              view: () => () => null,
              onUrlRequest: () => ({ type: 'UrlChanged', location: Navigation.getLocation() }),
              onUrlChange: (location) => ({ type: 'UrlChanged', location })
            }).pipe(Scope.extend(scope))
            yield* Effect.forkScoped(Stream.runDrain(prog.model$))
            yield* Effect.sleep('60 millis')
            yield* Scope.close(scope, Exit.void)
          })
        )
      )

      expect(changes).toEqual([]) // no phantom UrlChanged from the earlier stray navigation
    })

    it('review-G: two batched urlChanges with different messages both fire', async () => {
      const popHandlers: Array<(e: any) => void> = []
      ;(global as any).window = {
        location: { pathname: '/p', search: '', hash: '', href: 'https://ex.com/p', origin: 'https://ex.com' },
        history: { pushState: () => {}, replaceState: () => {} },
        addEventListener: (t: string, h: any) => { if (t === 'popstate') popHandlers.push(h) },
        removeEventListener: () => {}
      }

      const got: string[] = []
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const scope = yield* Scope.make()
            const prog = yield* Platform.program<{ n: number }, { type: string }>(
              [{ n: 0 }, Cmd.none],
              (msg, m) => (got.push(msg.type), [{ n: m.n + 1 }, Cmd.none]),
              () =>
                Sub.batch([
                  Navigation.urlChanges(() => ({ type: 'UA' })),
                  Navigation.urlChanges(() => ({ type: 'UB' }))
                ])
            ).pipe(Scope.extend(scope))
            yield* Effect.forkScoped(Stream.runDrain(prog.model$))
            yield* Effect.sleep('40 millis')
            popHandlers.forEach((h) => h({ type: 'popstate' }))
            yield* Effect.sleep('40 millis')
            yield* Scope.close(scope, Exit.void)
          })
        )
      )

      expect(got).toContain('UA')
      expect(got).toContain('UB')
    })

    it('review2-#4: two navigations in one macrotask each deliver their own URL', async () => {
      let path = '/start'
      const popHandlers: Array<(e: any) => void> = []
      ;(global as any).window = {
        location: {
          get pathname() { return path }, get search() { return '' }, get hash() { return '' },
          get href() { return 'https://ex.com' + path }, get origin() { return 'https://ex.com' }
        },
        history: {
          pushState: (_s: any, _t: any, u: string) => { path = new URL(u, 'https://ex.com').pathname },
          replaceState: (_s: any, _t: any, u: string) => { path = new URL(u, 'https://ex.com').pathname }
        },
        addEventListener: (t: string, h: any) => { if (t === 'popstate') popHandlers.push(h) },
        removeEventListener: () => {},
        dispatchEvent: (e: any) => { if (e?.type === 'popstate') popHandlers.forEach((h) => h(e)) }
      }
      ;(global as any).PopStateEvent = class { type = 'popstate' }

      const changes: string[] = []
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const scope = yield* Scope.make()
            const prog = yield* Platform.program<{ r: string }, { type: string; p?: string }>(
              [{ r: path }, Cmd.none],
              (msg, m) =>
                msg.type === 'Go'
                  ? [m, Cmd.batch([Navigation.pushUrl('/a'), Navigation.pushUrl('/b')])]
                  : msg.type === 'U'
                    ? (changes.push(msg.p!), [{ r: msg.p! }, Cmd.none])
                    : [m, Cmd.none],
              () => Navigation.urlChanges((l) => ({ type: 'U', p: l.pathname }))
            ).pipe(Scope.extend(scope))
            yield* Effect.forkScoped(Stream.runDrain(prog.model$))
            yield* Effect.sleep('40 millis')
            prog.dispatch({ type: 'Go' })
            yield* Effect.sleep('80 millis')
            yield* Scope.close(scope, Exit.void)
          })
        )
      )

      // Both navigations delivered, each with its own captured URL (no lost
      // intermediate, no duplicated final).
      expect(changes).toEqual(['/a', '/b'])
    })
  })

  describe('history state', () => {
    afterEach(() => {
      // @ts-expect-error - cleaning up mock
      delete global.window
    })

    const mockWindow = () => {
      const entry: { url: string; state: unknown } = { url: '/', state: null }
      const popHandlers: Array<(e: any) => void> = []
      ;(global as any).window = {
        location: {
          get pathname() {
            return new URL(entry.url, 'https://ex.com').pathname
          },
          get search() {
            return new URL(entry.url, 'https://ex.com').search
          },
          get hash() {
            return ''
          },
          get href() {
            return new URL(entry.url, 'https://ex.com').href
          },
          get origin() {
            return 'https://ex.com'
          }
        },
        history: {
          get state() {
            return entry.state
          },
          pushState: (s: unknown, _t: unknown, url: string) => {
            entry.url = url
            entry.state = s
          },
          replaceState: (s: unknown, _t: unknown, url: string) => {
            entry.url = url
            entry.state = s
          }
        },
        addEventListener: (t: string, h: any) => {
          if (t === 'popstate') popHandlers.push(h)
        },
        removeEventListener: () => {},
        dispatchEvent: (e: any) => {
          if (e?.type === 'popstate') popHandlers.forEach((h) => h(e))
        }
      }
      ;(global as any).PopStateEvent = class {
        type = 'popstate'
      }
      return { entry, popHandlers }
    }

    // The deferred synthetic popstate must fire before the next test subscribes,
    // otherwise it lands on that test's listener.
    const run = async <A>(cmd: Stream.Stream<A, never, Scope.Scope>) => {
      await Effect.runPromise(Effect.scoped(Stream.runDrain(cmd)))
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    it('pushUrl stores what it was given and getLocation reads it back', async () => {
      mockWindow()
      await run(Navigation.pushUrl('/vozaci?kategorijaID=3', { filter: { kategorija: { id: 3, oznaka: 'C' } } }))
      expect(Navigation.getLocation().state).toEqual({ filter: { kategorija: { id: 3, oznaka: 'C' } } })
    })

    it('replaceUrl stores state too', async () => {
      mockWindow()
      await run(Navigation.replaceUrl('/vozaci', { filter: {} }))
      expect(Navigation.getLocation().state).toEqual({ filter: {} })
    })

    it('an entry pushed without state reports null, not undefined', async () => {
      mockWindow()
      await run(Navigation.pushUrl('/vozaci'))
      expect(Navigation.getLocation().state).toBeNull()
    })

    it('a window without history reports null instead of throwing', () => {
      ;(global as any).window = { location: { pathname: '/', search: '', hash: '', href: '/', origin: '' } }
      expect(Navigation.getLocation().state).toBeNull()
    })

    // Back and forward emit the browser's own popstate, which carries no snapshot,
    // so urlChanges reads the entry the browser restored.
    it('urlChanges reports the state of the entry the browser restored', async () => {
      const { entry, popHandlers } = mockWindow()
      const seen: Array<unknown> = []

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const scope = yield* Scope.make()
            const prog = yield* Platform.program<{ n: number }, { state: unknown }>(
              [{ n: 0 }, Cmd.none],
              (msg, m) => (seen.push(msg.state), [{ n: m.n + 1 }, Cmd.none]),
              () => Navigation.urlChanges((location) => ({ state: location.state }))
            ).pipe(Scope.extend(scope))
            yield* Effect.forkScoped(Stream.runDrain(prog.model$))
            yield* Effect.sleep('40 millis')

            entry.url = '/vozaci?kategorijaID=1'
            entry.state = { filter: { kategorija: { id: 1, oznaka: 'B' } } }
            popHandlers.forEach((h) => h({ type: 'popstate' }))

            yield* Effect.sleep('40 millis')
            yield* Scope.close(scope, Exit.void)
          })
        )
      )

      expect(seen).toEqual([{ filter: { kategorija: { id: 1, oznaka: 'B' } } }])
    })
  })
})
