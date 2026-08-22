import { Schema } from 'effect'
import type * as Navigation from 'tea-effect/Navigation'
import * as Router from 'tea-effect/Router'

// #region routes
export const routes = Router.routes({
  home: Router.path('/'),
  users: Router.path('/users'),
  // `IntFromString` rejects 'NaN', 'Infinity' and non-integers, which bare
  // `Schema.NumberFromString` would happily accept as an id.
  user: Router.path('/users/:id', { id: Router.IntFromString }),
  search: Router.path('/search').query(Schema.Struct({ q: Schema.String }))
})

// One union describing every route the application can be in.
export type Route = Router.RouteType<typeof routes>
// #endregion routes

// #region page
// Parsing can fail, so the page type is the routes plus one more case.
export type Page = Route | { readonly _tag: 'notFound' }

export const toPage = (location: Navigation.Location): Page =>
  Router.parseOr(routes, location, { _tag: 'notFound' as const })
// #endregion page

// #region format
// The same definition that parses also formats. A link built this way cannot
// drift away from the route it points at - both come from one source.
export const userUrl = (id: number): string => Router.format(routes.user, { id })

export const searchUrl = (q: string): string => Router.format(routes.search, { q })
// #endregion format
