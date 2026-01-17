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
import { Effect, Stream, pipe } from 'effect'

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
 * @category model
 */
export type Cmd<Msg, E = never, R = never> = Stream.Stream<Msg, E, R>

// -------------------------------------------------------------------------------------
// constructors
// -------------------------------------------------------------------------------------

/**
 * A command that does nothing.
 *
 * @since 0.1.0
 * @category constructors
 */
export const none: Cmd<never> = Stream.empty

/**
 * Creates a command that carries the provided message.
 *
 * @since 0.1.0
 * @category constructors
 */
export const of = <Msg>(msg: Msg): Cmd<Msg> => Stream.make(msg)

/**
 * Creates a command from an Effect that produces a single message.
 *
 * @since 0.1.0
 * @category constructors
 */
export const fromEffect = <Msg, E, R>(effect: Effect.Effect<Msg, E, R>): Cmd<Msg, E, R> =>
  Stream.fromEffect(effect)

// -------------------------------------------------------------------------------------
// combinators
// -------------------------------------------------------------------------------------

/**
 * Maps the carried messages of a command into another message type.
 *
 * @since 0.1.0
 * @category combinators
 */
export const map =
  <A, Msg>(f: (a: A) => Msg) =>
  <E, R>(cmd: Cmd<A, E, R>): Cmd<Msg, E, R> =>
    Stream.map(cmd, f)

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
 * @category combinators
 */
export const batch = <Msg, E, R>(cmds: ReadonlyArray<Cmd<Msg, E, R>>): Cmd<Msg, E, R> => {
  if (cmds.length === 0) {
    return none
  }
  if (cmds.length === 1) {
    return cmds[0]
  }
  return pipe(
    Stream.mergeAll(cmds, { concurrency: 'unbounded' })
  )
}
