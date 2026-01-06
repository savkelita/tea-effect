/**
 * The Platform module is the backbone of tea-effect.
 * It defines the base `program()` and `run()` functions.
 *
 * See the [Platform](https://package.elm-lang.org/packages/elm/core/latest/Platform) Elm package.
 *
 * @since 0.1.0
 */
import { Effect, Stream, Ref, Queue, Option, Fiber, pipe, Scope } from 'effect'
import { Cmd } from './Cmd'
import { Sub, none as subNone } from './Sub'

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * A Dispatch function sends messages to the update loop.
 *
 * @since 0.1.0
 * @category model
 */
export type Dispatch<Msg> = (msg: Msg) => void

/**
 * Program represents a running TEA application.
 *
 * It exposes:
 * - `dispatch`: function to send messages
 * - `model$`: stream of model updates
 * - `shutdown`: effect to stop the program
 *
 * @since 0.1.0
 * @category model
 */
export interface Program<Model, Msg, E = never, R = never> {
  /**
   * Sends a message to the program.
   */
  readonly dispatch: Dispatch<Msg>

  /**
   * Stream of model state changes.
   */
  readonly model$: Stream.Stream<Model, E, R>

  /**
   * Stops the program gracefully.
   */
  readonly shutdown: Effect.Effect<void, never, never>
}

// -------------------------------------------------------------------------------------
// constructors
// -------------------------------------------------------------------------------------

/**
 * Creates a new Program.
 *
 * @param init - Initial model and command
 * @param update - Function that handles messages and returns new model + commands
 * @param subscriptions - Function that returns subscriptions based on current model
 *
 * @example
 * ```ts
 * const myProgram = program(
 *   [{ count: 0 }, Cmd.none],
 *   (msg, model) => {
 *     switch (msg.type) {
 *       case 'Increment':
 *         return [{ count: model.count + 1 }, Cmd.none]
 *       case 'Decrement':
 *         return [{ count: model.count - 1 }, Cmd.none]
 *     }
 *   },
 *   () => Sub.none
 * )
 * ```
 *
 * @since 0.1.0
 * @category constructors
 */
export const program = <Model, Msg, E = never, R = never>(
  init: readonly [Model, Cmd<Msg, E, R>],
  update: (msg: Msg, model: Model) => readonly [Model, Cmd<Msg, E, R>],
  subscriptions: (model: Model) => Sub<Msg, E, R> = () => subNone
): Effect.Effect<Program<Model, Msg, E, R>, E, R | Scope.Scope> =>
  Effect.gen(function* () {
    const [initialModel, initialCmd] = init

    // State management
    const modelRef = yield* Ref.make(initialModel)
    const msgQueue = yield* Queue.unbounded<Msg>()
    const shutdownRef = yield* Ref.make(false)

    // Dispatch function
    const dispatch: Dispatch<Msg> = (msg) => {
      Effect.runFork(Queue.offer(msgQueue, msg))
    }

    // Process a command
    const processCmd = (cmd: Cmd<Msg, E, R>): Effect.Effect<void, E, R> =>
      pipe(
        cmd,
        Effect.flatMap(optionMsg =>
          Option.match(optionMsg, {
            onNone: () => Effect.void,
            onSome: (msg) => Queue.offer(msgQueue, msg)
          })
        )
      )

    // Process initial command
    yield* processCmd(initialCmd)

    // Main update loop
    const updateLoop: Effect.Effect<never, E, R> = Effect.forever(
      Effect.gen(function* () {
        const isShutdown = yield* Ref.get(shutdownRef)
        if (isShutdown) {
          return yield* Effect.interrupt
        }

        const msg = yield* Queue.take(msgQueue)
        const currentModel = yield* Ref.get(modelRef)
        const [newModel, cmd] = update(msg, currentModel)

        yield* Ref.set(modelRef, newModel)
        yield* processCmd(cmd)
      })
    )

    // Subscription management
    const subscriptionLoop: Effect.Effect<void, E, R> = pipe(
      Stream.fromEffect(Ref.get(modelRef)),
      Stream.concat(
        Stream.repeatEffect(
          pipe(
            Effect.sleep('10 millis'), // Small delay to batch model changes
            Effect.flatMap(() => Ref.get(modelRef))
          )
        )
      ),
      Stream.changes, // Only emit when model actually changes
      Stream.flatMap(model => subscriptions(model)),
      Stream.tap(msg => Queue.offer(msgQueue, msg)),
      Stream.runDrain
    )

    // Start loops in background
    const updateFiber = yield* Effect.forkScoped(updateLoop)
    const subFiber = yield* Effect.forkScoped(subscriptionLoop)

    // Model stream
    const model$ = pipe(
      Stream.fromEffect(Ref.get(modelRef)),
      Stream.concat(
        Stream.repeatEffect(
          pipe(
            Effect.sleep('1 millis'),
            Effect.flatMap(() => Ref.get(modelRef))
          )
        )
      ),
      Stream.changes
    )

    // Shutdown function
    const shutdown = Effect.gen(function* () {
      yield* Ref.set(shutdownRef, true)
      yield* Fiber.interrupt(updateFiber)
      yield* Fiber.interrupt(subFiber)
    })

    return {
      dispatch,
      model$,
      shutdown
    }
  })

/**
 * Creates a Program with initial flags.
 *
 * @since 0.1.0
 * @category constructors
 */
export const programWithFlags = <Flags, Model, Msg, E = never, R = never>(
  init: (flags: Flags) => readonly [Model, Cmd<Msg, E, R>],
  update: (msg: Msg, model: Model) => readonly [Model, Cmd<Msg, E, R>],
  subscriptions: (model: Model) => Sub<Msg, E, R> = () => subNone
): ((flags: Flags) => Effect.Effect<Program<Model, Msg, E, R>, E, R | Scope.Scope>) =>
  (flags) => program(init(flags), update, subscriptions)

// -------------------------------------------------------------------------------------
// running
// -------------------------------------------------------------------------------------

/**
 * Runs the program and returns a stream of model updates.
 *
 * @since 0.1.0
 * @category running
 */
export const run = <Model, Msg, E, R>(
  prog: Program<Model, Msg, E, R>
): Stream.Stream<Model, E, R> => prog.model$

/**
 * Runs the program with a subscriber that receives model updates.
 *
 * @since 0.1.0
 * @category running
 */
export const runWith = <Model, Msg, E, R>(
  onModel: (model: Model) => void
) =>
  (prog: Program<Model, Msg, E, R>): Effect.Effect<void, E, R> =>
    pipe(
      prog.model$,
      Stream.tap(model => Effect.sync(() => onModel(model))),
      Stream.runDrain
    )
