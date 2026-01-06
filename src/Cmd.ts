/**
 * Cmd represents a command - a description of a side effect that will produce a message.
 *
 * See the [Platform.Cmd](https://package.elm-lang.org/packages/elm/core/latest/Platform-Cmd) Elm package.
 *
 * @since 0.1.0
 */
import { Effect, Option, pipe } from 'effect'

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * A command is an Effect that may produce a message.
 *
 * The type parameters are:
 * - `Msg` - the message type that can be produced
 * - `E` - the error type (defaults to `never` for infallible commands)
 * - `R` - the required dependencies (defaults to `never` for commands with no dependencies)
 *
 * @since 0.1.0
 * @category model
 */
export type Cmd<Msg, E = never, R = never> = Effect.Effect<Option.Option<Msg>, E, R>

// -------------------------------------------------------------------------------------
// constructors
// -------------------------------------------------------------------------------------

/**
 * A command that does nothing.
 *
 * @since 0.1.0
 * @category constructors
 */
export const none: Cmd<never> = Effect.succeed(Option.none())

/**
 * Creates a command that carries the provided message.
 *
 * @since 0.1.0
 * @category constructors
 */
export const of = <Msg>(msg: Msg): Cmd<Msg> => Effect.succeed(Option.some(msg))

// -------------------------------------------------------------------------------------
// combinators
// -------------------------------------------------------------------------------------

/**
 * Maps the carried message of a command into another message.
 *
 * @since 0.1.0
 * @category combinators
 */
export const map =
  <A, Msg>(f: (a: A) => Msg) =>
  <E, R>(cmd: Cmd<A, E, R>): Cmd<Msg, E, R> =>
    Effect.map(cmd, Option.map(f))

/**
 * Batches multiple commands into a single command.
 * All commands are executed concurrently and the first message produced wins.
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
    Effect.all(cmds, { concurrency: 'unbounded' }),
    Effect.map(options => {
      for (const opt of options) {
        if (Option.isSome(opt)) {
          return opt
        }
      }
      return Option.none()
    })
  )
}

/**
 * Batches multiple commands into a single command that collects all messages.
 * All commands are executed concurrently.
 *
 * @since 0.1.0
 * @category combinators
 */
export const batchAll = <Msg, E, R>(
  cmds: ReadonlyArray<Cmd<Msg, E, R>>
): Effect.Effect<ReadonlyArray<Msg>, E, R> => {
  if (cmds.length === 0) {
    return Effect.succeed([])
  }
  return pipe(
    Effect.all(cmds, { concurrency: 'unbounded' }),
    Effect.map(options => options.filter(Option.isSome).map(opt => opt.value))
  )
}
