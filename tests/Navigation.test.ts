import { describe, it, expect } from 'vitest'
import * as Navigation from '../src/Navigation'

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
})
