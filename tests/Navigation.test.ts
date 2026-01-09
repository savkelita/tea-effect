import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as Navigation from '../src/Navigation'

describe('Navigation', () => {
  describe('getLocation (SSR)', () => {
    it('should return default location when window is undefined', () => {
      const location = Navigation.getLocation()
      // In Node.js environment, window is undefined
      expect(location.pathname).toBe('/')
      expect(location.search).toBe('')
      expect(location.hash).toBe('')
    })
  })

  describe('fromUrl', () => {
    it('should parse a full URL', () => {
      const location = Navigation.fromUrl('https://example.com/users/123?search=foo#section')
      expect(location.pathname).toBe('/users/123')
      expect(location.search).toBe('?search=foo')
      expect(location.hash).toBe('#section')
      expect(location.origin).toBe('https://example.com')
    })

    it('should parse a relative URL', () => {
      const location = Navigation.fromUrl('/users/123')
      expect(location.pathname).toBe('/users/123')
      expect(location.search).toBe('')
      expect(location.hash).toBe('')
    })

    it('should parse URL with only query string', () => {
      const location = Navigation.fromUrl('/search?q=test&page=1')
      expect(location.pathname).toBe('/search')
      expect(location.search).toBe('?q=test&page=1')
    })

    it('should parse URL with only hash', () => {
      const location = Navigation.fromUrl('/docs#api')
      expect(location.pathname).toBe('/docs')
      expect(location.hash).toBe('#api')
    })

    it('should handle invalid URL gracefully', () => {
      const location = Navigation.fromUrl('not-a-url')
      expect(location.pathname).toBe('/not-a-url')
    })
  })

  describe('parseQuery', () => {
    it('should parse query string with leading ?', () => {
      const params = Navigation.parseQuery('?search=foo&page=2')
      expect(params).toEqual({ search: 'foo', page: '2' })
    })

    it('should parse query string without leading ?', () => {
      const params = Navigation.parseQuery('search=foo&page=2')
      expect(params).toEqual({ search: 'foo', page: '2' })
    })

    it('should return empty object for empty string', () => {
      const params = Navigation.parseQuery('')
      expect(params).toEqual({})
    })

    it('should handle URL encoded values', () => {
      const params = Navigation.parseQuery('?name=John%20Doe&city=New%20York')
      expect(params).toEqual({ name: 'John Doe', city: 'New York' })
    })
  })

  describe('buildQuery', () => {
    it('should build query string from params', () => {
      const query = Navigation.buildQuery({ search: 'foo', page: '2' })
      expect(query).toBe('?search=foo&page=2')
    })

    it('should return empty string for empty params', () => {
      const query = Navigation.buildQuery({})
      expect(query).toBe('')
    })

    it('should skip empty values', () => {
      const query = Navigation.buildQuery({ search: 'foo', empty: '' })
      expect(query).toBe('?search=foo')
    })
  })

  describe('buildUrl', () => {
    it('should build URL with pathname only', () => {
      const url = Navigation.buildUrl('/users')
      expect(url).toBe('/users')
    })

    it('should build URL with pathname and params', () => {
      const url = Navigation.buildUrl('/users', { search: 'foo', page: '2' })
      expect(url).toBe('/users?search=foo&page=2')
    })

    it('should build URL with pathname and hash', () => {
      const url = Navigation.buildUrl('/docs', undefined, '#api')
      expect(url).toBe('/docs#api')
    })

    it('should build URL with all parts', () => {
      const url = Navigation.buildUrl('/users', { search: 'foo' }, '#top')
      expect(url).toBe('/users?search=foo#top')
    })

    it('should handle hash without #', () => {
      const url = Navigation.buildUrl('/docs', undefined, 'section')
      expect(url).toBe('/docs#section')
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
      const cmd = Navigation.back()
      expect(cmd).toBeDefined()
    })

    it('back should accept steps parameter', () => {
      const cmd = Navigation.back(3)
      expect(cmd).toBeDefined()
    })

    it('forward should be a valid Cmd', () => {
      const cmd = Navigation.forward()
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
      const sub = Navigation.urlChanges((loc) => ({ type: 'UrlChanged', loc }))
      expect(sub).toBeDefined()
    })

    it('hashChanges should be a valid Sub', () => {
      const sub = Navigation.hashChanges((hash) => ({ type: 'HashChanged', hash }))
      expect(sub).toBeDefined()
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
})
