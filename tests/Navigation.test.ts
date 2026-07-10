import { describe, it, expect, afterEach } from 'vitest'
import { Effect, Stream, Scope, Exit } from 'effect'
import * as Navigation from '../src/Navigation'
import * as Cmd from '../src/Cmd'

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
        origin: 'https://example.com'
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
          origin: 'https://example.com'
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
        removeEventListener: () => {}
      }

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
  })
})
