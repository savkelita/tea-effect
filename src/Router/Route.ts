/**
 * Route represents parsed URL components for routing.
 *
 * @since 0.6.0
 */

import type { Location } from '../Navigation'

/**
 * Represents a parsed URL with path segments and query parameters.
 *
 * @example
 * ```ts
 * // For URL: /users/42?sort=name
 * const route = Route.parse('/users/42', '?sort=name')
 * // route.segments = ['users', '42']
 * // route.query = URLSearchParams { 'sort' => 'name' }
 * ```
 *
 * @since 0.6.0
 * @category Model
 */
export class Route {
  constructor(
    readonly segments: ReadonlyArray<string>,
    readonly query: URLSearchParams
  ) {}

  /**
   * Parse a pathname and search string into a Route.
   *
   * @since 0.6.0
   */
  static parse(pathname: string, search: string = ''): Route {
    const segments = pathname.split('/').filter(Boolean)
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
    const path = '/' + this.segments.join('/')
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
