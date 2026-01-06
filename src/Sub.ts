/**
 * Sub represents a subscription - a source of messages from external events.
 *
 * See the [Platform.Sub](https://package.elm-lang.org/packages/elm/core/latest/Platform-Sub) Elm package.
 *
 * @since 0.1.0
 */
import { Stream, pipe, Effect, Schedule } from 'effect'

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * A subscription is a Stream that produces messages over time.
 *
 * The type parameters are:
 * - `Msg` - the message type that can be produced
 * - `E` - the error type (defaults to `never`)
 * - `R` - the required dependencies (defaults to `never`)
 *
 * @since 0.1.0
 * @category model
 */
export type Sub<Msg, E = never, R = never> = Stream.Stream<Msg, E, R>

// -------------------------------------------------------------------------------------
// constructors
// -------------------------------------------------------------------------------------

/**
 * A subscription that produces no messages.
 *
 * @since 0.1.0
 * @category constructors
 */
export const none: Sub<never> = Stream.empty

/**
 * Creates a subscription from a single message.
 *
 * @since 0.1.0
 * @category constructors
 */
export const of = <Msg>(msg: Msg): Sub<Msg> => Stream.succeed(msg)

/**
 * Creates a subscription from an iterable of messages.
 *
 * @since 0.1.0
 * @category constructors
 */
export const fromIterable = <Msg>(msgs: Iterable<Msg>): Sub<Msg> => Stream.fromIterable(msgs)

// -------------------------------------------------------------------------------------
// combinators
// -------------------------------------------------------------------------------------

/**
 * Maps the messages of a subscription into another message type.
 *
 * @since 0.1.0
 * @category combinators
 */
export const map =
  <A, Msg>(f: (a: A) => Msg) =>
  <E, R>(sub: Sub<A, E, R>): Sub<Msg, E, R> =>
    Stream.map(sub, f)

/**
 * Batches multiple subscriptions into a single subscription.
 * Messages from all subscriptions are merged.
 *
 * @since 0.1.0
 * @category combinators
 */
export const batch = <Msg, E, R>(subs: ReadonlyArray<Sub<Msg, E, R>>): Sub<Msg, E, R> => {
  if (subs.length === 0) {
    return none
  }
  if (subs.length === 1) {
    return subs[0]
  }
  return pipe(
    Stream.mergeAll(subs, { concurrency: 'unbounded' })
  )
}

/**
 * Filters messages from a subscription.
 *
 * @since 0.1.0
 * @category combinators
 */
export const filter =
  <Msg>(predicate: (msg: Msg) => boolean) =>
  <E, R>(sub: Sub<Msg, E, R>): Sub<Msg, E, R> =>
    Stream.filter(sub, predicate)

/**
 * Creates a subscription that emits a message at regular intervals.
 *
 * @since 0.1.0
 * @category constructors
 */
export const interval = <Msg>(ms: number, msg: Msg): Sub<Msg> =>
  pipe(
    Stream.repeatEffect(Effect.succeed(msg)),
    Stream.schedule(Schedule.spaced(ms))
  )

/**
 * Creates a subscription from a callback-based event source.
 *
 * @since 0.1.0
 * @category constructors
 */
export const fromCallback = <Msg>(
  register: (emit: (msg: Msg) => void) => () => void
): Sub<Msg> =>
  Stream.async<Msg>((emit) => {
    const cleanup = register((msg) => {
      emit.single(msg)
    })
    return Effect.sync(() => cleanup())
  })
