/**
 * Router module provides type-safe URL routing for tea-effect applications.
 *
 * Inspired by [fp-ts-routing](https://github.com/gcanti/fp-ts-routing) and
 * [Elm's Url.Parser](https://package.elm-lang.org/packages/elm/url/latest/Url-Parser).
 *
 * ## Overview
 *
 * This module enables:
 * - **Type-safe route definitions** with Schema validation
 * - **Bidirectional routing** - parse URLs and format them back
 * - **Query parameter handling** with full validation support
 * - **Exhaustive pattern matching** via Effect's Match module
 *
 * ## Quick Start
 *
 * ```ts
 * import * as Router from 'tea-effect/Router'
 * import { Schema, Option, Match } from 'effect'
 *
 * // 1. Define routes
 * const routes = Router.routes({
 *   home: Router.path('/'),
 *   users: Router.path('/users'),
 *   user: Router.path('/users/:id', { id: Router.IntFromString }),
 *   search: Router.path('/search').query(
 *     Schema.Struct({
 *       q: Schema.String,
 *       page: Schema.optional(Schema.NumberFromString)
 *     })
 *   )
 * })
 *
 * // 2. Parse URLs
 * type Route = Router.RouteType<typeof routes>
 * const route = Router.parse(routes, location) // Option<Route>
 *
 * // 3. Format URLs
 * const url = Router.format(routes.user, { id: 42 }) // '/users/42'
 *
 * // 4. Pattern match
 * Match.value(route).pipe(
 *   Match.tag('home', () => <Home />),
 *   Match.tag('user', ({ params }) => <User id={params.id} />),
 *   Match.exhaustive
 * )
 * ```
 *
 * @since 0.6.0
 * @see {@link https://github.com/gcanti/fp-ts-routing fp-ts-routing}
 */

import { Option, Schema } from 'effect'
import type { Location } from './Navigation'
import { Route } from './Router/Route'
import * as Parser from './Router/Parser'
import * as Formatter from './Router/Formatter'
import * as Matcher from './Router/Matcher'

// Re-exports
export { Route } from './Router/Route'
export * as Parser from './Router/Parser'
export * as Formatter from './Router/Formatter'
export * as Matcher from './Router/Matcher'

/**
 * A path-param schema for integer ids that rejects 'NaN', 'Infinity' and
 * non-integers, unlike bare `Schema.NumberFromString`.
 *
 * @since 0.6.0
 * @category Schemas
 */
export const IntFromString: Schema.Schema<number, string> = Schema.NumberFromString.pipe(Schema.int())

// -------------------------------------------------------------------------------------
// Path Pattern Types
// -------------------------------------------------------------------------------------

/**
 * Extract parameter names from a path pattern.
 *
 * @example
 * ```ts
 * type Params = ExtractParams<'/users/:id/posts/:postId'>
 * // = 'id' | 'postId'
 * ```
 *
 * @since 0.6.0
 * @category Type utilities
 */
export type ExtractParams<T extends string> = T extends `${string}/:${infer Param}/${infer Rest}`
  ? Param | ExtractParams<`/${Rest}`>
  : T extends `${string}/:${infer Param}`
    ? Param
    : never

/**
 * Create an object type from parameter names and their schemas.
 *
 * @since 0.6.0
 * @category Type utilities
 */
export type ParamsFromSchemas<
  Params extends string,
  Schemas extends Partial<Record<Params, Schema.Schema<any, string>>>
> = {
  readonly [K in Params]: K extends keyof Schemas
    ? Schemas[K] extends Schema.Schema<infer A, string>
      ? A
      : string
    : string
}

// -------------------------------------------------------------------------------------
// Route Definition
// -------------------------------------------------------------------------------------

/**
 * A route definition with its tag, matcher, and type information.
 *
 * @since 0.6.0
 * @category Model
 */
export interface RouteDefinition<Tag extends string, Params, Query = void> {
  readonly _tag: Tag
  readonly matcher: Matcher.Matcher<Params & (Query extends void ? {} : Query)>
  readonly hasParams: boolean
  readonly hasQuery: boolean
  readonly paramKeys: readonly string[]
  readonly queryKeys: readonly string[]
}

/**
 * Builder for route definitions with query support.
 *
 * @since 0.6.0
 * @category Model
 */
export interface RouteBuilder<Tag extends string, Params> {
  readonly _tag: Tag
  readonly matcher: Matcher.Matcher<Params>

