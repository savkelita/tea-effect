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
 * @category Model
 */
export type Sub<Msg, E = never, R = never> = Stream.Stream<Msg, E, R>

/**
 * A single keyed subscription stream used by the runtime to diff subscriptions
 * across model changes (keep unchanged ones running, start/stop only the delta).
 *
 * @since 0.6.0
 * @category Model
 */
export interface SubEntry<Msg, E, R> {
  readonly key: string
  readonly stream: Stream.Stream<Msg, E, R>
}

// -------------------------------------------------------------------------------------
// keyed entries (used by Platform for subscription diffing)
// -------------------------------------------------------------------------------------

const entriesMap = new WeakMap<object, ReadonlyArray<SubEntry<any, any, any>>>()
let rawCounter = 0

const withEntries = <Msg, E, R>(
  stream: Stream.Stream<Msg, E, R>,
  entries: ReadonlyArray<SubEntry<Msg, E, R>>
): Sub<Msg, E, R> => {
  entriesMap.set(stream as object, entries)
  return stream
}

const keyed = <Msg, E, R>(key: string, stream: Stream.Stream<Msg, E, R>): Sub<Msg, E, R> =>
  withEntries(stream, [{ key, stream }])

/**
 * Attach a stable key to a raw subscription stream so the runtime keeps it alive
 * across model changes (used by subscriptions whose stream is not built from a
 * keyed constructor, e.g. LocalStorage.onChange).
 *
 * @since 0.6.0
 * @category Model
 */
export const withKey = <Msg, E, R>(key: string, stream: Stream.Stream<Msg, E, R>): Sub<Msg, E, R> =>
  keyed(key, stream)

// Stable per-function id so map/filter over the same source with DIFFERENT
// taggers get DISTINCT keys (else the runtime would drop/misroute one), while a
// referentially-stable tagger keeps a stable key across model changes.
const fnIds = new WeakMap<Function, number>()
let fnCounter = 0
const fnId = (f: Function): number => {
  let id = fnIds.get(f)
  if (id === undefined) {
    id = fnCounter++
    fnIds.set(f, id)
  }
  return id
}

const stableStringify = (value: unknown): string => {
  // Make the serializer injective for values JSON.stringify flattens (NaN /
  // Infinity / null all -> "null"; undefined/function properties dropped), so
  // distinct messages never collide onto the same subscription key.
  const norm = (v: any): any => {
    if (typeof v === 'number' && !Number.isFinite(v)) return { $num: String(v) }
    if (v === undefined) return { $undef: true }
    if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') {
      return { $nonserializable: typeof v }
    }
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) return v.map(norm)
      return Object.keys(v)
        .sort()
        .reduce((acc, k) => {
          acc[k] = norm(v[k])
          return acc
        }, {} as Record<string, unknown>)
    }
    return v
  }
  try {
    return JSON.stringify(norm(value))
  } catch {
    return String(value)
  }
}

/**
 * Get the keyed entries for a subscription. Library constructors attach stable
 * keys; a raw Stream without entries gets one fallback key (memoized by stream
 * identity, so a referentially-stable sub is kept alive across model changes).
 *
 * @since 0.6.0
 * @category Model
 */
export const getSubEntries = <Msg, E, R>(sub: Sub<Msg, E, R>): ReadonlyArray<SubEntry<Msg, E, R>> => {
  const existing = entriesMap.get(sub as object)
  if (existing) return existing as ReadonlyArray<SubEntry<Msg, E, R>>
  const fallback: ReadonlyArray<SubEntry<Msg, E, R>> = [{ key: `raw:${rawCounter++}`, stream: sub }]
  entriesMap.set(sub as object, fallback)
  return fallback
}

// -------------------------------------------------------------------------------------
// constructors
// -------------------------------------------------------------------------------------

/**
 * A subscription that produces no messages.
 *
 * @since 0.1.0
 * @category Constructors
 */
export const none: Sub<never> = withEntries(Stream.empty, [])

/**
 * Creates a subscription from a single message.
 *
 * @since 0.1.0
 * @category Constructors
 */
export const of = <Msg>(msg: Msg): Sub<Msg> => keyed(`of:${stableStringify(msg)}`, Stream.succeed(msg))

/**
 * Creates a subscription from an iterable of messages.
 *
 * @since 0.1.0
 * @category Constructors
 */
export const fromIterable = <Msg>(msgs: Iterable<Msg>): Sub<Msg> => {
  const arr = Array.from(msgs)
  return keyed(`fromIterable:${stableStringify(arr)}`, Stream.fromIterable(arr))
}

/**
 * Creates a subscription that emits a message at regular intervals.
 *
 * @since 0.1.0
 * @category Constructors
 */
export const interval = <Msg>(ms: number, msg: Msg): Sub<Msg> =>
  keyed(
    `interval:${ms}:${stableStringify(msg)}`,
    pipe(Stream.repeatEffect(Effect.succeed(msg)), Stream.schedule(Schedule.spaced(ms)))
  )

/**
 * Creates a subscription from a callback-based event source.
 *
 * Pass a stable `key` so the runtime keeps the source alive across model
 * changes instead of tearing it down and re-registering on every change.
 *
 * @since 0.1.0
 * @category Constructors
 */
export const fromCallback = <Msg>(
  register: (emit: (msg: Msg) => void) => () => void,
  key?: string
): Sub<Msg> => {
  const stream = Stream.async<Msg>((emit) => {
    const cleanup = register((msg) => {
      emit.single(msg)
    })
    return Effect.sync(() => cleanup())
  })
  return key === undefined ? stream : keyed(`callback:${key}`, stream)
}

// -------------------------------------------------------------------------------------
// combinators
// -------------------------------------------------------------------------------------

/**
 * Maps the messages of a subscription into another message type.
 *
 * @since 0.1.0
 * @category Combinators
 */
export const map =
  <A, Msg>(f: (a: A) => Msg) =>
  <E, R>(sub: Sub<A, E, R>): Sub<Msg, E, R> => {
    const entries = getSubEntries(sub).map((e) => ({
      key: `${e.key}:map:${fnId(f)}`,
      stream: Stream.map(e.stream, f)
    }))
    return withEntries(Stream.map(sub, f), entries)
  }

/**
 * Batches multiple subscriptions into a single subscription.
 * Messages from all subscriptions are merged.
 *
 * @since 0.1.0
 * @category Combinators
 */
export const batch = <Msg, E, R>(subs: ReadonlyArray<Sub<Msg, E, R>>): Sub<Msg, E, R> => {
  if (subs.length === 0) {
    return none
  }
  if (subs.length === 1) {
    return subs[0]
  }
  const entries = subs.flatMap((sub) => getSubEntries(sub))
  return withEntries(Stream.mergeAll(subs, { concurrency: 'unbounded' }), entries)
}

/**
 * Filters messages from a subscription.
 *
 * @since 0.1.0
 * @category Combinators
 */
export const filter =
  <Msg>(predicate: (msg: Msg) => boolean) =>
  <E, R>(sub: Sub<Msg, E, R>): Sub<Msg, E, R> => {
    const entries = getSubEntries(sub).map((e) => ({
      key: `${e.key}:filter:${fnId(predicate)}`,
      stream: Stream.filter(e.stream, predicate)
    }))
    return withEntries(Stream.filter(sub, predicate), entries)
  }
