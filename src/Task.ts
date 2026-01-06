/**
 * Task represents a side effect that will eventually produce a value.
 *
 * See the [Task](https://package.elm-lang.org/packages/elm/core/latest/Task) Elm package.
 *
 * In elm-ts, Task was based on fp-ts Task/TaskEither.
 * In tea-effect, Task IS Effect - they are the same thing.
 *
 * @since 0.1.0
 */
import { Effect, Option, Either, pipe } from 'effect'
import { Cmd } from './Cmd'

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * A Task is just an alias for Effect.
 * This provides familiar naming for those coming from Elm/elm-ts.
 *
 * @since 0.1.0
 * @category model
 */
export type Task<A, E = never, R = never> = Effect.Effect<A, E, R>

// -------------------------------------------------------------------------------------
// constructors
// -------------------------------------------------------------------------------------

/**
 * Creates a Task that succeeds with the given value.
 *
 * @since 0.1.0
 * @category constructors
 */
export const succeed = <A>(a: A): Task<A> => Effect.succeed(a)

/**
 * Creates a Task that fails with the given error.
 *
 * @since 0.1.0
 * @category constructors
 */
export const fail = <E>(e: E): Task<never, E> => Effect.fail(e)

// -------------------------------------------------------------------------------------
// conversions to Cmd
// -------------------------------------------------------------------------------------

/**
 * Executes a Task (that cannot fail) as a Cmd, mapping the result to a Msg.
 *
 * Use this when your Task always succeeds.
 *
 * @example
 * ```ts
 * const getTimeCmd = Task.perform(
 *   (time) => ({ type: 'GotTime', time }),
 *   Effect.sync(() => Date.now())
 * )
 * ```
 *
 * @since 0.1.0
 * @category conversions
 */
export const perform = <A, Msg>(f: (a: A) => Msg) =>
  <R>(task: Task<A, never, R>): Cmd<Msg, never, R> =>
    pipe(
      task,
      Effect.map(a => Option.some(f(a)))
    )

/**
 * Executes a Task that can fail as a Cmd, mapping both success and failure to a Msg.
 *
 * @example
 * ```ts
 * const fetchUserCmd = Task.attempt(
 *   Either.match({
 *     onLeft: (error) => ({ type: 'FetchFailed', error }),
 *     onRight: (user) => ({ type: 'FetchSucceeded', user })
 *   }),
 *   fetchUser(userId)
 * )
 * ```
 *
 * @since 0.1.0
 * @category conversions
 */
export const attempt = <E, A, Msg>(f: (result: Either.Either<A, E>) => Msg) =>
  <R>(task: Task<A, E, R>): Cmd<Msg, never, R> =>
    pipe(
      task,
      Effect.either,
      Effect.map(either => Option.some(f(either)))
    )

/**
 * Alternative to `attempt` with separate handlers for success and failure.
 *
 * @example
 * ```ts
 * const fetchUserCmd = pipe(
 *   fetchUser(userId),
 *   Task.attemptWith({
 *     onSuccess: (user) => ({ type: 'FetchSucceeded', user }),
 *     onFailure: (error) => ({ type: 'FetchFailed', error })
 *   })
 * )
 * ```
 *
 * @since 0.1.0
 * @category conversions
 */
export const attemptWith = <A, E, Msg, R>(handlers: {
  readonly onSuccess: (a: A) => Msg
  readonly onFailure: (e: E) => Msg
}): ((task: Task<A, E, R>) => Cmd<Msg, never, R>) =>
  (task) =>
    attempt(
      Either.match({
        onLeft: handlers.onFailure,
        onRight: handlers.onSuccess
      })
    )(task)

// -------------------------------------------------------------------------------------
// combinators
// -------------------------------------------------------------------------------------

/**
 * Maps the success value of a Task.
 *
 * @since 0.1.0
 * @category combinators
 */
export const map = <A, B>(f: (a: A) => B) =>
  <E, R>(task: Task<A, E, R>): Task<B, E, R> =>
    Effect.map(task, f)

/**
 * Maps the error value of a Task.
 *
 * @since 0.1.0
 * @category combinators
 */
export const mapError = <E, E2>(f: (e: E) => E2) =>
  <A, R>(task: Task<A, E, R>): Task<A, E2, R> =>
    Effect.mapError(task, f)

/**
 * Chains Tasks sequentially.
 *
 * @since 0.1.0
 * @category combinators
 */
export const flatMap = <A, B, E2, R2>(f: (a: A) => Task<B, E2, R2>) =>
  <E, R>(task: Task<A, E, R>): Task<B, E | E2, R | R2> =>
    Effect.flatMap(task, f)

/**
 * Provides error recovery for a Task.
 *
 * @since 0.1.0
 * @category combinators
 */
export const catchAll = <E, A2, E2, R2>(f: (e: E) => Task<A2, E2, R2>) =>
  <A, R>(task: Task<A, E, R>): Task<A | A2, E2, R | R2> =>
    Effect.catchAll(task, f)

/**
 * Runs two Tasks concurrently and returns both results.
 *
 * @since 0.1.0
 * @category combinators
 */
export const both = <A, E, R, B, E2, R2>(
  taskA: Task<A, E, R>,
  taskB: Task<B, E2, R2>
): Task<readonly [A, B], E | E2, R | R2> =>
  Effect.all([taskA, taskB], { concurrency: 2 }) as Task<readonly [A, B], E | E2, R | R2>

/**
 * Runs all Tasks concurrently and returns all results.
 *
 * @since 0.1.0
 * @category combinators
 */
export const all = <A, E, R>(
  tasks: ReadonlyArray<Task<A, E, R>>
): Task<ReadonlyArray<A>, E, R> =>
  Effect.all(tasks, { concurrency: 'unbounded' })
