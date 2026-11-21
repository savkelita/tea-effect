/**
 * The Platform module is the backbone of tea-effect.
 * It defines the base `program()` and `run()` functions.
 *
 * See the [Platform](https://package.elm-lang.org/packages/elm/core/latest/Platform) Elm package.
 *
 * @since 0.1.0
 */
import { Effect, Stream, SubscriptionRef, Queue, Fiber, FiberMap, pipe, Scope, Exit, Deferred, Cause, Scheduler } from 'effect'
import { Cmd, batch as cmdBatch, getCmdEntries } from './Cmd'
import { Sub, none as subNone, getSubEntries } from './Sub'

// -------------------------------------------------------------------------------------
// commands under a key (Cmd.latest)
// -------------------------------------------------------------------------------------

// One start of a command under a key. The program remembers the latest run of each key;
// a message whose run is no longer that one is dropped instead of reaching `update`.
class Run {
  constructor(readonly key: string) {}
}

// A message of a run, as it waits in the queue.
class RunMsg<Msg> {
  constructor(
    readonly run: Run,
    readonly msg: Msg
  ) {}
}

// Put in the queue when a run finishes, after its last message: once it comes out, no
// message of the run is left waiting, and the program can forget the run.
class RunEnd {
  constructor(readonly run: Run) {}
}

