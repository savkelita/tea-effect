/**
 * LocalStorage module for TEA applications.
 *
 * Provides commands for reading/writing to browser localStorage with Schema encoding/decoding,
 * and subscriptions for cross-tab synchronization via storage events.
 *
 * Follows the same pattern as Http module with onSuccess/onError handlers.
 *
 * @since 0.3.0
 */
import { Effect, Option, Schema, Stream, ParseResult } from 'effect'
import type { Cmd } from './Cmd'
import * as Sub from './Sub'

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * Error that can occur during localStorage operations.
 *
 * @since 0.3.0
 * @category model
 */
export type LocalStorageError =
  | { readonly _tag: 'StorageNotAvailable' }
  | { readonly _tag: 'QuotaExceeded'; readonly key: string }
  | { readonly _tag: 'JsonParseError'; readonly key: string; readonly error: unknown }
  | { readonly _tag: 'DecodeError'; readonly key: string; readonly error: ParseResult.ParseError }
  | { readonly _tag: 'EncodeError'; readonly key: string; readonly error: ParseResult.ParseError }

/**
 * Constructs a StorageNotAvailable error.
 *
 * @since 0.3.0
 * @category constructors
 */
export const storageNotAvailable: LocalStorageError = { _tag: 'StorageNotAvailable' }

/**
 * Constructs a QuotaExceeded error.
 *
 * @since 0.3.0
 * @category constructors
 */
export const quotaExceeded = (key: string): LocalStorageError => ({ _tag: 'QuotaExceeded', key })

/**
 * Constructs a JsonParseError.
 *
 * @since 0.3.0
 * @category constructors
 */
export const jsonParseError = (key: string, error: unknown): LocalStorageError => ({
  _tag: 'JsonParseError',
  key,
  error
})

/**
 * Constructs a DecodeError.
 *
 * @since 0.3.0
 * @category constructors
 */
export const decodeError = (key: string, error: ParseResult.ParseError): LocalStorageError => ({
  _tag: 'DecodeError',
  key,
  error
})

/**
 * Constructs an EncodeError.
 *
 * @since 0.3.0
 * @category constructors
 */
export const encodeError = (key: string, error: ParseResult.ParseError): LocalStorageError => ({
  _tag: 'EncodeError',
  key,
  error
})

// -------------------------------------------------------------------------------------
// internal
// -------------------------------------------------------------------------------------

const getStorage = (): Effect.Effect<Storage, LocalStorageError> =>
  Effect.try({
    try: () => {
      if (typeof window === 'undefined' || !window.localStorage) {
        throw new Error('localStorage not available')
      }
      return window.localStorage
    },
    catch: () => storageNotAvailable
  })

// -------------------------------------------------------------------------------------
// tasks (raw Effect operations)
// -------------------------------------------------------------------------------------

/**
 * Task that gets an item from localStorage and decodes it using the provided schema.
 * Returns `Option.none()` if the key doesn't exist.
 *
 * Use this for testing or when you need raw Effect access.
 * For normal usage, prefer `get` with handlers.
 *
 * @since 0.4.0
 * @category tasks
 */
export const getTask = <A, I>(
  key: string,
  schema: Schema.Schema<A, I>
): Effect.Effect<Option.Option<A>, LocalStorageError> =>
  Effect.gen(function* () {
    const storage = yield* getStorage()
    const raw = storage.getItem(key)

    if (raw === null) {
      return Option.none()
    }

    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as I,
      catch: (error) => jsonParseError(key, error)
    })

    const decoded = yield* Schema.decode(schema)(parsed).pipe(
      Effect.mapError((error) => decodeError(key, error))
    )

    return Option.some(decoded)
  })

/**
 * Task that sets an item in localStorage, encoding it using the provided schema.
 *
 * Use this for testing or when you need raw Effect access.
 * For normal usage, prefer `set` with handlers.
 *
 * @since 0.4.0
 * @category tasks
 */
export const setTask = <A, I>(
  key: string,
  schema: Schema.Schema<A, I>,
  value: A
): Effect.Effect<void, LocalStorageError> =>
  Effect.gen(function* () {
    const storage = yield* getStorage()

    const encoded = yield* Schema.encode(schema)(value).pipe(
      Effect.mapError((error) => encodeError(key, error))
    )

    yield* Effect.try({
      try: () => storage.setItem(key, JSON.stringify(encoded)),
      catch: (error) =>
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? quotaExceeded(key)
          : storageNotAvailable
    })
  })

