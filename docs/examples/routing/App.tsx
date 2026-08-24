import * as Cmd from 'tea-effect/Cmd'
import * as Navigation from 'tea-effect/Navigation'
import type * as TeaReact from 'tea-effect/React'
import { toPage, userUrl, type Page } from './routes'

export type Model = { readonly page: Page }

export type Msg =
  | { readonly type: 'LinkClicked'; readonly request: Navigation.UrlRequest }
  | { readonly type: 'UrlChanged'; readonly location: Navigation.Location }

// #region update
export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'LinkClicked':
      switch (msg.request._tag) {
        case 'Internal': {
          // Rebuild the whole URL: `pathname` alone drops the query and hash,
          // so a click on /search?q=hello would navigate to /search.
          const { pathname, search, hash } = msg.request.location
          return [model, Navigation.pushUrl(`${pathname}${search}${hash}`)]
        }

        case 'External':
          // Leaves the program entirely - a real browser navigation.
          return [model, Navigation.load(msg.request.href)]
      }

    // The URL has already changed by now, whether from pushUrl or the back button.
    case 'UrlChanged':
      return [{ page: toPage(msg.location) }, Cmd.none]
  }
}
// #endregion update

// #region view
export const view =
  (model: Model): TeaReact.Html<Msg> =>
  () => {
    // Every route is a case here, and TypeScript will not let you forget one.
    switch (model.page._tag) {
      case 'home':
        return (
          <nav>
            <a href={userUrl(1)}>The first user</a>
          </nav>
        )

      case 'users':
        return <h1>All users</h1>

      case 'user':
        return <h1>User {model.page.params.id}</h1>

      case 'search':
        return <h1>Results for {model.page.query.q}</h1>

      case 'notFound':
        return <h1>No such page</h1>
    }
  }
// #endregion view

// #region program
// Navigation.program wires up link interception and URL changes for you, and
// hands `init` the location the page was opened at.
export const App = Navigation.program({
  init: (location) => [{ page: toPage(location) }, Cmd.none],
  update,
  view,
  onUrlRequest: (request): Msg => ({ type: 'LinkClicked', request }),
  onUrlChange: (location): Msg => ({ type: 'UrlChanged', location })
})
// #endregion program
