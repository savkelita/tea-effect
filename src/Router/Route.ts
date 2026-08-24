/**
 * Route represents parsed URL components for routing.
 *
 * @since 0.6.0
 */

import type { Location } from '../Navigation'

/**
 * Represents a parsed URL with path segments and query parameters.
 *
 * @since 0.6.0
 * @category Model
 */
// The example lives on `parse` below, not here: docgen extracts examples from a
// class's methods but not from the class declaration, so one written here would
// be published on the API page without ever being compiled.
export class Route {
  constructor(
    readonly segments: ReadonlyArray<string>,
    readonly query: URLSearchParams
  ) {}

  /**
   * Parse a pathname and search string into a Route.
   *
   * @example
   * ```ts
   * import * as Router from 'tea-effect/Router'
   *
   * // For URL: /users/42?sort=name
   * const route = Router.Route.parse('/users/42', '?sort=name')
   *
   * const segments = route.segments // ['users', '42']
   * const sort = route.query.get('sort') // 'name'
   * ```
   *
   * @since 0.6.0
   */
  static parse(pathname: string, search: string = ''): Route {
    const segments = pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => {
        // Browsers deliver location.pathname percent-encoded; decode each
        // segment so captured params and literal matches use the real value.
        // Decode per-segment (after splitting) so an encoded %2F cannot forge
        // a segment boundary, and tolerate malformed sequences like '%zz'.
        try {
          return decodeURIComponent(segment)
        } catch {
          return segment
        }
      })
    const query = new URLSearchParams(search)
    return new Route(segments, query)
  }

  /**
   * Create a Route from a Navigation.Location.
   *
   * @since 0.6.0
   */
  static fromLocation(location: Pick<Location, 'pathname' | 'search'>): Route {
    return Route.parse(location.pathname, location.search)
  }

  /**
   * An empty Route with no segments and no query parameters.
   *
   * @since 0.6.0
   */
  static empty: Route = new Route([], new URLSearchParams())

  /**
   * Check if the route has no remaining segments.
   *
   * @since 0.6.0
   */
  isEmpty(): boolean {
    return this.segments.length === 0
  }

  /**
   * Convert the Route back to a URL string.
   *
   * @since 0.6.0
   */
  toString(): string {
    // Percent-encode each segment so values containing '/', '?', '#', spaces,
    // or unicode produce valid URLs that round-trip back through parse().
    const path = '/' + this.segments.map(encodeURIComponent).join('/')
    const queryString = this.query.toString()
    return queryString ? `${path}?${queryString}` : path
  }

  /**
   * Create a new Route with the first segment consumed.
   *
   * @since 0.6.0
   */
  consumeSegment(): Route {
    return new Route(this.segments.slice(1), this.query)
  }

  /**
   * Create a new Route with query parameters cleared.
   *
   * @since 0.6.0
   */
  clearQuery(): Route {
    return new Route(this.segments, new URLSearchParams())
  }
}
