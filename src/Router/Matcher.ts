/**
 * Matcher combines Parser and Formatter for bidirectional routing.
 *
 * @since 0.6.0
 */

import type { Schema } from 'effect'
import { Route } from './Route'
import * as Parser from './Parser'
import * as Formatter from './Formatter'

/**
 * A Matcher can both parse URLs and format them back.
 *
 * This enables type-safe bidirectional routing:
 * - Parse: URL string → typed route object
 * - Format: typed route object → URL string
 *
 * @example
 * ```ts
 * import { Matcher, Route } from 'tea-effect/Router'
 *
 * const userMatcher = Matcher.seq(Matcher.lit('users'), Matcher.int('id'))
 *
 * // Parse
 * const parsed = userMatcher.parser.parse(Route.parse('/users/42', ''))
 * // → Some([{ id: 42 }, Route])
 *
 * // Format
 * const url = userMatcher.formatter.format({ id: 42 }).toString()
 * // → '/users/42'
 * ```
 *
 * @since 0.6.0
 * @category Model
 */
export interface Matcher<A> {
  readonly parser: Parser.Parser<A>
  readonly formatter: Formatter.Formatter<A>
}

// -------------------------------------------------------------------------------------
// Constructors
// -------------------------------------------------------------------------------------

/**
 * Create a Matcher from a Parser and Formatter.
 *
 * @since 0.6.0
 * @category Constructors
 */
export const make = <A>(
  parser: Parser.Parser<A>,
  formatter: Formatter.Formatter<A>
): Matcher<A> => ({
  parser,
  formatter
})

// -------------------------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------------------------

/**
 * Match a literal path segment.
 *
 * @example
 * ```ts
 * import { Matcher } from 'tea-effect/Router'
 *
 * const matcher = Matcher.lit('users')
 * // Parses: /users/... → {}
 * // Formats: {} → /users
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const lit = (segment: string): Matcher<{}> => ({
  parser: Parser.lit(segment),
  formatter: {
    format: () => new Route([segment], new URLSearchParams())
  }
})

/**
 * Match and capture a string path segment.
 *
 * @example
 * ```ts
 * import { Matcher } from 'tea-effect/Router'
 *
 * const matcher = Matcher.str('name')
 * // Parses: /john → { name: 'john' }
 * // Formats: { name: 'john' } → /john
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const str = <K extends string>(key: K): Matcher<{ readonly [P in K]: string }> => ({
  parser: Parser.str(key),
  formatter: Formatter.str(key)
})

/**
 * Match and capture an integer path segment.
 *
 * @example
 * ```ts
 * import { Matcher } from 'tea-effect/Router'
 *
 * const matcher = Matcher.int('id')
 * // Parses: /42 → { id: 42 }
 * // Formats: { id: 42 } → /42
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const int = <K extends string>(key: K): Matcher<{ readonly [P in K]: number }> => ({
  parser: Parser.int(key),
  formatter: Formatter.int(key)
})

/**
 * Match and capture a path segment with Schema validation.
 *
 * The third argument says how to write the value back into a path segment when
 * formatting. It defaults to `String`, so a string-valued schema needs only two.
 *
 * @example
 * ```ts
 * import { Schema } from 'effect'
 * import { Matcher } from 'tea-effect/Router'
 *
 * const id = Matcher.param('id', Schema.UUID)
 *
 * // Supply `encode` when `String(value)` is not the segment you want.
 * const day = Matcher.param('day', Schema.Date, (d) => d.toISOString().slice(0, 10))
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const param = <K extends string, A>(
  key: K,
  schema: Schema.Schema<A, string>,
  encode: (a: A) => string = String
): Matcher<{ readonly [P in K]: A }> => ({
  parser: Parser.param(key, schema),
  formatter: Formatter.param(key, encode)
})

/**
 * Match query parameters with Schema validation.
 *
 * @example
 * ```ts
 * import { Schema } from 'effect'
 * import { Matcher } from 'tea-effect/Router'
 *
 * const matcher = Matcher.query(Schema.Struct({
 *   q: Schema.String,
 *   page: Schema.optional(Schema.NumberFromString)
 * }))
 * // Parses: ?q=hello&page=2 → { q: 'hello', page: 2 }
 * // Formats: { q: 'hello', page: 2 } → ?q=hello&page=2
 * ```
 *
 * @since 0.6.0
 * @category Primitives
 */
export const query = <A extends Record<string, unknown>, I>(
  schema: Schema.Schema<A, I, never>
): Matcher<A> => ({
  parser: Parser.query(schema),
  formatter: Formatter.query<A>()
})

/**
 * Match the end of the path.
 *
 * @since 0.6.0
 * @category Primitives
 */
export const end: Matcher<{}> = {
  parser: Parser.end,
  formatter: { format: () => Route.empty }
}

/**
 * Match the root path (/).
 *
 * @since 0.6.0
 * @category Primitives
 */
export const root: Matcher<{}> = end

// -------------------------------------------------------------------------------------
// Combinators
// -------------------------------------------------------------------------------------

/**
 * Sequence two matchers, merging their parameters.
 *
 * @example
 * ```ts
 * import { Matcher } from 'tea-effect/Router'
 *
 * const matcher = Matcher.seq(Matcher.lit('users'), Matcher.int('id'))
 * // Parses: /users/42 → { id: 42 }
 * // Formats: { id: 42 } → /users/42
 * ```
 *
 * @since 0.6.0
 * @category Combinators
 */
export const seq = <A extends Record<string, unknown>, B extends Record<string, unknown>>(ma: Matcher<A>, mb: Matcher<B>): Matcher<A & B> => {
  const parser = Parser.zip(ma.parser, mb.parser)
  const formatter = Formatter.combine(ma.formatter, mb.formatter)
  return { parser, formatter }
}


/**
 * Sequence multiple matchers.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const pipe = <T extends Matcher<Record<string, unknown>>[]>(
  ...matchers: T
): Matcher<UnionToIntersection<MatcherValue<T[number]>>> => {
  const parser = Parser.zipAll(...matchers.map((m) => m.parser)) as any
  const formatter = Formatter.combineAll(...matchers.map((m) => m.formatter)) as any
  return { parser, formatter }
}

/**
 * Transform the matched value bidirectionally.
 *
 * @example
 * ```ts
 * import { Matcher } from 'tea-effect/Router'
 *
 * // Rename the captured key: the URL still says :id, the value says userId.
 * const matcher = Matcher.imap(
 *   Matcher.int('id'),
 *   ({ id }) => ({ userId: id }),
 *   ({ userId }) => ({ id: userId })
 * )
 * ```
 *
 * @since 0.6.0
 * @category Combinators
 */
export const imap = <A, B>(
  matcher: Matcher<A>,
  f: (a: A) => B,
  g: (b: B) => A
): Matcher<B> => {
  const parser = Parser.map(matcher.parser, f)
  const formatter = Formatter.contramap(matcher.formatter, g)
  return { parser, formatter }
}

// -------------------------------------------------------------------------------------
// Type utilities
// -------------------------------------------------------------------------------------

/**
 * Extract the value type from a Matcher.
 *
 * @since 0.6.0
 * @category Type utilities
 */
export type MatcherValue<M> = M extends Matcher<infer A> ? A : never

/**
 * Helper type for merging intersection types.
 *
 * @since 0.6.0
 * @category Type utilities
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never
