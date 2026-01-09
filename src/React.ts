/**
 * React module provides React integration for tea-effect programs.
 *
 * @since 0.1.0
 */
import { Effect, Stream, Scope, Runtime, Fiber, pipe } from 'effect'
import type * as ReactTypes from 'react'
import { Cmd } from './Cmd'
import { Sub, none as subNone } from './Sub'
import * as Html from './Html'
import * as Platform from './Platform'

// -------------------------------------------------------------------------------------
// React-like interface
// -------------------------------------------------------------------------------------

/**
 * Minimal interface for React-like libraries.
 * This allows tea-effect to work with any React version without type conflicts.
 *
 * @since 0.1.1
 * @category model
 */
export interface ReactLike {
  useState<S>(initialState: S | (() => S)): [S, (value: S | ((prev: S) => S)) => void]
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  useRef<T>(initialValue: T): { current: T }
}

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * React element type.
 *
 * @since 0.1.0
 * @category model
 */
export type ReactElement = ReactTypes.ReactElement | null

/**
 * React Html type - a function that takes dispatch and returns React element.
 *
 * @since 0.1.0
 * @category model
 */
export type ReactHtml<Msg> = Html.Html<ReactElement, Msg>

/**
 * React Program type.
 *
 * @since 0.1.0
 * @category model
 */
export type Program<Model, Msg, E = never, R = never> = Html.Program<Model, Msg, ReactElement, E, R>

// -------------------------------------------------------------------------------------
// constructors
// -------------------------------------------------------------------------------------

/**
 * Creates a React Program.
 *
 * @since 0.1.0
 * @category constructors
 */
export const program = <Model, Msg, E = never, R = never>(
  init: readonly [Model, Cmd<Msg, E, R>],
  update: (msg: Msg, model: Model) => readonly [Model, Cmd<Msg, E, R>],
  view: (model: Model) => ReactHtml<Msg>,
  subscriptions: (model: Model) => Sub<Msg, E, R> = () => subNone
): Effect.Effect<Program<Model, Msg, E, R>, E, R | Scope.Scope> =>
  Html.program(init, update, view, subscriptions)

/**
 * Creates a React Program with flags.
 *
 * @since 0.1.0
 * @category constructors
 */
export const programWithFlags = <Flags, Model, Msg, E = never, R = never>(
  init: (flags: Flags) => readonly [Model, Cmd<Msg, E, R>],
  update: (msg: Msg, model: Model) => readonly [Model, Cmd<Msg, E, R>],
  view: (model: Model) => ReactHtml<Msg>,
  subscriptions: (model: Model) => Sub<Msg, E, R> = () => subNone
): ((flags: Flags) => Effect.Effect<Program<Model, Msg, E, R>, E, R | Scope.Scope>) =>
  Html.programWithFlags(init, update, view, subscriptions)

// -------------------------------------------------------------------------------------
// running
// -------------------------------------------------------------------------------------

/**
 * Runs a React Program with ReactDOM.
 *
 * @example
 * ```ts
 * import { createRoot } from 'react-dom/client'
 *
 * const root = createRoot(document.getElementById('app')!)
 *
 * Effect.runPromise(
 *   React.run(myProgram, (element) => root.render(element))
 * )
 * ```
 *
 * @since 0.1.0
 * @category running
 */
export const run = <Model, Msg, E, R>(
  programEffect: Effect.Effect<Program<Model, Msg, E, R>, E, R | Scope.Scope>,
  renderer: (element: ReactElement) => void
): Effect.Effect<void, E, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const prog = yield* programEffect
      yield* Html.runWith<Model, Msg, ReactElement, E, R>(renderer)(prog)
    })
  )

// -------------------------------------------------------------------------------------
// React Hook
// -------------------------------------------------------------------------------------

/**
 * Options for useProgram hook.
 *
 * @since 0.1.0
 * @category hooks
 */
export interface UseProgramOptions<R> {
  /**
   * Runtime to use for running effects.
   * If not provided, uses the default runtime.
   */
  readonly runtime?: Runtime.Runtime<R>
}