/**
 * Task that removes an item from localStorage.
 *
 * @since 0.4.0
 * @category tasks
 */
export const removeTask = (key: string): Effect.Effect<void, LocalStorageError> =>
  Effect.gen(function* () {
    const storage = yield* getStorage()
    storage.removeItem(key)
  })

/**
 * Task that clears all items from localStorage.
 *
 * @since 0.4.0
 * @category tasks
 */
export const clearTask: Effect.Effect<void, LocalStorageError> =
  Effect.gen(function* () {
    const storage = yield* getStorage()
    storage.clear()
  })

/**
 * Task that gets all keys currently in localStorage.
 *
 * @since 0.4.0
 * @category tasks
 */
export const keysTask: Effect.Effect<ReadonlyArray<string>, LocalStorageError> =
  Effect.gen(function* () {
    const storage = yield* getStorage()
    const result: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key !== null) {
        result.push(key)
      }
    }
    return result
  })

// -------------------------------------------------------------------------------------
// commands (with handlers, like Http.send)
// -------------------------------------------------------------------------------------

/**
 * Gets an item from localStorage and decodes it using the provided schema.
 * Returns `Option.none()` if the key doesn't exist.
 *
 * Follows the same pattern as `Http.send` with onSuccess/onError handlers.
 *
 * @since 0.4.0
 * @category commands
 * @example
 * ```ts
 * const Counter = Schema.Struct({ count: Schema.Number })
 *
 * const loadCounter = LocalStorage.get('counter', Counter, {
 *   onSuccess: (data) => ({ type: 'Loaded', data }),
 *   onError: (err) => ({ type: 'StorageError', err })
 * })
 * ```
 */
export const get = <A, I, Msg>(
  key: string,
  schema: Schema.Schema<A, I>,
  handlers: {
    readonly onSuccess: (data: Option.Option<A>) => Msg
    readonly onError: (error: LocalStorageError) => Msg
  }
): Cmd<Msg> =>
  Stream.fromEffect(
    Effect.match(getTask(key, schema), {
      onSuccess: (data) => handlers.onSuccess(data),
      onFailure: (error) => handlers.onError(error)
    })
  )

/**
 * Sets an item in localStorage, encoding it using the provided schema.
 *
 * Follows the same pattern as `Http.send` with onSuccess/onError handlers.
 *
 * @since 0.4.0
 * @category commands
 * @example
 * ```ts
 * const Counter = Schema.Struct({ count: Schema.Number })
 *
 * const saveCounter = LocalStorage.set('counter', Counter, { count: 5 }, {
 *   onSuccess: () => ({ type: 'Saved' }),
 *   onError: (err) => ({ type: 'StorageError', err })
 * })
 * ```
 */
export const set = <A, I, Msg>(
  key: string,
  schema: Schema.Schema<A, I>,
  value: A,
  handlers: {
    readonly onSuccess: () => Msg
    readonly onError: (error: LocalStorageError) => Msg
  }
): Cmd<Msg> =>
  Stream.fromEffect(
    Effect.match(setTask(key, schema, value), {
      onSuccess: () => handlers.onSuccess(),
      onFailure: (error) => handlers.onError(error)
    })
  )

/**
 * Sets an item in localStorage without requiring error handling.
 * Errors are silently ignored - use this for fire-and-forget operations.
 *
 * @since 0.4.0
 * @category commands
 * @example
 * ```ts
 * // Fire and forget - no message produced
 * const saveCounter = LocalStorage.setIgnoreErrors('counter', Counter, { count: 5 })
 * ```
 */
export const setIgnoreErrors = <A, I>(
  key: string,
  schema: Schema.Schema<A, I>,
  value: A
): Cmd<never> =>
  Stream.execute(Effect.ignore(setTask(key, schema, value)))

/**
 * Removes an item from localStorage.
 *
 * @since 0.4.0
 * @category commands
 */
export const remove = <Msg>(
  key: string,
  handlers: {
    readonly onSuccess: () => Msg
    readonly onError: (error: LocalStorageError) => Msg
  }
): Cmd<Msg> =>
  Stream.fromEffect(
    Effect.match(removeTask(key), {
      onSuccess: () => handlers.onSuccess(),
      onFailure: (error) => handlers.onError(error)
    })
  )

/**
 * Removes an item from localStorage without requiring error handling.
 *
 * @since 0.4.0
 * @category commands
 */
