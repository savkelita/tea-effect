/**
 * Cmd represents a command - a description of a side effect that will produce messages.
 *
 * A Cmd is a Stream that emits messages as effects complete. When commands are batched,
 * they run concurrently and messages are dispatched as each command finishes - there are
 * no ordering guarantees (matching Elm's semantics).
 *
 * See the [Platform.Cmd](https://package.elm-lang.org/packages/elm/core/latest/Platform-Cmd) Elm package.
 *
 * @since 0.1.0
 */
import { Cause, Effect, Exit, Queue, Stream, pipe } from 'effect'

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * A command is a Stream that produces messages as effects complete.
 *
 * Commands are executed concurrently when batched, and messages are dispatched
 * as each command finishes (no ordering guarantees).
 *
 * The type parameters are:
 * - `Msg` - the message type that can be produced
 * - `E` - the error type (defaults to `never` for infallible commands)
 * - `R` - the required dependencies (defaults to `never` for commands with no dependencies)
 *
 * @since 0.1.0
 * @category Model
 */
export type Cmd<Msg, E = never, R = never> = Stream.Stream<Msg, E, R>

/**
 * One part of a command as the runtime runs it: its stream, and the key it runs
 * under when it was made with `latest` (`undefined` otherwise).
 *
 * @since 0.12.0
 * @category Model
 */
export interface CmdEntry<Msg, E, R> {
  readonly key: string | undefined
  readonly stream: Stream.Stream<Msg, E, R>
}

// -------------------------------------------------------------------------------------
// keyed entries (used by Platform to replace a command running under the same key)
// -------------------------------------------------------------------------------------

const entriesMap = new WeakMap<object, ReadonlyArray<CmdEntry<any, any, any>>>()

const withEntries = <Msg, E, R>(cmd: Cmd<Msg, E, R>, entries: ReadonlyArray<CmdEntry<Msg, E, R>>): Cmd<Msg, E, R> => {
  entriesMap.set(cmd as object, entries)
  return cmd
}

/**
 * The parts of a command for the runtime to run one by one, or `undefined` when no
 * part has a key: the runtime then runs the command as a single stream, as it always
 * did.
 *
 * @since 0.12.0
 * @category Model
 */
export const getCmdEntries = <Msg, E, R>(cmd: Cmd<Msg, E, R>): ReadonlyArray<CmdEntry<Msg, E, R>> | undefined =>
  entriesMap.get(cmd as object) as ReadonlyArray<CmdEntry<Msg, E, R>> | undefined

const entriesOf = <Msg, E, R>(cmd: Cmd<Msg, E, R>): ReadonlyArray<CmdEntry<Msg, E, R>> =>
  getCmdEntries(cmd) ?? [{ key: undefined, stream: cmd }]

// -------------------------------------------------------------------------------------
// constructors
// -------------------------------------------------------------------------------------

/**
 * A command that does nothing.
 *
 * @since 0.1.0
 * @category Constructors
 */
export const none: Cmd<never> = Stream.empty

/**
 * Creates a command that carries the provided message.
 *
 * @since 0.1.0
 * @category Constructors
 */
export const of = <Msg>(msg: Msg): Cmd<Msg> => Stream.make(msg)

/**
 * Creates a command from an Effect that produces a single message.
 *
 * @since 0.1.0
 * @category Constructors
 */
export const fromEffect = <Msg, E, R>(effect: Effect.Effect<Msg, E, R>): Cmd<Msg, E, R> =>
  Stream.fromEffect(effect)

// -------------------------------------------------------------------------------------
// combinators
// -------------------------------------------------------------------------------------

/**
 * Maps the carried messages of a command into another message type.
 *
 * `none` maps to `none` itself: a parent that wires a child's commands through
 * `map` keeps "this branch does nothing" visible, instead of handing back a
 * wrapper around an empty stream.
 *
 * @since 0.1.0
 * @category Combinators
 */
export const map =
  <A, Msg>(f: (a: A) => Msg) =>
  <E, R>(cmd: Cmd<A, E, R>): Cmd<Msg, E, R> => {
    if (cmd === none) return none
    const mapped = Stream.map(cmd, f)
    const entries = getCmdEntries(cmd)
    // The key names where a result goes, not what type it has: mapping keeps it.
    return entries === undefined
      ? mapped
      : withEntries(mapped, entries.map((entry) => ({ key: entry.key, stream: Stream.map(entry.stream, f) })))
  }

