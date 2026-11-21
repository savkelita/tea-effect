import { pipe } from 'effect'
import * as Cmd from 'tea-effect/Cmd'
import * as Http from 'tea-effect/Http'
import { postsOf, type Post } from './api'

export type Model = {
  readonly userId: number
  readonly posts:
    | { readonly _tag: 'Loading' }
    | { readonly _tag: 'Loaded'; readonly posts: ReadonlyArray<Post> }
    | { readonly _tag: 'Failed'; readonly error: Http.HttpError }
}

export type Msg =
  | { readonly type: 'UserSelected'; readonly userId: number }
  | { readonly type: 'PostsReceived'; readonly posts: ReadonlyArray<Post> }
  | { readonly type: 'PostsFailed'; readonly error: Http.HttpError }

// #region latest
const PostsReceived = (posts: ReadonlyArray<Post>): Msg => ({ type: 'PostsReceived', posts })
const PostsFailed = (error: Http.HttpError): Msg => ({ type: 'PostsFailed', error })

// Every load fills the same list, so every load runs under the same key: a newer
// load aborts the one still running, and its answer never reaches `update`.
const loadPosts = (userId: number): Cmd.Cmd<Msg> =>
  pipe(Http.send(postsOf(userId), { onSuccess: PostsReceived, onError: PostsFailed }), Cmd.latest('posts'))

export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'UserSelected':
      // The user can pick another user before the posts of the last one arrive.
      return [{ userId: msg.userId, posts: { _tag: 'Loading' } }, loadPosts(msg.userId)]

    case 'PostsReceived':
      // Always the posts of `model.userId`: an answer to an earlier pick was dropped.
      return [{ ...model, posts: { _tag: 'Loaded', posts: msg.posts } }, Cmd.none]

    case 'PostsFailed':
      return [{ ...model, posts: { _tag: 'Failed', error: msg.error } }, Cmd.none]
  }
}
// #endregion latest

export const init: readonly [Model, Cmd.Cmd<Msg>] = [{ userId: 1, posts: { _tag: 'Loading' } }, loadPosts(1)]
