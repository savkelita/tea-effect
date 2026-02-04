/**
 * Navigation module provides browser history and URL management for tea-effect applications.
 *
 * This module is inspired by [Elm's Browser.Navigation](https://package.elm-lang.org/packages/elm/browser/latest/Browser-Navigation).
 *
 * ## Overview
 *
 * The core functionality allows you to navigate to new URLs, changing the browser's address bar
 * **without** loading new HTML from the server. Instead, URL changes are handled by your application
 * through subscriptions.
 *
 * ## Key Concepts
 *
 * - **`linkClicks`** - Intercepts link clicks, letting you decide how to handle navigation
 * - **`urlChanges`** - Notifies when URL actually changes (from any source)
 * - **`pushUrl`** - Changes URL and adds entry to browser history (back button works)
 * - **`replaceUrl`** - Changes URL but replaces current history entry (no back button entry)
 * - **`load`** - Leaves current page entirely and loads new HTML
 *
 * ## Navigation Flow
 *
 * ```
 * [User clicks <a href="/about">]
 *           ↓
 *    linkClicks subscription
 *           ↓
 *  UrlRequest { _tag: 'Internal', location: { pathname: '/about', ... } }
 *           ↓
 *    update function decides: pushUrl? load? prevent?
 *           ↓
 *    urlChanges subscription
 *           ↓
 *  Location { pathname: '/about', ... }
 *           ↓
 *    update function updates route in model
 * ```
 *
 * ## Example
 *
 * ```ts
 * import { Navigation } from 'tea-effect'
 * import type { Cmd, Sub } from 'tea-effect'
 *
 * type Msg =
 *   | { type: 'LinkClicked'; request: Navigation.UrlRequest }
 *   | { type: 'UrlChanged'; location: Navigation.Location }
 *
 * const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
 *   switch (msg.type) {
 *     case 'LinkClicked':
 *       switch (msg.request._tag) {
 *         case 'Internal':
 *           return [model, Navigation.pushUrl(msg.request.location.pathname)]
 *         case 'External':
 *           return [model, Navigation.load(msg.request.href)]
 *       }
 *     case 'UrlChanged':
 *       return [{ ...model, route: parseRoute(msg.location) }, Cmd.none]
 *   }
 * }
 *
 * const subscriptions = (): Sub.Sub<Msg> =>
 *   Sub.batch([
 *     Navigation.linkClicks((request) => ({ type: 'LinkClicked', request })),
 *     Navigation.urlChanges((location) => ({ type: 'UrlChanged', location }))
 *   ])
 * ```
 *
 * @since 0.5.0
 * @see {@link https://package.elm-lang.org/packages/elm/browser/latest/Browser-Navigation Elm's Browser.Navigation}
 */
import { Effect, Stream } from 'effect'
import type { Cmd } from './Cmd'
import type { Sub } from './Sub'

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

/**
 * Represents a request to navigate to a new URL.
 *
 * When a user clicks a link, the `linkClicks` subscription intercepts it
 * and produces a `UrlRequest`. Your application then decides what to do:
 *
 * - **Internal** - Same origin, can be handled with `pushUrl`
 * - **External** - Different origin, typically handled with `load`
 *
 * This pattern allows you to:
 * - Prevent navigation (e.g., "You have unsaved changes" dialog)
 * - Handle internal vs external links differently
 * - Save scroll position before navigating
 *
 * @example
 * ```ts
 * const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
 *   switch (msg.type) {
 *     case 'LinkClicked':
 *       switch (msg.request._tag) {
 *         case 'Internal':
 *           return [model, Navigation.pushUrl(msg.request.location.pathname)]
 *         case 'External':
 *           return [model, Navigation.load(msg.request.href)]
 *       }
 *   }
 * }
 * ```
 *
 * @since 0.5.0
 * @category Model
 */
export type UrlRequest =
  | { readonly _tag: 'Internal'; readonly location: Location }
  | { readonly _tag: 'External'; readonly href: string }

/**
 * Represents the current browser location.
 *
 * This is a simplified representation of `window.location` containing
 * only the properties needed for client-side routing.
 *
 * @example
 * ```ts
 * // For URL: https://example.com/users/123?search=foo#section
 * const location: Navigation.Location = {
 *   pathname: '/users/123',
 *   search: '?search=foo',
 *   hash: '#section',
 *   href: 'https://example.com/users/123?search=foo#section',
 *   origin: 'https://example.com'
 * }
 * ```
 *
 * @since 0.5.0
 * @category Model
 */
