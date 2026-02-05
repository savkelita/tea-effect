/**
 * Parser combinators for type-safe URL parsing.
 *
 * @since 0.6.0
 */

import { Option, Schema } from 'effect'
import { Route } from './Route'

/**
 * A Parser extracts typed values from a Route.
 *
 * Returns Option of tuple: [parsed value, remaining route]
 *
 * @since 0.6.0
 * @category Model
 */
export interface Parser<A> {
  readonly parse: (route: Route) => Option.Option<readonly [A, Route]>
}

// -------------------------------------------------------------------------------------
// Constructors
// -------------------------------------------------------------------------------------

/**
 * A parser that always succeeds with the given value.
 *
 * @since 0.6.0
 * @category Constructors
 */
export const succeed = <A>(value: A): Parser<A> => ({
  parse: (route) => Option.some([value, route] as const)
})

/**
 * A parser that always fails.
 *
 * @since 0.6.0
 * @category Constructors
 */
export const fail: Parser<never> = {
  parse: () => Option.none()
}

// -------------------------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------------------------

/**
 * Match a literal path segment.
 *
 * @example
 * ```ts
 * const parser = lit('users')
 * // Matches: /users/...
 * // Fails: /posts/...
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const lit = (segment: string): Parser<{}> => ({
  parse: (route) => {
    if (route.segments[0] === segment) {
      return Option.some([{}, route.consumeSegment()] as const)
    }
    return Option.none()
  }
})

/**
 * Capture a path segment as a string.
 *
 * @example
 * ```ts
 * const parser = str('name')
 * // /john → { name: 'john' }
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const str = <K extends string>(key: K): Parser<{ readonly [P in K]: string }> => ({
  parse: (route) => {
    const segment = route.segments[0]
    if (segment !== undefined && segment !== '') {
      return Option.some([
        { [key]: segment } as { readonly [P in K]: string },
        route.consumeSegment()
      ] as const)
    }
    return Option.none()
  }
})

/**
 * Capture a path segment as an integer.
 *
 * @example
 * ```ts
 * const parser = int('id')
 * // /42 → { id: 42 }
 * // /abc → fails
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const int = <K extends string>(key: K): Parser<{ readonly [P in K]: number }> => ({
  parse: (route) => {
    const segment = route.segments[0]
    if (segment !== undefined) {
      const num = parseInt(segment, 10)
      if (!isNaN(num) && String(num) === segment) {
        return Option.some([
          { [key]: num } as { readonly [P in K]: number },
          route.consumeSegment()
        ] as const)
      }
    }
    return Option.none()
  }
})

/**
 * Capture a path segment validated by a Schema.
 *
 * @example
 * ```ts
 * const parser = param('id', Schema.UUID)
 * // /550e8400-e29b-41d4-a716-446655440000 → { id: UUID }
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const param = <K extends string, A>(
  key: K,
  schema: Schema.Schema<A, string>
): Parser<{ readonly [P in K]: A }> => ({
  parse: (route) => {
    const segment = route.segments[0]
    if (segment !== undefined) {
      const result = Schema.decodeUnknownOption(schema)(segment)
      if (Option.isSome(result)) {
        return Option.some([
          { [key]: result.value } as { readonly [P in K]: A },
          route.consumeSegment()
        ] as const)
      }
    }
    return Option.none()
  }
})

/**
 * Type for query parameter values (single string or array).
 *
 * @since 0.6.0
 * @category Model
 */
export type QueryRecord = Record<string, string | ReadonlyArray<string> | undefined>

