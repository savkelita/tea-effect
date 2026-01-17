/**
 * Navigation module provides browser history and URL management for tea-effect programs.
 *
 * Inspired by [Elm's Browser.Navigation](https://package.elm-lang.org/packages/elm/browser/latest/Browser-Navigation)
 * and [gcanti's elm-ts](https://github.com/gcanti/elm-ts).
 *
 * @example
 * ```ts
 * import { Navigation } from 'tea-effect'
 *
 * type Msg =
 *   | { type: 'UrlChanged'; location: Navigation.Location }
 *   | { type: 'Navigate'; url: string }
 *
 * const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
 *   switch (msg.type) {
 *     case 'Navigate':
 *       return [model, Navigation.pushUrl(msg.url)]
 *     case 'UrlChanged':
 *       return [{ ...model, route: parseRoute(msg.location) }, Cmd.none]
 *   }
 * }
 *
 * const subscriptions = (): Sub.Sub<Msg> =>
 *   Navigation.urlChanges((location) => ({ type: 'UrlChanged', location }))
 * ```
 *
 * @since 0.3.0
 */
import { Effect, Stream } from 'effect'
import type { Cmd } from './Cmd'
import type { Sub } from './Sub'

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * Represents the current browser location.
 *
 * @since 0.3.0
 * @category model
 */
export interface Location {
  /** The path of the URL (e.g., "/users/123") */
  readonly pathname: string
  /** The query string including "?" (e.g., "?search=foo") */
  readonly search: string
  /** The hash including "#" (e.g., "#section") */
  readonly hash: string
  /** The full URL (e.g., "https://example.com/users/123?search=foo#section") */
  readonly href: string
  /** The origin (e.g., "https://example.com") */
  readonly origin: string
}

// -------------------------------------------------------------------------------------
// constructors
// -------------------------------------------------------------------------------------

/**
 * Gets the current browser location.
 *
 * @example
 * ```ts
 * const location = Navigation.getLocation()
 * console.log(location.pathname) // "/users/123"
 * ```
 *
 * @since 0.3.0
 * @category constructors
 */
export const getLocation = (): Location => {
  if (typeof window === 'undefined') {
    return {
      pathname: '/',
      search: '',
      hash: '',
      href: '/',
      origin: ''
    }
  }
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    href: window.location.href,
    origin: window.location.origin
  }
}

/**
 * Creates a Location from a URL string.
 *
 * @since 0.3.0
 * @category constructors
 */
export const fromUrl = (url: string): Location => {
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    return {
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      href: parsed.href,
      origin: parsed.origin
    }
  } catch {
    return {
      pathname: url,
      search: '',
      hash: '',
      href: url,
      origin: ''
    }
  }
}

// -------------------------------------------------------------------------------------
// commands
// -------------------------------------------------------------------------------------

/**
 * Changes the URL and adds a new entry to the browser history.
 * The browser's back button will return to the previous URL.
 *
 * @example
 * ```ts
 * // Navigate to /users/123
 * const cmd = Navigation.pushUrl('/users/123')
 * ```
 *
 * @since 0.3.0
 * @category commands
 */
export const pushUrl = <Msg = never>(url: string): Cmd<Msg> =>
  Stream.execute(
    Effect.sync(() => {
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    })
  )

/**
 * Changes the URL but replaces the current entry in browser history.
 * The browser's back button will NOT return to the current URL.
 * Useful for search/filter parameters where you don't want cluttered history.
 *
 * @example
 * ```ts
 * // Update URL without adding to history
 * const cmd = Navigation.replaceUrl('/users?search=foo')
 * ```
 *
 * @since 0.3.0
 * @category commands
 */
export const replaceUrl = <Msg = never>(url: string): Cmd<Msg> =>
  Stream.execute(
    Effect.sync(() => {
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    })
  )

/**
 * Goes back a number of pages in browser history.
 *
 * @example
 * ```ts
 * // Go back one page
 * const cmd = Navigation.back()
 *
 * // Go back 3 pages
 * const cmd = Navigation.back(3)
 * ```
 *
 * @since 0.3.0
 * @category commands
 */
export const back = <Msg = never>(steps: number = 1): Cmd<Msg> =>
  Stream.execute(
    Effect.sync(() => {
      if (typeof window !== 'undefined') {
        window.history.go(-steps)
      }
    })
  )

/**
 * Goes forward a number of pages in browser history.
 *
 * @example
 * ```ts
 * // Go forward one page
 * const cmd = Navigation.forward()
 *
 * // Go forward 2 pages
 * const cmd = Navigation.forward(2)
 * ```
 *
 * @since 0.3.0
 * @category commands
 */