export interface Location {
  /** The path of the URL (e.g., "/users/123") */
  readonly pathname: string
  /** The query string including "?" (e.g., "?search=foo"), or empty string if none */
  readonly search: string
  /** The hash including "#" (e.g., "#section"), or empty string if none */
  readonly hash: string
  /** The full URL (e.g., "https://example.com/users/123?search=foo#section") */
  readonly href: string
  /** The origin (e.g., "https://example.com") */
  readonly origin: string
}

/**
 * Gets the current browser location.
 *
 * In non-browser environments (SSR), returns a default location with pathname "/".
 *
 * @since 0.5.0
 * @category Model
 */
export const getLocation = (): Location => {
  if (typeof window === 'undefined') {
    return { pathname: '/', search: '', hash: '', href: '/', origin: '' }
  }
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    href: window.location.href,
    origin: window.location.origin
  }
}

// -------------------------------------------------------------------------------------
// Commands
// -------------------------------------------------------------------------------------

/**
 * Changes the URL and adds a new entry to the browser history.
 *
 * The browser's back button will return to the previous URL.
 * This does NOT load new HTML - it triggers a `urlChanges` message instead.
 *
 * Use this for normal navigation within your application.
 *
 * @example
 * ```ts
 * // Navigate to a new page
 * Navigation.pushUrl('/users/123')
 *
 * // Navigate with query params
 * Navigation.pushUrl('/search?q=hello')
 * ```
 *
 * @since 0.5.0
 * @category Commands
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
 *
 * The browser's back button will NOT return to the current URL.
 * Use this for changes that shouldn't create new history entries,
 * such as updating search/filter parameters.
 *
 * @example
 * ```ts
 * // Update filters without cluttering history
 * Navigation.replaceUrl('/users?sort=name&order=asc')
 * ```
 *
 * @since 0.5.0
 * @category Commands
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
 * Equivalent to the user clicking the browser's back button.
 *
 * @example
 * ```ts
 * // Go back one page
 * Navigation.back(1)
 *
 * // Go back three pages
 * Navigation.back(3)
 * ```
 *
 * @since 0.5.0
 * @category Commands
 */
export const back = <Msg = never>(steps: number): Cmd<Msg> =>
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
 * Equivalent to the user clicking the browser's forward button.
 *
 * @example
 * ```ts
 * // Go forward one page
 * Navigation.forward(1)
 * ```
 *
 * @since 0.5.0
 * @category Commands
 */
export const forward = <Msg = never>(steps: number): Cmd<Msg> =>
  Stream.execute(
    Effect.sync(() => {
      if (typeof window !== 'undefined') {
        window.history.go(steps)
      }
    })
  )

/**
 * Leaves the current page and loads the given URL.
 *
 * **This will navigate away from your application entirely.**
 * A whole new HTML page will be loaded from the server.
 *
 * Use this for:
 * - External links (different domain)
 * - Links that need a full page refresh
 *
 * @example
 * ```ts
 * // Navigate to external site
 * Navigation.load('https://elm-lang.org')
 *
 * // Force reload current page from server
 * Navigation.load(window.location.href)
 * ```
 *
 * @since 0.5.0
 * @category Commands
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
 * @since 0.5.0
 * @category Commands
 */
export const reload: Cmd<never> = Stream.execute(
  Effect.sync(() => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  })
)

// -------------------------------------------------------------------------------------
// Subscriptions
// -------------------------------------------------------------------------------------

/**
 * Subscribe to URL changes.
 *
 * Emits a message whenever the URL changes through:
 * - `pushUrl` or `replaceUrl` commands
 * - Browser back/forward buttons
 * - Direct URL manipulation
 *
 * The subscription automatically emits the current location when first subscribed,
 * so your application always starts with the correct route.
 *
 * @example
 * ```ts
 * type Msg = { type: 'UrlChanged'; location: Navigation.Location }
 *
 * const subscriptions = (): Sub.Sub<Msg> =>
 *   Navigation.urlChanges((location) => ({
 *     type: 'UrlChanged',
 *     location
 *   }))
 * ```
 *
 * @since 0.5.0
 * @category Subscriptions
 */