/**
 * Parse query parameters with a Schema.
 *
 * Handles both single values and arrays (for repeated query params).
 *
 * @example
 * ```ts
 * const parser = query(Schema.Struct({
 *   q: Schema.String,
 *   page: Schema.optional(Schema.NumberFromString)
 * }))
 * // ?q=hello&page=2 → { q: 'hello', page: 2 }
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const query = <A, I>(
  schema: Schema.Schema<A, I, never>
): Parser<A> => ({
  parse: (route) => {
    const queryObj: Record<string, string | string[]> = {}

    route.query.forEach((value, key) => {
      const existing = queryObj[key]
      if (existing === undefined) {
        queryObj[key] = value
      } else if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        queryObj[key] = [existing, value]
      }
    })

    const result = Schema.decodeUnknownOption(schema)(queryObj)
    if (Option.isSome(result)) {
      return Option.some([result.value, route.clearQuery()] as const)
    }
    return Option.none()
  }
})

/**
 * Match the end of the path (no more segments).
 *
 * @example
 * ```ts
 * const parser = pipe(lit('users'), zip(end))
 * // Matches: /users
 * // Fails: /users/123
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const end: Parser<{}> = {
  parse: (route) => {
    if (route.segments.length === 0) {
      return Option.some([{}, route] as const)
    }
    return Option.none()
  }
}

/**
 * Match the root path (/).
 *
 * @since 0.6.0
 * @category Primitives
 */
export const root: Parser<{}> = end

// -------------------------------------------------------------------------------------
// Combinators
// -------------------------------------------------------------------------------------

/**
 * Transform the parsed value.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const map = <A, B>(parser: Parser<A>, f: (a: A) => B): Parser<B> => ({
  parse: (route) =>
    Option.map(parser.parse(route), ([a, rest]) => [f(a), rest] as const)
})

/**
 * Chain parsers, using the result of the first to determine the second.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const flatMap = <A, B>(
  parser: Parser<A>,
  f: (a: A) => Parser<B>
): Parser<B> => ({
  parse: (route) =>
    Option.flatMap(parser.parse(route), ([a, rest]) => f(a).parse(rest))
})

/**
 * Combine two parsers, merging their results.
 *
 * @example
 * ```ts
 * const parser = zip(lit('users'), int('id'))
 * // /users/42 → { id: 42 }
 * ```
 *
 * @since 0.6.0
 * @category Combinators
 */
export const zip = <A extends Record<string, unknown>, B extends Record<string, unknown>>(pa: Parser<A>, pb: Parser<B>): Parser<A & B> => ({
  parse: (route) =>
    Option.flatMap(pa.parse(route), ([a, rest]) =>
      Option.map(pb.parse(rest), ([b, rest2]) => [{ ...a, ...b } as A & B, rest2] as const)
    )
})

/**
 * Sequence multiple parsers, merging all results.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const zipAll = <T extends Parser<Record<string, unknown>>[]>(
  ...parsers: T
): Parser<UnionToIntersection<ParserValue<T[number]>>> => ({
  parse: (route) => {
    let current: Route = route
    let result: Record<string, unknown> = {}

    for (const parser of parsers) {
      const parsed = parser.parse(current)
      if (Option.isNone(parsed)) {
        return Option.none()
      }
      const [value, rest] = parsed.value
      result = { ...result, ...(value as object) }
      current = rest
    }

    return Option.some([result as UnionToIntersection<ParserValue<T[number]>>, current] as const)
  }
})

/**
 * Try the first parser, if it fails try the second.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const orElse = <A, B>(pa: Parser<A>, pb: () => Parser<B>): Parser<A | B> => ({
  parse: (route) => {
    const result = pa.parse(route)
    if (Option.isSome(result)) return result
    return pb().parse(route)
  }
})

/**
 * Try multiple parsers in order, returning the first success.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const oneOf = <A>(...parsers: Parser<A>[]): Parser<A> => ({
  parse: (route) => {
    for (const parser of parsers) {
      const result = parser.parse(route)
      if (Option.isSome(result)) return result
    }
    return Option.none()
  }
})

// -------------------------------------------------------------------------------------
// Type utilities
// -------------------------------------------------------------------------------------

/**
 * Extract the parsed value type from a Parser.
 *
 * @since 0.6.0
 * @category Type utilities
 */
export type ParserValue<P> = P extends Parser<infer A> ? A : never

/**
 * Helper type for merging intersection types.
 *
 * @since 0.6.0
 * @category Type utilities
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never
