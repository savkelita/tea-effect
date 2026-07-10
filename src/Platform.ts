/**
 * The Platform module is the backbone of tea-effect.
 * It defines the base `program()` and `run()` functions.
 *
 * See the [Platform](https://package.elm-lang.org/packages/elm/core/latest/Platform) Elm package.
 *
 * @since 0.1.0
 */
import { Effect, Stream, SubscriptionRef, Queue, pipe, Scope, Exit, Deferred, Cause } from 'effect'
import { Cmd } from './Cmd'
import { Sub, none as subNone } from './Sub'

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * A Dispatch function sends messages to the update loop.
 *
 * @since 0.1.0
 * @category Model
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
 * @category Model
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
 * Uses SubscriptionRef for reactive state management - equivalent to RxJS BehaviorSubject.
 * The model$ stream emits the current value on subscription and all subsequent changes.
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
 * @category Constructors
 */
export const program = <Model, Msg, E = never, R = never>(
  init: readonly [Model, Cmd<Msg, E, R>],
  update: (msg: Msg, model: Model) => readonly [Model, Cmd<Msg, E, R>],
  subscriptions: (model: Model) => Sub<Msg, E, R> = () => subNone
): Effect.Effect<Program<Model, Msg, E, R>, E, R | Scope.Scope> =>
  Effect.gen(function* () {
    const [initialModel, initialCmd] = init

    // State management using SubscriptionRef (like RxJS BehaviorSubject)
    // - Holds current value
    // - changes stream emits current value on subscription + all changes
    const modelRef = yield* SubscriptionRef.make(initialModel)
    const msgQueue = yield* Queue.unbounded<Msg>()
    const shutdownRef = yield* SubscriptionRef.make(false)

    // Failures/defects from forked cmd, subscription and update fibers would
    // otherwise die unobserved; funnel them here so they surface on model$.
    const errSignal = yield* Deferred.make<never, E>()
    const surfaceCause = (cause: Cause.Cause<E>) =>
      Cause.isInterruptedOnly(cause) ? Effect.void : Deferred.failCause(errSignal, cause)

    // Program-owned scope so shutdown interrupts in-flight cmd fibers and both
    // loops; closing the ambient scope tears it down too.
    const progScope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(progScope, Exit.void))

    let stopped = false

    // Dispatch function - adds message to queue (no-op after shutdown)
    const dispatch: Dispatch<Msg> = (msg) => {
      if (stopped) return
      Effect.runSync(Queue.offer(msgQueue, msg))
    }

    // Process a command - run the stream and dispatch messages as they arrive
    // Commands are forked so they run concurrently (matching Elm's semantics)
    const processCmd = (cmd: Cmd<Msg, E, R>): Effect.Effect<void, never, R> =>
      pipe(
        cmd,
        Stream.runForEach(msg => Queue.offer(msgQueue, msg)),
        Effect.catchAllCause(surfaceCause),
        Effect.forkIn(progScope),
        Effect.asVoid
      )

    // Process initial command
    yield* processCmd(initialCmd)

    // Main update loop - processes messages and updates SubscriptionRef
    const updateLoop: Effect.Effect<never, E, R> = Effect.forever(
      Effect.gen(function* () {
        const isShutdown = yield* SubscriptionRef.get(shutdownRef)
        if (isShutdown) {
          return yield* Effect.interrupt
        }

        const msg = yield* Queue.take(msgQueue)
        const currentModel = yield* SubscriptionRef.get(modelRef)
        const [newModel, cmd] = update(msg, currentModel)

        // Update state - this automatically notifies all subscribers
        yield* SubscriptionRef.set(modelRef, newModel)
        yield* processCmd(cmd)
      })
    )

    // Subscription management - reacts to model changes
    // Uses switch: true to cancel previous subscription when model changes
    const subscriptionLoop: Effect.Effect<void, E, R> = pipe(
      modelRef.changes,
      Stream.changes, // Only emit when model actually changes (reference equality)
      Stream.flatMap(model => subscriptions(model), { switch: true }),
      Stream.tap(msg => Queue.offer(msgQueue, msg)),
      Stream.runDrain
    )

    // Start loops in the program scope
    yield* Effect.forkIn(progScope)(Effect.catchAllCause(updateLoop, surfaceCause))
    yield* Effect.forkIn(progScope)(Effect.catchAllCause(subscriptionLoop, surfaceCause))

    // Model stream: SubscriptionRef.changes merged with the error signal, so a
    // failing cmd/sub/update surfaces on model$ (honoring the declared E).
    const model$: Stream.Stream<Model, E, R> = Stream.merge(
      modelRef.changes,
      Stream.fromEffect(Deferred.await(errSignal))
    ) as Stream.Stream<Model, E, R>

    // Shutdown: stop dispatch, shut the queue, and close the program scope
    // (interrupting both loops and every in-flight cmd fiber).
    const shutdown = Effect.gen(function* () {
      stopped = true
      yield* SubscriptionRef.set(shutdownRef, true)
      yield* Queue.shutdown(msgQueue)
      yield* Scope.close(progScope, Exit.void)
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
 * @category Constructors
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
 * @category Running
 */
export const run = <Model, Msg, E, R>(
  prog: Program<Model, Msg, E, R>
): Stream.Stream<Model, E, R> => prog.model$

/**
 * Runs the program with a subscriber that receives model updates.
 *
 * @since 0.1.0
 * @category Running
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