export const urlChanges = <Msg>(toMsg: (location: Location) => Msg): Sub<Msg> =>
  Stream.async<Msg>((emit) => {
    if (typeof window === 'undefined') {
      return
    }

    const handler = () => {
      emit.single(toMsg(getLocation()))
    }

    // Emit initial location immediately
    handler()

    // Listen for popstate events (back/forward navigation and programmatic changes)
    window.addEventListener('popstate', handler)

    return Effect.sync(() => {
      window.removeEventListener('popstate', handler)
    })
  })

/**
 * Subscribe to link clicks.
 *
 * Intercepts clicks on `<a>` elements and emits a `UrlRequest` message
 * instead of letting the browser navigate. This gives your application
 * control over navigation decisions.
 *
 * The subscription distinguishes between:
 * - **Internal links** - Same origin (e.g., `/about`, `/users/123`)
 * - **External links** - Different origin (e.g., `https://google.com`)
 *
 * Links are NOT intercepted when:
 * - Modifier keys are pressed (Ctrl, Meta, Shift for new tab/window)
 * - The link has `target="_blank"`
 * - The link has `download` attribute
 * - The link uses `mailto:`, `tel:`, or other non-http protocols
 *
 * @example
 * ```ts
 * type Msg =
 *   | { type: 'LinkClicked'; request: Navigation.UrlRequest }
 *   | { type: 'UrlChanged'; location: Navigation.Location }
 *
 * const update = (msg: Msg, model: Model): [Model, Cmd.Cmd<Msg>] => {
 *   switch (msg.type) {
 *     case 'LinkClicked':
 *       switch (msg.request._tag) {
 *         case 'Internal':
 *           // Check for unsaved changes before navigating
 *           if (model.hasUnsavedChanges) {
 *             return [{ ...model, showConfirmDialog: true }, Cmd.none]
 *           }
 *           return [model, Navigation.pushUrl(msg.request.location.pathname)]
 *         case 'External':
 *           return [model, Navigation.load(msg.request.href)]
 *       }
 *     case 'UrlChanged':
 *       return [{ ...model, route: parseRoute(msg.location) }, Cmd.none]
 *   }
 * }
 *
 * const subscriptions = (): Sub.Sub<Msg> =>
 *   Sub.batch([
 *     Navigation.linkClicks((request) => ({ type: 'LinkClicked', request })),
 *     Navigation.urlChanges((location) => ({ type: 'UrlChanged', location }))
 *   ])
 * ```
 *
 * @since 0.5.0
 * @category Subscriptions
 */
export const linkClicks = <Msg>(toMsg: (request: UrlRequest) => Msg): Sub<Msg> =>
  Stream.async<Msg>((emit) => {
    if (typeof window === 'undefined') {
      return
    }

    const handler = (event: MouseEvent) => {
      // Find the closest <a> element
      const target = (event.target as Element)?.closest('a')
      if (!target) return

      const href = target.getAttribute('href')
      if (!href) return

      // Don't intercept if modifier keys are pressed (new tab/window)
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return

      // Don't intercept if target="_blank" or download attribute
      if (target.hasAttribute('download')) return
      if (target.getAttribute('target') === '_blank') return

      // Don't intercept non-http protocols
      if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return

      // Prevent default browser navigation
      event.preventDefault()

      // Determine if internal or external
      try {
        const url = new URL(href, window.location.origin)

        if (url.origin === window.location.origin) {
          // Internal link
          emit.single(
            toMsg({
              _tag: 'Internal',
              location: {
                pathname: url.pathname,
                search: url.search,
                hash: url.hash,
                href: url.href,
                origin: url.origin
              }
            })
          )
        } else {
          // External link
          emit.single(toMsg({ _tag: 'External', href: url.href }))
        }
      } catch {
        // Invalid URL, treat as internal path
        emit.single(
          toMsg({
            _tag: 'Internal',
            location: {
              pathname: href,
              search: '',
              hash: '',
              href: href,
              origin: window.location.origin
            }
          })
        )
      }
    }

    // Use capture phase to intercept before other handlers
    window.addEventListener('click', handler, true)

    return Effect.sync(() => {
      window.removeEventListener('click', handler, true)
    })
  })