/**
 * Result of useProgram hook.
 *
 * @since 0.1.0
 * @category hooks
 */
export interface UseProgramResult<Model, Msg> {
  /**
   * Current model state.
   */
  readonly model: Model

  /**
   * Dispatch function to send messages.
   */
  readonly dispatch: Platform.Dispatch<Msg>
}

/**
 * Creates a useProgram React hook.
 *
 * This is a factory function that takes React as a parameter to avoid
 * bundling React as a dependency.
 *
 * @example
 * ```ts
 * import * as React from 'react'
 * import { makeUseProgram } from 'tea-effect/React'
 *
 * const useProgram = makeUseProgram(React)
 *
 * function Counter() {
 *   const { model, dispatch } = useProgram(
 *     [{ count: 0 }, Cmd.none],
 *     (msg, model) => {
 *       switch (msg.type) {
 *         case 'Increment':
 *           return [{ count: model.count + 1 }, Cmd.none]
 *       }
 *     }
 *   )
 *
 *   return (
 *     <button onClick={() => dispatch({ type: 'Increment' })}>
 *       Count: {model.count}
 *     </button>
 *   )
 * }
 * ```
 *
 * @since 0.1.0
 * @category hooks
 */
export const makeUseProgram = (React: ReactLike) => {
  const { useState, useEffect, useRef } = React

  return <Model, Msg, E = never, R = never>(
    init: readonly [Model, Cmd<Msg, E, R>],
    update: (msg: Msg, model: Model) => readonly [Model, Cmd<Msg, E, R>],
    subscriptions: (model: Model) => Sub<Msg, E, R> = () => subNone,
    options: UseProgramOptions<R> = {}
  ): UseProgramResult<Model, Msg> => {
    const [initialModel] = init
    const [model, setModel] = useState<Model>(initialModel)
    const programRef = useRef<Platform.Program<Model, Msg, E, R> | null>(null)
    const fiberRef = useRef<Fiber.RuntimeFiber<void, E> | null>(null)
    const dispatchRef = useRef<Platform.Dispatch<Msg>>(() => {})

    useEffect(() => {
      const runtime = options.runtime ?? Runtime.defaultRuntime as Runtime.Runtime<R>

      const setup = Effect.scoped(
        Effect.gen(function* () {
          const prog = yield* Platform.program(init, update, subscriptions)

          programRef.current = prog
          dispatchRef.current = prog.dispatch

          // Subscribe to model updates from PubSub - push-based!
          yield* pipe(
            prog.model$,
            Stream.tap(newModel => Effect.sync(() => setModel(newModel))),
            Stream.runDrain
          )
        })
      )

      const fiber = Runtime.runFork(runtime)(setup as Effect.Effect<void, E, R>)
      fiberRef.current = fiber

      return () => {
        if (programRef.current) {
          Runtime.runFork(runtime)(programRef.current.shutdown)
        }
        if (fiberRef.current) {
          Runtime.runFork(runtime)(Fiber.interrupt(fiberRef.current))
        }
      }
    }, [])

    // Stable dispatch function
    const dispatch: Platform.Dispatch<Msg> = (msg: Msg) => {
      dispatchRef.current(msg)
    }

    return { model, dispatch }
  }
}

/**
 * Creates a useProgram hook with dependencies (Layer).
 *
 * @since 0.1.0
 * @category hooks
 */
export const makeUseProgramWithLayer = (React: ReactLike) => {
  const baseUseProgram = makeUseProgram(React)

  return <Model, Msg, E, R>(
    init: readonly [Model, Cmd<Msg, E, R>],
    update: (msg: Msg, model: Model) => readonly [Model, Cmd<Msg, E, R>],
    subscriptions: (model: Model) => Sub<Msg, E, R> = () => subNone,
    runtime: Runtime.Runtime<R>
  ): UseProgramResult<Model, Msg> => {
    return baseUseProgram(init, update, subscriptions, { runtime })
  }
}
