/**
 * LocalStorage module for TEA applications.
 *
 * Provides commands for reading/writing to browser localStorage with Schema encoding/decoding,
 * and subscriptions for cross-tab synchronization via storage events.
 *
 * @since 0.3.0
 */
import { Effect, Option, Schema, Stream, ParseResult } from 'effect'
import * as Cmd from './Cmd.js'
import * as Sub from './Sub.js'

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
// commands
// -------------------------------------------------------------------------------------

/**
 * Gets an item from localStorage and decodes it using the provided schema.
 *
 * Returns `Option.none()` if the key doesn't exist.
 * Fails with `LocalStorageError` if storage is not available or decoding fails.
 *
 * @since 0.3.0
 * @category commands
 * @example
 * ```ts
 * import * as LocalStorage from 'tea-effect/LocalStorage'
 * import * as Schema from 'effect/Schema'
 *
 * const UserSchema = Schema.Struct({
 *   id: Schema.String,
 *   name: Schema.String
 * })
 *
 * const loadUser = LocalStorage.get(
 *   'user',
 *   UserSchema,
 *   (result) => ({ type: 'UserLoaded', user: result })
 * )
 * ```
 */
export const get = <A, I, Msg>(
  key: string,
  schema: Schema.Schema<A, I>,
  toMsg: (result: Option.Option<A>) => Msg
): Cmd.Cmd<Msg, LocalStorageError> =>
  Effect.gen(function* () {
    const storage = yield* getStorage()
    const raw = storage.getItem(key)

    if (raw === null) {
      return Option.some(toMsg(Option.none()))
    }

    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as I,
      catch: (error) => jsonParseError(key, error)
    })

    const decoded = yield* Schema.decode(schema)(parsed).pipe(
      Effect.mapError((error) => decodeError(key, error))
    )

    return Option.some(toMsg(Option.some(decoded)))
  })

/**
 * Gets a raw string from localStorage without decoding.
 *
 * Returns `Option.none()` if the key doesn't exist.
 *
 * @since 0.3.0
 * @category commands
 */
export const getRaw = <Msg>(
  key: string,
  toMsg: (result: Option.Option<string>) => Msg
): Cmd.Cmd<Msg, LocalStorageError> =>
  Effect.gen(function* () {
    const storage = yield* getStorage()
    const raw = storage.getItem(key)
    return Option.some(toMsg(raw === null ? Option.none() : Option.some(raw)))
  })

/**
 * Sets an item in localStorage, encoding it using the provided schema.
 *
 * @since 0.3.0
 * @category commands
 * @example
 * ```ts
 * import * as LocalStorage from 'tea-effect/LocalStorage'
 * import * as Schema from 'effect/Schema'
 *
 * const UserSchema = Schema.Struct({
 *   id: Schema.String,
 *   name: Schema.String
 * })
 *
 * const saveUser = (user: User) =>
 *   LocalStorage.set('user', UserSchema, user)
 * ```
 */
export const set = <A, I>(
  key: string,
  schema: Schema.Schema<A, I>,
  value: A
): Cmd.Cmd<never, LocalStorageError> =>
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

    return Option.none()
  })

/**
 * Sets a raw string in localStorage without encoding.
 *
 * @since 0.3.0
 * @category commands
 */
export const setRaw = (
  key: string,
  value: string
): Cmd.Cmd<never, LocalStorageError> =>
  Effect.gen(function* () {
    const storage = yield* getStorage()

    yield* Effect.try({
      try: () => storage.setItem(key, value),
      catch: (error) =>
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? quotaExceeded(key)
          : storageNotAvailable
    })

    return Option.none()
  })

/**
 * Removes an item from localStorage.
 *
 * @since 0.3.0
 * @category commands
 */
export const remove = (key: string): Cmd.Cmd<never, LocalStorageError> =>
  Effect.gen(function* () {
    const storage = yield* getStorage()
    storage.removeItem(key)
    return Option.none()
  })

/**
 * Clears all items from localStorage.
 *
 * @since 0.3.0
 * @category commands
 */
export const clear: Cmd.Cmd<never, LocalStorageError> =
  Effect.gen(function* () {
    const storage = yield* getStorage()
    storage.clear()
    return Option.none()
  })

/**
 * Gets all keys currently in localStorage.
 *
 * @since 0.3.0
 * @category commands
 */
export const keys = <Msg>(
  toMsg: (keys: ReadonlyArray<string>) => Msg
): Cmd.Cmd<Msg, LocalStorageError> =>
  Effect.gen(function* () {
    const storage = yield* getStorage()
    const result: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key !== null) {
        result.push(key)
      }
    }
    return Option.some(toMsg(result))
  })

/**
 * Gets the number of items in localStorage.
 *
 * @since 0.3.0
 * @category commands
 */
export const length = <Msg>(
  toMsg: (length: number) => Msg
): Cmd.Cmd<Msg, LocalStorageError> =>
  Effect.gen(function* () {
    const storage = yield* getStorage()
    return Option.some(toMsg(storage.length))
  })

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
 * import * as LocalStorage from 'tea-effect/LocalStorage'
 * import * as Schema from 'effect/Schema'
 *
 * const UserSchema = Schema.Struct({
 *   id: Schema.String,
 *   name: Schema.String
 * })
 *
 * // In your subscriptions function:
 * const subscriptions = (model: Model) =>
 *   LocalStorage.onChange('user', UserSchema, (result) => ({
 *     type: 'UserChangedInOtherTab',
 *     user: result
 *   }))
 * ```
 */
export const onChange = <A, I, Msg>(
  key: string,
  schema: Schema.Schema<A, I>,
  toMsg: (result: Option.Option<A>) => Msg
): Sub.Sub<Msg, LocalStorageError> =>
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
        return Effect.succeed(toMsg(Option.none()))
      }

      return Effect.gen(function* () {
        const parsed = yield* Effect.try({
          try: () => JSON.parse(event.newValue!) as I,
          catch: (error) => jsonParseError(key, error)
        })

        const decoded = yield* Schema.decode(schema)(parsed).pipe(
          Effect.mapError((error) => decodeError(key, error))
        )

        return toMsg(Option.some(decoded))
      })
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