  /**
   * Add query parameters to this route.
   */
  readonly query: <Q extends Record<string, unknown>, I>(
    schema: Schema.Schema<Q, I, never>
  ) => RouteDefinition<Tag, Params, Q>

  /**
   * Finalize route without query parameters.
   */
  readonly end: () => RouteDefinition<Tag, Params, void>
}

// -------------------------------------------------------------------------------------
// Route Constructors
// -------------------------------------------------------------------------------------

/**
 * Define a route from a path pattern.
 *
 * Path parameters are specified with `:paramName` syntax.
 * Optionally provide Schema validators for parameters.
 *
 * @example
 * ```ts
 * // Simple path
 * Router.path('/')
 *
 * // With parameters
 * Router.path('/users/:id', { id: Schema.NumberFromString })
 *
 * // With query params
 * Router.path('/search').query(
 *   Schema.Struct({
 *     q: Schema.String,
 *     page: Schema.optional(Schema.NumberFromString)
 *   })
 * )
 * ```
 *
 * @since 0.6.0
 * @category Constructors
 */
export const path = <
  P extends string,
  S extends Partial<Record<ExtractParams<P>, Schema.Schema<any, string>>> = {}
>(
  pattern: P,
  schemas?: S
): RouteBuilder<string, ParamsFromSchemas<ExtractParams<P>, S>> => {
  const matcher = buildMatcherFromPattern(pattern, schemas || {})
  const paramKeys = extractParamKeys(pattern)

  return {
    _tag: '',
    matcher: matcher as Matcher.Matcher<ParamsFromSchemas<ExtractParams<P>, S>>,

    query: <Q extends Record<string, unknown>, I>(
      querySchema: Schema.Schema<Q, I, never>
    ): RouteDefinition<string, ParamsFromSchemas<ExtractParams<P>, S>, Q> => {
      const queryKeys = getSchemaKeys(querySchema)
      const overlap = (queryKeys ?? []).filter(k => paramKeys.includes(k))
      if (overlap.length > 0) {
        throw new Error(
          `Router.path: query keys collide with path params: ${overlap.join(', ')}`
        )
      }
      const queryMatcher: Matcher.Matcher<Q> = {
        parser: Parser.query(querySchema),
        formatter: Formatter.query<Q>(queryKeys, paramKeys)
      }
      return {
        _tag: '',
        matcher: Matcher.seq(matcher, queryMatcher) as any,
        hasParams: paramKeys.length > 0,
        hasQuery: true,
        paramKeys,
        queryKeys: queryKeys || []
      }
    },

    end: (): RouteDefinition<string, ParamsFromSchemas<ExtractParams<P>, S>, void> => ({
      _tag: '',
      matcher: Matcher.seq(matcher, Matcher.end) as any,
      hasParams: paramKeys.length > 0,
      hasQuery: false,
      paramKeys,
      queryKeys: []
    })
  }
}

/**
 * Extract parameter names from a path pattern string.
 *
 * @internal
 */
function extractParamKeys(pattern: string): string[] {
  return pattern
    .split('/')
    .filter(s => s.startsWith(':'))
    .map(s => s.slice(1))
}

/**
 * Extract property keys from a Schema (works for Schema.Struct).
 *
 * NOTE: This relies on Effect's current Schema AST representation,
 * specifically that `schema.ast` is a TypeLiteral with `propertySignatures`.
 * If the Effect Schema internals change, this function may need updating.
 *
 * @internal
 */
function getSchemaKeys(schema: Schema.Schema<any, any, never>): string[] | undefined {
  const ast = schema.ast as unknown
  if (
    typeof ast === 'object' &&
    ast !== null &&
    '_tag' in ast &&
    (ast as { _tag: unknown })._tag === 'TypeLiteral' &&
    'propertySignatures' in ast &&
    Array.isArray((ast as { propertySignatures: unknown }).propertySignatures)
  ) {
    // Index-signature schemas (Schema.Record) can't be enumerated statically.
    const indexSignatures = (ast as { indexSignatures?: unknown }).indexSignatures
    if (Array.isArray(indexSignatures) && indexSignatures.length > 0) {
      return undefined
    }
    const propertySignatures = (ast as {
      propertySignatures: Array<{ name: PropertyKey }>
    }).propertySignatures
    return propertySignatures.map(ps => String(ps.name))
  }
  return undefined
}