// What waits in the queue: a message, or what a run under a key put there.
type Item<Msg> = Msg | RunMsg<Msg> | RunEnd

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
   * `model$` delivers the same values through a `Stream` consumed on a fiber, so when a
   * value arrives depends on that fiber: often inside `dispatch`, sometimes later. A
   * renderer driving controlled DOM inputs needs the guarantee: otherwise the browser
   * could still hold the freshly typed text while the view carries the previous model,
   * and the reconciler would write the old value back.
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
 * import * as Cmd from 'tea-effect/Cmd'
 * import * as Platform from 'tea-effect/Platform'
 * import * as Sub from 'tea-effect/Sub'
 *
 * type Model = { readonly count: number }
 * type Msg = { readonly type: 'Increment' } | { readonly type: 'Decrement' }
 *
 * const init: readonly [Model, Cmd.Cmd<Msg>] = [{ count: 0 }, Cmd.none]
 *
 * const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
 *   switch (msg.type) {
 *     case 'Increment':
 *       return [{ count: model.count + 1 }, Cmd.none]
 *     case 'Decrement':
 *       return [{ count: model.count - 1 }, Cmd.none]
 *   }
 * }
 *
 * // No view here: Platform is the headless runtime. Use Html/React for rendering.
 * const myProgram = Platform.program(init, update, () => Sub.none)
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
    const msgQueue = yield* Queue.unbounded<Item<Msg>>()

    // Failures/defects from forked cmd, subscription and update fibers would
    // otherwise die unobserved; funnel them here so they surface on model$.
    const errSignal = yield* Deferred.make<never, E>()
    const surfaceCause = (cause: Cause.Cause<E>) =>
      Cause.hasInterruptsOnly(cause) ? Effect.void : Deferred.failCause(errSignal, cause)

    // Program-owned scope so shutdown interrupts in-flight cmd fibers and both
    // loops; closing the ambient scope tears it down too.
    const progScope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(progScope, Exit.void))

    let stopped = false

    // Runs an effect right here instead of handing it to a fiber, so `update` and the
    // render it triggers finish inside the DOM event that dispatched the message.
    const context = yield* Effect.context<R>()
    const runNow = Effect.runSyncWith(context)
    // Cmd fibers forked inside runNow would otherwise inherit its microtask-only scheduler.
    const scheduler = yield* Scheduler.Scheduler

    // Process a command - run the stream and dispatch messages as they arrive
    // Commands are forked so they run concurrently (matching Elm's semantics)
    const runCmd = (cmd: Cmd<Msg, E, R>): Effect.Effect<void, never, R> =>
      pipe(
        cmd,
        Stream.runForEach(msg => Queue.offer(msgQueue, msg)),
        Effect.catchCause(surfaceCause),
        Effect.provideService(Scheduler.Scheduler, scheduler),
        Effect.forkIn(progScope),
        Effect.asVoid
      )

    // Commands made with Cmd.latest. FiberMap interrupts the fiber running under a key
    // when a new one takes the key, and stops them all with the program. The latest run
    // of each key decides which messages still reach `update`: those the replaced fiber
    // had already put in the queue as well. A run is forgotten once its end comes out of
    // the queue, so keys made from ids do not pile up.
    const latestFibers = yield* FiberMap.make<string>().pipe(Scope.provide(progScope))
    const latestRuns = new Map<string, Run>()

    const runLatest = (key: string, cmd: Cmd<Msg, E, R>): Effect.Effect<void, never, R> =>
      Effect.suspend(() => {
        const run = new Run(key)
        latestRuns.set(key, run)
        return pipe(
          cmd,
          Stream.runForEach((msg) => Queue.offer(msgQueue, new RunMsg(run, msg))),
          Effect.andThen(Queue.offer(msgQueue, new RunEnd(run))),
          Effect.catchCause(surfaceCause),
          Effect.provideService(Scheduler.Scheduler, scheduler),
          FiberMap.run(latestFibers, key, { startImmediately: false }),
          Effect.asVoid
        )
      })

    const processCmd = (cmd: Cmd<Msg, E, R>): Effect.Effect<void, never, R> => {
      const entries = getCmdEntries(cmd)
      return entries === undefined
        ? runCmd(cmd)
        : Effect.forEach(
            entries,
            (entry) => (entry.key === undefined ? runCmd(entry.stream) : runLatest(entry.key, entry.stream)),
            { discard: true }
          )
    }

    const isLatest = (run: Run): boolean => latestRuns.get(run.key) === run

    const listeners = new Set<(model: Model) => void>()

    const subscribe = (listener: (model: Model) => void): (() => void) => {
      listener(SubscriptionRef.getUnsafe(modelRef))
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }

    // The single path every message takes, whether it came from the view, a command or a
    // subscription. Synchronous on purpose - see `subscribe` on the Program interface.
    const step = (msg: Msg): Effect.Effect<void, never, R> =>
      pipe(
        Effect.gen(function* () {
          const currentModel = yield* SubscriptionRef.get(modelRef)
          const [newModel, cmd] = update(msg, currentModel)
          yield* SubscriptionRef.set(modelRef, newModel)
          const failures: Array<unknown> = []
          yield* Effect.sync(() => {
            for (const listener of listeners) {
              try {
                listener(newModel)
              } catch (error) {
                failures.push(error)
              }
            }
          })
          yield* processCmd(cmd)
          if (failures.length > 0) yield* Effect.die(failures[0])
        }),
        Effect.catchCause(surfaceCause)
      )

    // A message of a run under a key is checked here, as `update` is about to receive it,
    // not when it leaves the queue: until then a step can still start a newer command
    // under the key.
    const deliver = (item: Item<Msg>): void => {
      if (item instanceof RunMsg) {
        if (isLatest(item.run)) runNow(step(item.msg))
      } else if (item instanceof RunEnd) {
        if (isLatest(item.run)) latestRuns.delete(item.run.key)
      } else {
        runNow(step(item))
      }
    }

    // A dispatch made during a step (a listener, or a model$ consumer resumed inside
    // SubscriptionRef.set while it holds its permit) runs right after that step.
    let handling = false
    const pending: Array<Item<Msg>> = []
    const handle = (item: Item<Msg>): void => {
      if (stopped) return
      if (handling) {
        pending.push(item)
        return
      }
      handling = true
      try {
        deliver(item)
        while (pending.length > 0 && !stopped) deliver(pending.shift()!)
      } finally {
        handling = false
        pending.length = 0
      }
    }

    const dispatch: Dispatch<Msg> = handle

    // Process initial command
    yield* processCmd(initialCmd)

    // Messages produced by commands and subscriptions arrive on fibers, so they keep
    // going through the queue and stay serialized; the queue no longer decides WHEN a
    // message is applied, only that fiber-produced ones do not interleave.
    const updateLoop: Effect.Effect<never, E, R> = Effect.forever(
      Effect.gen(function* () {
        if (stopped) {
          return yield* Effect.interrupt
        }

        const item = yield* Queue.take(msgQueue)
        yield* Effect.sync(() => handle(item))
      }),
      // v4 forever yields to the scheduler (setTimeout(0) in browsers) every iteration.
      { disableYield: true }
    )

    // Subscription management - diff keyed subscriptions on each model change,
    // keeping unchanged subs running and starting/stopping only the delta (Elm
    // semantics). This avoids restarting timers and re-registering DOM listeners
    // on every message, which switch-restart did.
    const subFibers = new Map<string, { fiber: Fiber.Fiber<void, never>; count: number }>()
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
            const merged = cmdBatch(streams)
            // Start now, so a source registers inside this diff rather than a macrotask later.
            const fiber = yield* Effect.forkIn(progScope, { startImmediately: true })(
              pipe(
                Stream.runForEach(merged, (msg: Msg) => Queue.offer(msgQueue, msg)),
                Effect.catchCause(surfaceCause)
              )
            )
            subFibers.set(key, { fiber, count: streams.length })
          }
        }
      })

    const subscriptionLoop: Effect.Effect<void, never, R> = Stream.runForEach(
      // By reference: v4 Stream.changes uses Equal.equals, which compares plain objects deeply.
      Stream.changesWith(SubscriptionRef.changes(modelRef), (a, b) => a === b),
      diffSubs
    )

    // Start loops in the program scope
    yield* Effect.forkIn(progScope)(Effect.catchCause(updateLoop, surfaceCause))
    // Start now, so subscriptions(init) are registered before the initial cmd runs.
    yield* Effect.forkIn(progScope, { startImmediately: true })(Effect.catchCause(subscriptionLoop, surfaceCause))

    // Model stream: SubscriptionRef.changes merged with the error signal, so a
    // failing cmd/sub/update surfaces on model$ (honoring the declared E).
    const model$: Stream.Stream<Model, E, R> = Stream.merge(
      SubscriptionRef.changes(modelRef),
      Stream.fromEffect(Deferred.await(errSignal))
    ) as Stream.Stream<Model, E, R>

    // Shutdown: stop dispatch, shut the queue, and close the program scope
    // (interrupting both loops and every in-flight cmd fiber).
    const shutdown = Effect.gen(function* () {
      stopped = true
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