export const removeIgnoreErrors = (key: string): Cmd<never> =>
  Stream.execute(Effect.ignore(removeTask(key)))

/**
 * Clears all items from localStorage.
 *
 * @since 0.4.0
 * @category commands
 */
export const clear = <Msg>(handlers: {
  readonly onSuccess: () => Msg
  readonly onError: (error: LocalStorageError) => Msg
}): Cmd<Msg> =>
  Stream.fromEffect(
    Effect.match(clearTask, {
      onSuccess: () => handlers.onSuccess(),
      onFailure: (error) => handlers.onError(error)
    })
  )

/**
 * Gets all keys currently in localStorage.
 *
 * @since 0.4.0
 * @category commands
 */
export const keys = <Msg>(handlers: {
  readonly onSuccess: (keys: ReadonlyArray<string>) => Msg
  readonly onError: (error: LocalStorageError) => Msg
}): Cmd<Msg> =>
  Stream.fromEffect(
    Effect.match(keysTask, {
      onSuccess: (ks) => handlers.onSuccess(ks),
      onFailure: (error) => handlers.onError(error)
    })
  )

// -------------------------------------------------------------------------------------
// subscriptions
// -------------------------------------------------------------------------------------

/**
 * Subscribes to changes for a specific key from OTHER browser tabs/windows.
 *
 * Note: The storage event only fires when the change is made by ANOTHER document
 * (i.e., another tab or window). Changes made in the current document do not trigger this event.
 *
 * @since 0.3.0
 * @category subscriptions
 * @example
 * ```ts
 * const Counter = Schema.Struct({ count: Schema.Number })
 *
 * const subscriptions = (model: Model) =>
 *   LocalStorage.onChange('counter', Counter, {
 *     onSuccess: (data) => ({ type: 'SyncedFromOtherTab', data }),
 *     onError: (err) => ({ type: 'SyncError', err })
 *   })
 * ```
 */
export const onChange = <A, I, Msg>(
  key: string,
  schema: Schema.Schema<A, I>,
  handlers: {
    readonly onSuccess: (data: Option.Option<A>) => Msg
    readonly onError: (error: LocalStorageError) => Msg
  }
): Sub.Sub<Msg> =>
  Stream.asyncPush<StorageEvent>((emit) =>
    Effect.sync(() => {
      const handler = (event: StorageEvent) => {
        if (event.key === key || event.key === null) {
          emit.single(event)
        }
      }
      window.addEventListener('storage', handler)
      return Effect.sync(() => window.removeEventListener('storage', handler))
    })
  ).pipe(
    Stream.mapEffect((event) => {
      if (event.newValue === null) {
        return Effect.succeed(handlers.onSuccess(Option.none()))
      }

      return Effect.gen(function* () {
        const parsed = yield* Effect.try({
          try: () => JSON.parse(event.newValue!) as I,
          catch: (error) => jsonParseError(key, error)
        })

        const decoded = yield* Schema.decode(schema)(parsed).pipe(
          Effect.mapError((error) => decodeError(key, error))
        )

        return handlers.onSuccess(Option.some(decoded))
      }).pipe(
        Effect.catchAll((error) => Effect.succeed(handlers.onError(error)))
      )
    })
  )

/**
 * Subscribes to raw string changes for a specific key from OTHER browser tabs/windows.
 *
 * @since 0.3.0
 * @category subscriptions
 */
export const onChangeRaw = <Msg>(
  key: string,
  toMsg: (result: Option.Option<string>) => Msg
): Sub.Sub<Msg> =>
  Sub.fromCallback<Msg>((emit) => {
    const handler = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        emit(toMsg(event.newValue === null ? Option.none() : Option.some(event.newValue)))
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  })

/**
 * Subscribes to ALL storage changes from OTHER browser tabs/windows.
 *
 * @since 0.3.0
 * @category subscriptions
 */
export const onAnyChange = <Msg>(
  toMsg: (event: { key: Option.Option<string>; newValue: Option.Option<string>; oldValue: Option.Option<string> }) => Msg
): Sub.Sub<Msg> =>
  Sub.fromCallback<Msg>((emit) => {
    const handler = (event: StorageEvent) => {
      emit(toMsg({
        key: event.key === null ? Option.none() : Option.some(event.key),
        newValue: event.newValue === null ? Option.none() : Option.some(event.newValue),
        oldValue: event.oldValue === null ? Option.none() : Option.some(event.oldValue)
      }))
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  })