/**
 * Build a Matcher from a path pattern string.
 *
 * @internal
 */
function buildMatcherFromPattern<S extends Record<string, Schema.Schema<any, string>>>(
  pattern: string,
  schemas: S
): Matcher.Matcher<any> {
  const segments = pattern.split('/').filter(Boolean)

  if (segments.length === 0) {
    return Matcher.root
  }

  let matcher: Matcher.Matcher<any> = { parser: Parser.succeed({}), formatter: Formatter.empty }

  for (const segment of segments) {
    if (segment.startsWith(':')) {
      const paramName = segment.slice(1)
      const schema = schemas[paramName]

      if (schema) {
        // Encode via the schema (not String()) so format round-trips transforms.
        matcher = Matcher.seq(matcher, Matcher.param(paramName, schema, Schema.encodeSync(schema)))
      } else {
        matcher = Matcher.seq(matcher, Matcher.str(paramName))
      }
    } else {
      matcher = Matcher.seq(matcher, Matcher.lit(segment))
    }
  }

  return matcher
}

// -------------------------------------------------------------------------------------
// Routes Collection
// -------------------------------------------------------------------------------------

/**
 * Routes collection type.
 *
 * @since 0.6.0
 * @category Model
 */
export type Routes<T extends Record<string, RouteBuilder<any, any> | RouteDefinition<any, any, any>>> = {
  readonly [K in keyof T]: T[K] extends RouteBuilder<any, infer Params>
    ? RouteDefinition<K & string, Params, void>
    : T[K] extends RouteDefinition<any, infer Params, infer Query>
      ? RouteDefinition<K & string, Params, Query>
      : never
}

/**
 * Define a collection of routes.
 *
 * Each route gets tagged with its key name for pattern matching.
 * Routes are matched in definition order (first match wins).
 * More specific routes (e.g. those with required query parameters)
 * should be defined before less specific routes that share the same path pattern.
 *
 * @example
 * ```ts
 * const routes = Router.routes({
 *   home: Router.path('/'),
 *   user: Router.path('/users/:id', { id: Schema.NumberFromString }),
 *   search: Router.path('/search').query(Schema.Struct({ q: Schema.String }))
 * })
 *
 * type Route = Router.RouteType<typeof routes>
 * // | { _tag: 'home' }
 * // | { _tag: 'user', params: { id: number } }
 * // | { _tag: 'search', query: { q: string } }
 * ```
 *
 * @since 0.6.0
 * @category Constructors
 */
export const routes = <
  T extends Record<string, RouteBuilder<any, any> | RouteDefinition<any, any, any>>
>(
  definitions: T
): Routes<T> => {
  const result: Record<string, RouteDefinition<any, any, any>> = {}

  for (const [key, value] of Object.entries(definitions)) {
    if ('end' in value && typeof value.end === 'function') {
      // RouteBuilder - finalize it
      const finalized = value.end()
      result[key] = {
        ...finalized,
        _tag: key
      }
    } else {
      // Already a RouteDefinition
      const def = value as RouteDefinition<any, any, any>
      result[key] = {
        ...def,
        _tag: key
      }
    }
  }

  return result as Routes<T>
}

// -------------------------------------------------------------------------------------
// Route Type Inference
// -------------------------------------------------------------------------------------

/**
 * Infer the union type of all routes.
 *
 * @example
 * ```ts
 * const routes = Router.routes({
 *   home: Router.path('/'),
 *   user: Router.path('/users/:id', { id: Schema.NumberFromString })
 * })
 *
 * type Route = Router.RouteType<typeof routes>
 * // = { _tag: 'home' } | { _tag: 'user', params: { id: number } }
 * ```
 *
 * @since 0.6.0
 * @category Type utilities
 */
export type RouteType<T extends Routes<any>> = {
  [K in keyof T]: T[K] extends RouteDefinition<infer Tag, infer Params, infer Query>
    ? Query extends void
      ? Params extends Record<string, never>
        ? { readonly _tag: Tag }
        : { readonly _tag: Tag; readonly params: Params }
      : Params extends Record<string, never>
        ? { readonly _tag: Tag; readonly query: Query }
        : { readonly _tag: Tag; readonly params: Params; readonly query: Query }
    : never
}[keyof T]

/**
 * Extract the params type for a route definition.
 *
 * @since 0.6.0
 * @category Type utilities
 */