export const forward = <Msg = never>(steps: number = 1): Cmd<Msg> =>
  Stream.execute(
    Effect.sync(() => {
      if (typeof window !== 'undefined') {
        window.history.go(steps)
      }
    })
  )

/**
 * Leaves the current page and loads the given URL.
 * This will navigate away from the current application.
 *
 * @example
 * ```ts
 * // Navigate to external site
 * const cmd = Navigation.load('https://example.com')
 *
 * // Force reload same page
 * const cmd = Navigation.load(window.location.href)
 * ```
 *
 * @since 0.3.0
 * @category commands
 */
export const load = <Msg = never>(url: string): Cmd<Msg> =>
  Stream.execute(
    Effect.sync(() => {
      if (typeof window !== 'undefined') {
        window.location.href = url
      }
    })
  )

/**
 * Reloads the current page.
 *
 * @example
 * ```ts
 * const cmd = Navigation.reload
 * ```
 *
 * @since 0.3.0
 * @category commands
 */
export const reload: Cmd<never> = Stream.execute(
  Effect.sync(() => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  })
)

// -------------------------------------------------------------------------------------
// subscriptions
// -------------------------------------------------------------------------------------

/**
 * Subscribe to URL changes. Emits a message whenever the URL changes
 * (via pushUrl, replaceUrl, back, forward, or browser navigation).
 *
 * @example
 * ```ts
 * const subscriptions = (): Sub.Sub<Msg> =>
 *   Navigation.urlChanges((location) => ({
 *     type: 'UrlChanged',
 *     location
 *   }))
 * ```
 *
 * @since 0.3.0
 * @category subscriptions
 */
export const urlChanges = <Msg>(toMsg: (location: Location) => Msg): Sub<Msg> =>
  Stream.async<Msg>((emit) => {
    if (typeof window === 'undefined') {
      return
    }

    const handler = () => {
      emit.single(toMsg(getLocation()))
    }

    // Emit initial location
    handler()

    // Listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', handler)

    // Return cleanup function
    return Effect.sync(() => {
      window.removeEventListener('popstate', handler)
    })
  })

/**
 * Subscribe to hash changes only. Emits a message whenever the URL hash changes.
 *
 * @example
 * ```ts
 * const subscriptions = (): Sub.Sub<Msg> =>
 *   Navigation.hashChanges((hash) => ({
 *     type: 'HashChanged',
 *     hash
 *   }))
 * ```
 *
 * @since 0.3.0
 * @category subscriptions
 */
export const hashChanges = <Msg>(toMsg: (hash: string) => Msg): Sub<Msg> =>
  Stream.async<Msg>((emit) => {
    if (typeof window === 'undefined') {
      return
    }

    const handler = () => {
      emit.single(toMsg(window.location.hash))
    }

    // Emit initial hash
    handler()

    // Listen for hashchange events
    window.addEventListener('hashchange', handler)

    // Return cleanup function
    return Effect.sync(() => {
      window.removeEventListener('hashchange', handler)
    })
  })

// -------------------------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------------------------

/**
 * Parses query string into a Record.
 *
 * @example
 * ```ts
 * const params = Navigation.parseQuery('?search=foo&page=2')
 * // { search: 'foo', page: '2' }
 * ```
 *
 * @since 0.3.0
 * @category helpers
 */
export const parseQuery = (search: string): Record<string, string> => {
  const params: Record<string, string> = {}
  const searchParams = new URLSearchParams(search)
  searchParams.forEach((value, key) => {
    params[key] = value
  })
  return params
}

/**
 * Builds a query string from a Record.
 *
 * @example
 * ```ts
 * const query = Navigation.buildQuery({ search: 'foo', page: '2' })
 * // '?search=foo&page=2'
 * ```
 *
 * @since 0.3.0
 * @category helpers
 */
export const buildQuery = (params: Record<string, string>): string => {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, value)
    }
  })
  const result = searchParams.toString()
  return result ? `?${result}` : ''
}

/**
 * Combines pathname, query params, and hash into a URL string.
 *
 * @example
 * ```ts
 * const url = Navigation.buildUrl('/users', { search: 'foo' }, '#top')
 * // '/users?search=foo#top'
 * ```
 *
 * @since 0.3.0
 * @category helpers
 */
export const buildUrl = (
  pathname: string,
  params?: Record<string, string>,
  hash?: string
): string => {
  const query = params ? buildQuery(params) : ''
  const hashPart = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : ''
  return `${pathname}${query}${hashPart}`
}
