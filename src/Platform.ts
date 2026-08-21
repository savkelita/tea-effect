/**
 * The Platform module is the backbone of tea-effect.
 * It defines the base `program()` and `run()` functions.
 *
 * See the [Platform](https://package.elm-lang.org/packages/elm/core/latest/Platform) Elm package.
 *
 * @since 0.1.0
 */
import { Effect, Stream, SubscriptionRef, Queue, Fiber, pipe, Runtime, Scope, Exit, Deferred, Cause } from 'effect'
import { Cmd } from './Cmd'
import { Sub, none as subNone, getSubEntries } from './Sub'

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
   * Observes the model SYNCHRONOUSLY: the listener is called with the current model
   * right away, and again inside every `dispatch`, before it returns.
   *
   * `model$` delivers the same values through a `Stream`, which is consumed on a fiber
   * and therefore lands a tick later. That is too late for a renderer driving controlled
   * DOM inputs: the browser would still hold the freshly typed text while the view still
   * carries the previous model, and the reconciler would write the old value back.
   *
   * Returns a function that stops the observation.
   */
  readonly subscribe: (listener: (model: Model) => void) => () => void

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

    // Runs an effect right here instead of handing it to a fiber, so `update` and the
    // render it triggers finish inside the DOM event that dispatched the message.
    const runtime = yield* Effect.runtime<R>()
    const runNow = Runtime.runSync(runtime)

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

    const listeners = new Set<(model: Model) => void>()

    const subscribe = (listener: (model: Model) => void): (() => void) => {
      listener(runNow(SubscriptionRef.get(modelRef)))
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }

    // The single path every message takes, whether it came from the view, a command or a
    // subscription. Synchronous on purpose - see `subscribe` on the Program interface.
    const handle = (msg: Msg): void => {
      if (stopped) return
      runNow(
        pipe(
          Effect.gen(function* () {
            const currentModel = yield* SubscriptionRef.get(modelRef)
            const [newModel, cmd] = update(msg, currentModel)
            yield* SubscriptionRef.set(modelRef, newModel)
            yield* Effect.sync(() => {
              for (const listener of listeners) listener(newModel)
            })
            yield* processCmd(cmd)
          }),
          Effect.catchAllCause(surfaceCause)
        )
      )
    }

    const dispatch: Dispatch<Msg> = handle

    // Process initial command
    yield* processCmd(initialCmd)

    // Messages produced by commands and subscriptions arrive on fibers, so they keep
    // going through the queue and stay serialized; the queue no longer decides WHEN a
    // message is applied, only that fiber-produced ones do not interleave.
    const updateLoop: Effect.Effect<never, E, R> = Effect.forever(
      Effect.gen(function* () {
        const isShutdown = yield* SubscriptionRef.get(shutdownRef)
        if (isShutdown) {
          return yield* Effect.interrupt
        }

        const msg = yield* Queue.take(msgQueue)
        yield* Effect.sync(() => handle(msg))
      })
    )

    // Subscription management - diff keyed subscriptions on each model change,
    // keeping unchanged subs running and starting/stopping only the delta (Elm
    // semantics). This avoids restarting timers and re-registering DOM listeners
    // on every message, which switch-restart did.
    const subFibers = new Map<string, { fiber: Fiber.RuntimeFiber<void, never>; count: number }>()
    const diffSubs = (model: Model): Effect.Effect<void, never, R> =>
      Effect.gen(function* () {
        // Group by key so several subscriptions sharing a key (e.g. two batched
        // urlChanges, or a keep-alive DOM source used more than once) all run
        // under one fiber instead of the extras being silently dropped.
        const byKey = new Map<string, Array<Sub<Msg, E, R>>>()
        for (const entry of getSubEntries(subscriptions(model))) {
          const list = byKey.get(entry.key)
          if (list) list.push(entry.stream)
          else byKey.set(entry.key, [entry.stream])
        }
        // Interrupt a key that disappeared, or whose member count changed (a
        // same-key sub was added/removed) so the merged group is rebuilt.
        for (const [key, running] of subFibers) {
          const streams = byKey.get(key)
          if (!streams || streams.length !== running.count) {
            yield* Fiber.interrupt(running.fiber)
            subFibers.delete(key)
          }
        }
        for (const [key, streams] of byKey) {
          if (!subFibers.has(key)) {
            const merged = streams.length === 1
              ? streams[0]
              : Stream.mergeAll(streams, { concurrency: 'unbounded' })
            const fiber = yield* Effect.forkIn(progScope)(
              pipe(
                Stream.runForEach(merged, (msg: Msg) => Queue.offer(msgQueue, msg)),
                Effect.catchAllCause(surfaceCause)
              )
            )
            subFibers.set(key, { fiber, count: streams.length })
          }
        }
      })

    const subscriptionLoop: Effect.Effect<void, never, R> = Stream.runForEach(
      Stream.changes(modelRef.changes),
      diffSubs
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
      subscribe,
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