export type RouteParams<T> = T extends RouteDefinition<any, infer Params, any> ? Params : never

/**
 * Extract the query type for a route definition.
 *
 * @since 0.6.0
 * @category Type utilities
 */
export type RouteQuery<T> = T extends RouteDefinition<any, any, infer Query> ? Query : never

/**
 * Extract the format params type (params + query combined).
 *
 * @since 0.6.0
 * @category Type utilities
 */
export type FormatParams<T> = T extends RouteDefinition<any, infer Params, infer Query>
  ? Query extends void
    ? Params
    : Params & Query
  : never

// -------------------------------------------------------------------------------------
// Parsing
// -------------------------------------------------------------------------------------

/**
 * Parse a location into a typed route.
 *
 * Returns `Option.none()` if no route matches.
 *
 * @example
 * ```ts
 * const result = Router.parse(routes, { pathname: '/users/42', search: '' })
 * // → Option.some({ _tag: 'user', params: { id: 42 } })
 * ```
 *
 * @since 0.6.0
 * @category Parsing
 */
export const parse = <T extends Routes<any>>(
  routesCollection: T,
  location: Pick<Location, 'pathname' | 'search'>
): Option.Option<RouteType<T>> => {
  const route = Route.fromLocation(location)

  for (const [tag, definition] of Object.entries(routesCollection)) {
    const def = definition as RouteDefinition<string, any, any>
    const result = def.matcher.parser.parse(route)

    if (Option.isSome(result)) {
      const [parsed, remaining] = result.value

      // Check if we consumed the entire path (or just query remains)
      if (remaining.segments.length === 0) {
        return Option.some(buildRouteObject(tag, parsed, def) as RouteType<T>)
      }
    }
  }

  return Option.none()
}

/**
 * Parse a location into a typed route, with a fallback.
 *
 * @example
 * ```ts
 * const route = Router.parseOr(routes, location, { _tag: 'notFound' as const })
 * ```
 *
 * @since 0.6.0
 * @category Parsing
 */
export const parseOr = <T extends Routes<any>, D>(
  routesCollection: T,
  location: Pick<Location, 'pathname' | 'search'>,
  defaultRoute: D
): RouteType<T> | D => {
  return Option.getOrElse(parse(routesCollection, location), () => defaultRoute)
}

/**
 * Build the route object with proper structure.
 *
 * @internal
 */
function buildRouteObject(
  tag: string,
  parsed: Record<string, unknown>,
  definition: RouteDefinition<string, any, any>
): Record<string, unknown> {
  const result: Record<string, unknown> = { _tag: tag }

  if (definition.hasParams && definition.hasQuery) {
    const params: Record<string, unknown> = {}
    const query: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (definition.paramKeys.includes(key)) {
        params[key] = value
      } else {
        query[key] = value
      }
    }
    result.params = params
    result.query = query
  } else if (definition.hasParams) {
    result.params = parsed
  } else if (definition.hasQuery) {
    result.query = parsed
  }

  return result
}

// -------------------------------------------------------------------------------------
// Formatting
// -------------------------------------------------------------------------------------

/**
 * Format a route definition with parameters into a URL string.
 *
 * @example
 * ```ts
 * Router.format(routes.user, { id: 42 })
 * // → '/users/42'
 *
 * Router.format(routes.search, { q: 'hello', page: 2 })
 * // → '/search?q=hello&page=2'
 * ```
 *
 * @since 0.6.0
 * @category Formatting
 */
export const format = <T extends RouteDefinition<any, any, any>>(
  route: T,
  params: FormatParams<T>
): string => {
  return route.matcher.formatter.format(params).toString()
}

// -------------------------------------------------------------------------------------
// Low-level combinators (re-exported from Matcher)
// -------------------------------------------------------------------------------------

/**
 * Match a literal path segment.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const lit = Matcher.lit

/**
 * Capture a string path segment.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const str = Matcher.str

/**
 * Capture an integer path segment.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const int = Matcher.int

/**
 * Capture a path segment with Schema validation.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const param = Matcher.param

/**
 * Match query parameters with Schema validation.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const query = Matcher.query

/**
 * Match the end of path.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const end = Matcher.end

/**
 * Sequence two matchers.
 *
 * @since 0.6.0
 * @category Combinators
 */
export const seq = Matcher.seq
