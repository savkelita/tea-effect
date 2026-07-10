/**
 * Formatter for generating URLs from typed parameters.
 *
 * @since 0.6.0
 */

import { Route } from './Route'

/**
 * A Formatter generates a Route from typed parameters.
 *
 * @since 0.6.0
 * @category Model
 */
export interface Formatter<A> {
  readonly format: (params: A) => Route
}

// -------------------------------------------------------------------------------------
// Constructors
// -------------------------------------------------------------------------------------

/**
 * A formatter that produces an empty route.
 *
 * @since 0.6.0
 * @category Constructors
 */
export const empty: Formatter<{}> = {
  format: () => Route.empty
}

// -------------------------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------------------------

/**
 * Format a literal path segment.
 *
 * @example
 * ```ts
 * const formatter = lit('users')
 * formatter.format({}) // → Route(['users'], {})
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const lit = (segment: string): Formatter<{}> => ({
  format: () => new Route([segment], new URLSearchParams())
})

/**
 * Format a string parameter as a path segment.
 *
 * @example
 * ```ts
 * const formatter = str('name')
 * formatter.format({ name: 'john' }) // → Route(['john'], {})
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const str = <K extends string>(key: K): Formatter<{ readonly [P in K]: string }> => ({
  format: (params) => new Route([params[key]], new URLSearchParams())
})

/**
 * Format a number parameter as a path segment.
 *
 * @example
 * ```ts
 * const formatter = int('id')
 * formatter.format({ id: 42 }) // → Route(['42'], {})
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const int = <K extends string>(key: K): Formatter<{ readonly [P in K]: number }> => ({
  format: (params) => new Route([String(params[key])], new URLSearchParams())
})

/**
 * Format a parameter using a custom encoder.
 *
 * @since 0.6.0
 * @category Primitives
 */
export const param = <K extends string, A>(
  key: K,
  encode: (a: A) => string
): Formatter<{ readonly [P in K]: A }> => ({
  format: (params) => new Route([encode(params[key])], new URLSearchParams())
})

/**
 * Format query parameters from an object.
 *
 * Handles both single values and arrays (repeated query params).
 * Undefined and null values are omitted.
 *
 * @example
 * ```ts
 * const formatter = query<{ q: string; page?: number }>()
 * formatter.format({ q: 'hello', page: 2 }) // → Route([], { q: 'hello', page: '2' })
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const query = <A extends Record<string, unknown>>(
  keys?: readonly string[],
  exclude?: readonly string[]
): Formatter<A> => ({
  format: (params) => {
    const searchParams = new URLSearchParams()
    // When the query keys can be enumerated statically, use exactly those.
    // Otherwise (unknown schema shape, e.g. transform/union/record) fall back
    // to every runtime key EXCEPT the path params, so path params can never
    // leak into the query string and no query param is silently dropped.
    const entries = keys && keys.length > 0
      ? keys.map(k => [k, (params as Record<string, unknown>)[k]] as const)
      : Object.entries(params).filter(([k]) => !(exclude ?? []).includes(k))

    for (const [key, value] of entries) {
      if (value === undefined || value === null) continue

      if (Array.isArray(value)) {
        for (const v of value) {
          if (v !== undefined && v !== null) {
            searchParams.append(key, String(v))
          }
        }
      } else {
        searchParams.append(key, String(value))
      }
    }

    return new Route([], searchParams)
  }
})

/**
 * Format for the end of path (produces empty route).
 *
 * @since 0.6.0
 * @category Primitives
 */
export const end: Formatter<{}> = empty

// -------------------------------------------------------------------------------------
// Combinators
// -------------------------------------------------------------------------------------

/**
 * Combine two formatters, concatenating their routes.
 *
 * @example
 * ```ts
 * const formatter = combine(lit('users'), int('id'))
 * formatter.format({ id: 42 }) // → Route(['users', '42'], {})
 * ```
 *
 * @since 0.6.0
 * @category Combinators
 */
export const combine = <A extends Record<string, unknown>, B extends Record<string, unknown>>(fa: Formatter<A>, fb: Formatter<B>): Formatter<A & B> => ({
  format: (params) => {
    const routeA = fa.format(params as A)
    const routeB = fb.format(params as B)

    const segments = [...routeA.segments, ...routeB.segments]
    const query = new URLSearchParams([
      ...routeA.query.entries(),
      ...routeB.query.entries()
    ])

    return new Route(segments, query)
  }
})

/**
 * Combine multiple formatters.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const combineAll = <T extends Formatter<Record<string, unknown>>[]>(
  ...formatters: T
): Formatter<UnionToIntersection<FormatterValue<T[number]>>> => ({
  format: (params) => {
    let segments: string[] = []
    let query = new URLSearchParams()

    for (const formatter of formatters) {
      const route = formatter.format(params as any)
      segments = [...segments, ...route.segments]
      for (const [key, value] of route.query.entries()) {
        query.append(key, value)
      }
    }

    return new Route(segments, query)
  }
})

/**
 * Transform the input parameters before formatting.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const contramap = <A, B>(formatter: Formatter<A>, f: (b: B) => A): Formatter<B> => ({
  format: (params) => formatter.format(f(params))
})

// -------------------------------------------------------------------------------------
// Type utilities
// -------------------------------------------------------------------------------------

/**
 * Extract the parameter type from a Formatter.
 *
 * @since 0.6.0
 * @category Type utilities
 */
export type FormatterValue<F> = F extends Formatter<infer A> ? A : never

/**
 * Helper type for merging intersection types.
 *
 * @since 0.6.0
 * @category Type utilities
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never
