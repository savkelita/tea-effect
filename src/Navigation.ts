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
 * - **`program`** - High-level wrapper that automatically wires navigation subscriptions
 * - **`linkClicks`** - Intercepts link clicks, letting you decide how to handle navigation
 * - **`urlChanges`** - Notifies when URL actually changes (from any source)
 * - **`pushUrl`** - Changes URL and adds entry to browser history (back button works)
 * - **`replaceUrl`** - Changes URL but replaces current history entry (no back button entry)
 * - **`load`** - Leaves current page entirely and loads new HTML
 *
 * ## Using Navigation.program (Recommended)
 *
 * The `program` function is the recommended way to create SPA applications with routing.
 * It automatically handles navigation subscriptions and passes the initial location to init.
 *
 * ```ts
 * import * as Navigation from 'tea-effect/Navigation'
 * import * as TeaReact from 'tea-effect/React'
 *
 * const App = Navigation.program({
 *   init: (location) => [{ route: parseRoute(location) }, Cmd.none],
 *   update,
 *   view,
 *   subscriptions: () => Sub.none,
 *   onUrlRequest: (request) => ({ type: 'LinkClicked', request }),
 *   onUrlChange: (location) => ({ type: 'UrlChanged', location }),
 * })
 *
 * TeaReact.run(App, (element) => root.render(element))
 * ```
 *
 * ## Using Low-Level API
 *
 * For more control, you can use the individual subscriptions directly:
 *
 * ```ts
 * const subscriptions = (): Sub.Sub<Msg> =>
 *   Sub.batch([
 *     Navigation.linkClicks((request) => ({ type: 'LinkClicked', request })),
 *     Navigation.urlChanges((location) => ({ type: 'UrlChanged', location }))
 *   ])
 * ```
 *
 * ## Navigation Flow
 *
 * ```
 * [User clicks <a href="/about">]
 *           ↓
 *    linkClicks / onUrlRequest
 *           ↓
 *  UrlRequest { _tag: 'Internal', location: { pathname: '/about', ... } }
 *           ↓
 *    update function decides: pushUrl? load? prevent?
 *           ↓
 *    urlChanges / onUrlChange
 *           ↓
 *  Location { pathname: '/about', ... }
 *           ↓
 *    update function updates route in model
 * ```
 *
 * @since 0.5.0
 * @see {@link https://package.elm-lang.org/packages/elm/browser/latest/Browser-Navigation Elm's Browser.Navigation}
 */
import { Effect, Stream, Scope } from 'effect'
import type { Cmd } from './Cmd'
import { batch as subBatch, none as subNone, fromCallback, Sub } from './Sub'
import * as Html from './Html'

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

// A programmatic pushUrl/replaceUrl notifies urlChanges by dispatching a
// synthetic popstate. It is deferred to a macrotask so that a navigation issued
// from init's Cmd is delivered even though the urlChanges listener registers
// slightly after the initial Cmd runs. (No module-global state, so nothing
// leaks between program instances.)
const notifyUrlChange = (): void => {
  setTimeout(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, 0)
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
        notifyUrlChange()
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
        notifyUrlChange()
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
 * **Note:** This subscription does NOT emit the initial location.
 * Use `getLocation()` in your `init` function to get the starting route.
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
  fromCallback<Msg>((emit) => {
    if (typeof window === 'undefined') {
      return () => {}
    }

    const handler = () => emit(toMsg(getLocation()))

    // popstate covers browser back/forward AND the deferred synthetic popstate
    // dispatched by pushUrl/replaceUrl.
    window.addEventListener('popstate', handler)

    return () => {
      window.removeEventListener('popstate', handler)
    }
  }, 'navigation:urlChanges')

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
  fromCallback<Msg>((emit) => {
    if (typeof window === 'undefined') {
      return () => {}
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

      // Determine if internal or external. Resolve against the current document
      // URL (not the origin) so relative, query-only and hash-only hrefs match
      // what the browser's default navigation would have produced.
      try {
        const url = new URL(href, window.location.href)

        if (url.origin === window.location.origin) {
          // Internal link
          emit(
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
          emit(toMsg({ _tag: 'External', href: url.href }))
        }
      } catch {
        // Invalid URL, treat as internal path
        emit(
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

    return () => {
      window.removeEventListener('click', handler, true)
    }
  }, 'navigation:linkClicks')

// -------------------------------------------------------------------------------------
// Program
// -------------------------------------------------------------------------------------

/**
 * Configuration for Navigation.program
 *
 * @since 0.5.0
 * @category Program
 */
export interface ProgramConfig<Model, Msg, Dom, E = never, R = never> {
  /**
   * Initialize the application with the current browser location.
   * Called once when the program starts.
   */
  readonly init: (location: Location) => readonly [Model, Cmd<Msg, E, R>]

  /**
   * Handle messages and return new model + commands.
   */
  readonly update: (msg: Msg, model: Model) => readonly [Model, Cmd<Msg, E, R>]

  /**
   * Render the model to DOM.
   */
  readonly view: (model: Model) => Html.Html<Dom, Msg>

  /**
   * Additional subscriptions (besides navigation).
   * Navigation subscriptions are automatically included.
   */
  readonly subscriptions?: (model: Model) => Sub<Msg, E, R>

  /**
   * Handle link clicks.
   * Receives a UrlRequest which is either Internal (same origin) or External.
   */
  readonly onUrlRequest: (request: UrlRequest) => Msg

  /**
   * Handle URL changes.
   * Called when the URL changes from any source (pushUrl, back/forward, etc.)
   */
  readonly onUrlChange: (location: Location) => Msg
}

/**
 * Creates a navigation-enabled program (like Elm's Browser.application).
 *
 * This is the recommended way to create SPA applications with routing.
 * It automatically:
 * - Passes the initial location to your `init` function
 * - Subscribes to link clicks and URL changes
 * - Batches navigation subscriptions with your custom subscriptions
 *
 * @example
 * ```ts
 * import * as Navigation from 'tea-effect/Navigation'
 * import * as TeaReact from 'tea-effect/React'
 * import * as Cmd from 'tea-effect/Cmd'
 * import * as Sub from 'tea-effect/Sub'
 *
 * type Route = 'home' | 'about' | 'contact' | 'not-found'
 *
 * type Model = { route: Route }
 *
 * type Msg =
 *   | { type: 'LinkClicked'; request: Navigation.UrlRequest }
 *   | { type: 'UrlChanged'; location: Navigation.Location }
 *
 * const parseRoute = (location: Navigation.Location): Route => {
 *   switch (location.pathname) {
 *     case '/': return 'home'
 *     case '/about': return 'about'
 *     case '/contact': return 'contact'
 *     default: return 'not-found'
 *   }
 * }
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
 * const App = Navigation.program({
 *   init: (location) => [{ route: parseRoute(location) }, Cmd.none],
 *   update,
 *   view,
 *   subscriptions: () => Sub.none,
 *   onUrlRequest: (request) => ({ type: 'LinkClicked', request }),
 *   onUrlChange: (location) => ({ type: 'UrlChanged', location }),
 * })
 *
 * // Run with React
 * TeaReact.run(App, (element) => root.render(element))
 * ```
 *
 * @since 0.5.0
 * @category Program
 */
export const program = <Model, Msg, Dom, E = never, R = never>(
  config: ProgramConfig<Model, Msg, Dom, E, R>
): Effect.Effect<Html.Program<Model, Msg, Dom, E, R>, E, R | Scope.Scope> => {
  const {
    init,
    update,
    view,
    subscriptions = () => subNone,
    onUrlRequest,
    onUrlChange
  } = config

  // Create combined subscriptions that include navigation
  const combinedSubscriptions = (model: Model): Sub<Msg, E, R> =>
    subBatch([
      subscriptions(model),
      linkClicks(onUrlRequest) as Sub<Msg, E, R>,
      urlChanges(onUrlChange) as Sub<Msg, E, R>
    ])

  // Read the location and call init when the program actually starts (deferred),
  // not while constructing the returned Effect, so a URL change before run and
  // re-runs both see the current URL.
  return Effect.suspend(() =>
    Html.program(init(getLocation()), update, view, combinedSubscriptions)
  )
}

