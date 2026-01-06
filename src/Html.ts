/**
 * Html module provides programs that render to a DOM.
 *
 * See the [Html](https://package.elm-lang.org/packages/elm/html/latest/Html) Elm package.
 *
 * @since 0.1.0
 */
import { Effect, Stream, pipe, Scope } from 'effect'
import { Cmd } from './Cmd'
import { Sub, none as subNone } from './Sub'
import * as Platform from './Platform'

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * Html represents a view that produces Dom elements and can dispatch Msg.
 *
 * This is generic over the Dom type to support both React and other renderers.
 *
 * @since 0.1.0
 * @category model
 */
export type Html<Dom, Msg> = (dispatch: Platform.Dispatch<Msg>) => Dom

/**
 * Program with a view function.
 *
 * @since 0.1.0
 * @category model
 */
export interface Program<Model, Msg, Dom, E = never, R = never> extends Platform.Program<Model, Msg, E, R> {
  /**
   * Stream of rendered views.
   */
  readonly html$: Stream.Stream<Dom, E, R>
}

// -------------------------------------------------------------------------------------
// constructors
// -------------------------------------------------------------------------------------

/**
 * Creates a Program with a view function.
 *
 * @param init - Initial model and command
 * @param update - Message handler
 * @param view - Function that renders model to Html
 * @param subscriptions - Subscriptions based on model
 *
 * @example
 * ```ts
 * const myProgram = Html.program(
 *   [{ count: 0 }, Cmd.none],
 *   (msg, model) => {
 *     switch (msg.type) {
 *       case 'Increment':
 *         return [{ count: model.count + 1 }, Cmd.none]
 *     }
 *   },
 *   (model) => (dispatch) => (
 *     <button onClick={() => dispatch({ type: 'Increment' })}>
 *       Count: {model.count}
 *     </button>
 *   )
 * )
 * ```
 *
 * @since 0.1.0
 * @category constructors
 */
export const program = <Model, Msg, Dom, E = never, R = never>(
  init: readonly [Model, Cmd<Msg, E, R>],
  update: (msg: Msg, model: Model) => readonly [Model, Cmd<Msg, E, R>],
  view: (model: Model) => Html<Dom, Msg>,
  subscriptions: (model: Model) => Sub<Msg, E, R> = () => subNone
): Effect.Effect<Program<Model, Msg, Dom, E, R>, E, R | Scope.Scope> =>
  Effect.gen(function* () {
    const baseProgram = yield* Platform.program(init, update, subscriptions)

    const html$ = pipe(
      baseProgram.model$,
      Stream.map(model => view(model)(baseProgram.dispatch))
    )

    return {
      ...baseProgram,
      html$
    }
  })

/**
 * Creates a Program with flags and a view function.
 *
 * @since 0.1.0
 * @category constructors
 */
export const programWithFlags = <Flags, Model, Msg, Dom, E = never, R = never>(
  init: (flags: Flags) => readonly [Model, Cmd<Msg, E, R>],
  update: (msg: Msg, model: Model) => readonly [Model, Cmd<Msg, E, R>],
  view: (model: Model) => Html<Dom, Msg>,
  subscriptions: (model: Model) => Sub<Msg, E, R> = () => subNone
): ((flags: Flags) => Effect.Effect<Program<Model, Msg, Dom, E, R>, E, R | Scope.Scope>) =>
  (flags) => program(init(flags), update, view, subscriptions)

// -------------------------------------------------------------------------------------
// combinators
// -------------------------------------------------------------------------------------

/**
 * Maps the Dom type of an Html.
 *
 * @since 0.1.0
 * @category combinators
 */
export const map = <A, Msg>(f: (a: A) => Msg) =>
  <Dom>(html: Html<Dom, A>): Html<Dom, Msg> =>
    (dispatch) => html((a) => dispatch(f(a)))

// -------------------------------------------------------------------------------------
// running
// -------------------------------------------------------------------------------------

/**
 * Runs the program and returns a stream of rendered views.
 *
 * @since 0.1.0
 * @category running
 */
export const run = <Model, Msg, Dom, E, R>(
  prog: Program<Model, Msg, Dom, E, R>
): Stream.Stream<Dom, E, R> => prog.html$

/**
 * Runs the program with a renderer callback.
 *
 * @since 0.1.0
 * @category running
 */
export const runWith = <Model, Msg, Dom, E, R>(
  renderer: (dom: Dom) => void
) =>
  (prog: Program<Model, Msg, Dom, E, R>): Effect.Effect<void, E, R> =>
    pipe(
      prog.html$,
      Stream.tap(dom => Effect.sync(() => renderer(dom))),
      Stream.runDrain
    )