// Stream.mergeAll with unbounded concurrency, except that every stream starts while the
// merged one does: mergeAll forks them to start a scheduler tick later.
const mergeNow = <A, E, R>(streams: ReadonlyArray<Stream.Stream<A, E, R>>): Stream.Stream<A, E, R> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<A, E | Cause.Done>()
      yield* Effect.addFinalizer(() => Queue.shutdown(queue))
      let running = streams.length
      if (running === 0) yield* Queue.end(queue)
      for (const stream of streams) {
        yield* pipe(
          Stream.runForEach(stream, (a) => Queue.offer(queue, a)),
          Effect.exit,
          Effect.flatMap((exit) =>
            Exit.isSuccess(exit)
              ? --running === 0 ? Queue.end(queue) : Effect.void
              : Queue.failCause(queue, exit.cause)
          ),
          Effect.forkScoped({ startImmediately: true })
        )
      }
      return Stream.fromQueue(queue)
    })
  )

/**
 * Batches multiple commands into a single command.
 *
 * All commands are executed concurrently and messages are dispatched as each
 * command finishes. There are no ordering guarantees about the results.
 *
 * This matches Elm's Cmd.batch semantics: "Each is handed to the runtime at
 * the same time, and since each can perform arbitrary operations in the world,
 * there are no ordering guarantees about the results."
 *
 * @since 0.1.0
 * @category Combinators
 */
export const batch = <Msg, E, R>(cmds: ReadonlyArray<Cmd<Msg, E, R>>): Cmd<Msg, E, R> => {
  const active = cmds.filter((cmd) => cmd !== none)
  if (active.length === 0) {
    return none
  }
  if (active.length === 1) {
    return active[0]
  }
  const merged = mergeNow(active)
  return active.some((cmd) => getCmdEntries(cmd) !== undefined) ? withEntries(merged, active.flatMap(entriesOf)) : merged
}

/**
 * Runs a command under a key, so that only the latest command with that key
 * delivers messages.
 *
 * When the runtime starts a command under a key while an earlier one with the same
 * key is still running, it interrupts the earlier one - an HTTP request is aborted -
 * and drops every message the earlier one produced that `update` has not received
 * yet. Commands under other keys, and commands without a key, are not affected.
 *
 * Use it for reads whose answer replaces the previous one - a list, a search, a
 * debounce timer - when the same command can be issued again before the earlier one
 * finishes, for example on a refresh. Do not use it for writes: a newer command would
 * cancel a save.
 *
 * The key names the place the result goes, not the request: `'users/list'`. A
 * module that runs in several places at once needs one key per place, so its parent
 * passes the key in. `map` keeps the key, and in one `batch` the last command with a
 * key wins; a `Stream` operator applied to the command gives back one without the
 * key. `latest` over a command that already has keys puts the whole command under the
 * new key. `latest(key)(Cmd.none)` stops whatever runs under `key`.
 *
 * Outside a program - running the command as a `Stream` in a test - it is just the
 * command, and every message arrives.
 *
 * @example
 * ```ts
 * import { Schema, pipe } from 'effect'
 * import * as Cmd from 'tea-effect/Cmd'
 * import * as Http from 'tea-effect/Http'
 *
 * const User = Schema.Struct({ id: Schema.Number, name: Schema.String })
 * type User = Schema.Schema.Type<typeof User>
 *
 * type Msg =
 *   | { readonly type: 'UsersLoaded'; readonly users: ReadonlyArray<User> }
 *   | { readonly type: 'UsersFailed'; readonly error: Http.HttpError }
 *
 * // A refresh sends the same request again. Only the answer to the last one arrives:
 * // an earlier request still in flight is aborted.
 * const loadUsers: Cmd.Cmd<Msg> = pipe(
 *   Http.send(Http.get('/api/users', Http.expectJson(Schema.Array(User))), {
 *     onSuccess: (users): Msg => ({ type: 'UsersLoaded', users }),
 *     onError: (error): Msg => ({ type: 'UsersFailed', error })
 *   }),
 *   Cmd.latest('users/list')
 * )
 * ```
 *
 * @since 0.12.0
 * @category Combinators
 */
export const latest =
  (key: string) =>
  <Msg, E, R>(cmd: Cmd<Msg, E, R>): Cmd<Msg, E, R> =>
    // A stream of its own even for `none`: "nothing" under a key still replaces what runs under it.
    withEntries(Stream.suspend(() => cmd), [{ key, stream: cmd }])
